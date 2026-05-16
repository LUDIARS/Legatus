/**
 * Relay target ビルダー. server.ts から env 設定に応じて選択して
 * coordinator に渡す.
 */

import type { RelayTarget } from "../owntracks/coordinator.js";
import { forwardLocationToActio } from "./actio-placement.js";
import { forwardSummaryToMemoriaHttp } from "./memoria-location-http.js";
import { forwardSummaryToMemoria } from "./memoria-location.js";
import type { LegatusConfig } from "../../shared/config.js";

export function buildRelayTargets(cfg: LegatusConfig): RelayTarget[] {
  const targets: RelayTarget[] = [];

  if (cfg.relays.memoria.enabled) {
    targets.push({
      name: "memoria-http",
      forwardSummary: async (summary, userId, requestId) => {
        return forwardSummaryToMemoriaHttp(
          userId,
          summary,
          { baseUrl: cfg.relays.memoria.baseUrl },
          requestId,
        );
      },
    });
  }

  // Cernere PeerAdapter 経由の Memoria summary (legacy / 認証付き path).
  // 同時に有効化することも可能 (両方に流す = 冗長 / 移行時の検証用).
  if (cfg.cernere.enabled && process.env.MEMORIA_USE_PEER_ADAPTER === "true") {
    targets.push({
      name: "memoria-peer",
      forwardSummary: async (summary, userId, requestId) => {
        return forwardSummaryToMemoria(userId, summary, requestId);
      },
    });
  }

  if (cfg.relays.actioPlacement.enabled) {
    targets.push({
      name: "actio-placement",
      forwardEvent: async (event, userId) => {
        return forwardLocationToActio(
          {
            cernereUserId: userId,
            lat: event.lat,
            lon: event.lon,
            acc: event.acc,
            ts: event.ts,
            deviceId: event.device,
          },
          {
            baseUrl: cfg.relays.actioPlacement.baseUrl,
            serviceKey: cfg.relays.actioPlacement.serviceKey,
          },
        );
      },
    });
  }

  return targets;
}
