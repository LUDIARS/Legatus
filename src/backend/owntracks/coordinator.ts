/**
 * OwnTracks coordinator.
 *
 * 責務:
 *  1. MQTT subscriber を起動して LocationEvent を受ける
 *  2. 各 event を Actio.placement へ即時転送 (個別座標は Actio 側 webhook が判定)
 *  3. LocationBuffer に蓄積 → 5 分 flush → Memoria.location.summary.append へ転送
 *
 * Cernere user session が無い間はすべて drop (signed in 後に再取得は phone 側に依存).
 */

import { createChildLogger } from "../../shared/logger.js";
import { startOwntracksClient, type OwntracksClientHandle } from "./client.js";
import { LocationBuffer } from "./buffer.js";
import { forwardLocationToActio, type ActioPlacementForwardConfig } from "../services/actio-placement.js";
import { forwardSummaryToMemoria } from "../services/memoria-location.js";
import { randomUUID } from "node:crypto";
import type { CernereSessionStore } from "../auth/cernere-session.js";
import type { AuditLog } from "../audit/audit-log.js";
import type { OwntracksRuntimeConfig } from "./config.js";
import type { LocationEvent, LocationSummary } from "./types.js";

const log = createChildLogger("owntracks-coord");

export interface CoordinatorDeps {
  config: OwntracksRuntimeConfig;
  actioPlacement: ActioPlacementForwardConfig;
  sessions: CernereSessionStore;
  audit: AuditLog;
}

export interface CoordinatorHandle {
  stop: () => Promise<void>;
  /** Test 用: buffer の即時 flush */
  flushNow: () => Promise<LocationSummary | null>;
}

export function startOwntracksCoordinator(deps: CoordinatorDeps): CoordinatorHandle | null {
  if (!deps.config.enabled) {
    log.info("owntracks coordinator disabled (OWNTRACKS_ENABLED=false)");
    return null;
  }

  const buffer = new LocationBuffer({
    flushIntervalMs: deps.config.flushIntervalMs,
    minDisplacementMeters: deps.config.minDisplacementMeters,
    onFlush: async (summary) => {
      const userId = resolveUserId(deps);
      if (!userId) {
        log.debug("flush skipped — not signed in");
        return;
      }
      const requestId = randomUUID();
      const result = await forwardSummaryToMemoria(userId, summary, requestId);
      deps.audit.record({
        source: "internal",
        command: "memoria.location.summary.append",
        userId,
        requestId,
        status: result.ok ? "ok" : "error",
        errorCode: result.ok ? undefined : "upstream_error",
      });
      if (!result.ok) {
        log.warn({ err: result.error }, "memoria summary forward failed");
      } else {
        log.info(
          { points: summary.pointCount, net: summary.netDistanceMeters },
          "memoria summary appended",
        );
      }
    },
  });
  buffer.start();

  let mqttHandle: OwntracksClientHandle | null = null;
  try {
    mqttHandle = startOwntracksClient(deps.config.mqtt, async (event) => {
      const userId = resolveUserId(deps);
      if (!userId) return; // 受信は来ているが session が無い間はすべて drop

      buffer.push(event);
      void forwardEventToActio(event, userId, deps);
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
  if (deps.config.forcedUserId) return deps.config.forcedUserId;
  return deps.sessions.loadAny()?.userId ?? null;
}

async function forwardEventToActio(
  event: LocationEvent,
  userId: string,
  deps: CoordinatorDeps,
): Promise<void> {
  const requestId = randomUUID();
  const result = await forwardLocationToActio(
    {
      cernereUserId: userId,
      lat: event.lat,
      lon: event.lon,
      acc: event.acc,
      ts: event.ts,
      deviceId: event.device,
    },
    deps.actioPlacement,
  );
  deps.audit.record({
    source: "internal",
    command: "actio.placement.location",
    userId,
    requestId,
    status: result.ok ? "ok" : "error",
    errorCode: result.ok ? undefined : "upstream_error",
  });
  if (!result.ok) {
    log.warn({ err: result.error, status: result.status }, "actio forward failed");
  }
}
