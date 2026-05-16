/**
 * OwnTracks coordinator.
 *
 * 責務:
 *  1. MQTT subscriber を起動して LocationEvent を受ける
 *  2. 各 event を即時 relay target (Actio 等) に投げる
 *  3. LocationBuffer に蓄積 → 5 分 flush → 集計 relay target (Memoria 等) に投げる
 *
 * Cernere モード OFF でも動作する. relay target はそれぞれ独立に enable/disable.
 *
 * userId 解決:
 *  - LEGATUS_OWNER_USER_ID が設定されていればそれを使う (ローカル運用想定)
 *  - 無ければ Cernere session store (popup ログイン後の値) を使う
 *  - どちらも無ければ event を drop
 */

import { createChildLogger } from "../../shared/logger.js";
import { startOwntracksClient, type OwntracksClientHandle } from "./client.js";
import { LocationBuffer } from "./buffer.js";
import { randomUUID } from "node:crypto";
import type { CernereSessionStore } from "../auth/cernere-session.js";
import type { AuditLog } from "../audit/audit-log.js";
import type { OwntracksRuntimeConfig } from "./config.js";
import type { LocationEvent, LocationSummary } from "./types.js";

const log = createChildLogger("owntracks-coord");

export interface RelayTarget {
  name: string;
  /** event ごとに即時 relay (例: Actio Placement). 不要なら省略. */
  forwardEvent?: (event: LocationEvent, userId: string) => Promise<RelayResult>;
  /** 5 分集計の summary を relay (例: Memoria). 不要なら省略. */
  forwardSummary?: (summary: LocationSummary, userId: string, requestId: string) => Promise<RelayResult>;
}

export interface RelayResult {
  ok: boolean;
  error?: string;
}

export interface CoordinatorDeps {
  config: OwntracksRuntimeConfig;
  ownerUserId: string;
  sessions: CernereSessionStore | null;
  audit: AuditLog;
  relays: RelayTarget[];
}

export interface CoordinatorHandle {
  stop: () => Promise<void>;
  flushNow: () => Promise<LocationSummary | null>;
}

export function startOwntracksCoordinator(deps: CoordinatorDeps): CoordinatorHandle | null {
  if (!deps.config.enabled) {
    log.info("owntracks coordinator disabled (OWNTRACKS_ENABLED=false)");
    return null;
  }

  const summaryRelays = deps.relays.filter((r) => !!r.forwardSummary);
  const eventRelays = deps.relays.filter((r) => !!r.forwardEvent);

  if (summaryRelays.length === 0 && eventRelays.length === 0) {
    log.warn("no relay target configured — events will be received but discarded");
  }

  const buffer = new LocationBuffer({
    flushIntervalMs: deps.config.flushIntervalMs,
    minDisplacementMeters: deps.config.minDisplacementMeters,
    onFlush: async (summary) => {
      const userId = resolveUserId(deps);
      if (!userId) {
        log.debug("flush skipped — no userId resolved");
        return;
      }
      const requestId = randomUUID();
      for (const target of summaryRelays) {
        const result = await target.forwardSummary!(summary, userId, requestId);
        deps.audit.record({
          source: "internal",
          command: `${target.name}.location.summary`,
          userId,
          requestId,
          status: result.ok ? "ok" : "error",
          errorCode: result.ok ? undefined : "upstream_error",
        });
        if (!result.ok) {
          log.warn({ target: target.name, err: result.error }, "summary forward failed");
        } else {
          log.info(
            { target: target.name, points: summary.pointCount, net: summary.netDistanceMeters },
            "summary forwarded",
          );
        }
      }
    },
  });
  buffer.start();

  let mqttHandle: OwntracksClientHandle | null = null;
  try {
    mqttHandle = startOwntracksClient(deps.config.mqtt, async (event) => {
      const userId = resolveUserId(deps);
      if (!userId) return;

      buffer.push(event);

      for (const target of eventRelays) {
        const requestId = randomUUID();
        const result = await target.forwardEvent!(event, userId);
        deps.audit.record({
          source: "internal",
          command: `${target.name}.location.event`,
          userId,
          requestId,
          status: result.ok ? "ok" : "error",
          errorCode: result.ok ? undefined : "upstream_error",
        });
        if (!result.ok) {
          log.warn({ target: target.name, err: result.error }, "event forward failed");
        }
      }
    });
  } catch (err) {
    log.error({ err: (err as Error).message }, "failed to start mqtt client");
    void buffer.stop();
    return null;
  }

  return {
    stop: async () => {
      await mqttHandle?.stop();
      await buffer.stop();
    },
    flushNow: () => buffer.flush(),
  };
}

function resolveUserId(deps: CoordinatorDeps): string | null {
  if (deps.ownerUserId) return deps.ownerUserId;
  if (deps.config.forcedUserId) return deps.config.forcedUserId;
  return deps.sessions?.loadAny()?.userId ?? null;
}
