/**
 * Memoria への移動サマリ HTTP relay.
 *
 * loopback or tailnet 内通信を前提にしているため認証ヘッダなし.
 * 仕様: POST {MEMORIA_BASE_URL}/api/legatus/location-summary
 *       Content-Type: application/json
 *       body: LocationSummary + userId
 *
 * Memoria 側 endpoint は別 PR. 既存 Memoria への追加 spec として:
 *   - bind は 127.0.0.1 / tailnet IP のみ (公開しない)
 *   - body validation + persistence は Memoria 側責務
 */

import { createChildLogger } from "../../shared/logger.js";
import type { LocationSummary } from "../owntracks/types.js";

const log = createChildLogger("memoria-http");

export interface MemoriaHttpForwardConfig {
  baseUrl: string;
}

export interface ForwardSummaryResult {
  ok: boolean;
  status?: number;
  error?: string;
}

export async function forwardSummaryToMemoriaHttp(
  userId: string,
  summary: LocationSummary,
  cfg: MemoriaHttpForwardConfig,
  requestId?: string,
): Promise<ForwardSummaryResult> {
  if (!cfg.baseUrl) {
    return { ok: false, error: "memoria http relay disabled (MEMORIA_BASE_URL unset)" };
  }
  const url = `${cfg.baseUrl.replace(/\/+$/, "")}/api/legatus/location-summary`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "Legatus-Owntracks/0.1",
      },
      body: JSON.stringify({
        userId,
        intervalStart: summary.intervalStart,
        intervalEnd: summary.intervalEnd,
        start: summary.start,
        end: summary.end,
        totalDistanceMeters: summary.totalDistanceMeters,
        netDistanceMeters: summary.netDistanceMeters,
        maxSpeedKmh: summary.maxSpeedKmh,
        meanSpeedKmh: summary.meanSpeedKmh,
        pointCount: summary.pointCount,
        deviceIds: summary.deviceIds,
        source: { via: "legatus", tool: "owntracks-mqtt", requestId },
      }),
      signal: AbortSignal.timeout(5000),
    });
    return { ok: res.ok, status: res.status };
  } catch (err) {
    const msg = (err as Error).message;
    log.warn({ err: msg }, "memoria http forward failed");
    return { ok: false, error: msg };
  }
}
