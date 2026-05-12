/**
 * Actio Placement Module への位置情報転送.
 *
 * Iv の owntracks/forwarder.ts と同じインタフェース (POST /api/placement/locations,
 * X-Placement-Service-Key). Actio 側で peer command 化が完了したら本関数を
 * PeerAdapter 経由に置換する (v0.2 予定).
 */

import { createChildLogger } from "../../shared/logger.js";

const log = createChildLogger("actio-placement");

export interface ActioPlacementForwardConfig {
  baseUrl: string;
  serviceKey: string;
}

export interface ActioPlacementInput {
  cernereUserId: string;
  lat: number;
  lon: number;
  acc: number | undefined;
  ts: string; // ISO 8601 UTC
  deviceId: string;
}

export interface ActioPlacementResult {
  ok: boolean;
  status?: number;
  error?: string;
}

export async function forwardLocationToActio(
  input: ActioPlacementInput,
  cfg: ActioPlacementForwardConfig,
): Promise<ActioPlacementResult> {
  if (!cfg.baseUrl || !cfg.serviceKey) {
    return { ok: false, error: "actio_placement disabled (baseUrl/serviceKey unset)" };
  }
  const url = `${cfg.baseUrl.replace(/\/+$/, "")}/api/placement/locations`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-placement-service-key": cfg.serviceKey,
        "user-agent": "Legatus-Owntracks/0.1",
      },
      body: JSON.stringify({
        user_id: input.cernereUserId,
        lat: input.lat,
        lon: input.lon,
        accuracy: input.acc,
        ts: input.ts,
        device_id: input.deviceId,
      }),
      signal: AbortSignal.timeout(5000),
    });
    return { ok: res.ok, status: res.status };
  } catch (err) {
    const msg = (err as Error).message;
    log.warn({ err: msg }, "actio placement forward failed");
    return { ok: false, error: msg };
  }
}
