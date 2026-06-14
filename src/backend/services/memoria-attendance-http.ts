/**
 * Memoria への出席イベント HTTP relay.
 *
 * 仕様: POST {MEMORIA_INGEST_URL}/api/attendance/ingest
 *       Content-Type: application/json
 *       X-Memoria-Ingest-Key: {MEMORIA_INGEST_KEY}
 *       body: AttendanceCheckedInEvent (Aedilis 由来 payload をそのまま転送)
 *
 * memoria-location-http.ts と同型. 違いは ingest key 認証ヘッダを付ける点.
 * Memoria 側 endpoint (/api/attendance/ingest) は別 PR (Memoria #169) で実装.
 */

import { createChildLogger } from "../../shared/logger.js";
import type { AttendanceCheckedInEvent } from "../attendance/types.js";

const log = createChildLogger("memoria-attendance");

export interface AttendanceForwardConfig {
  /** Memoria 受信口の base URL. */
  baseUrl: string;
  /** Memoria の ingest 認証キー (X-Memoria-Ingest-Key). */
  ingestKey: string;
}

export interface AttendanceForwardResult {
  ok: boolean;
  status?: number;
  error?: string;
}

export async function forwardAttendanceToMemoria(
  event: AttendanceCheckedInEvent,
  cfg: AttendanceForwardConfig,
): Promise<AttendanceForwardResult> {
  if (!cfg.baseUrl || !cfg.ingestKey) {
    return {
      ok: false,
      error:
        "memoria attendance relay disabled (MEMORIA_INGEST_URL / MEMORIA_INGEST_KEY unset)",
    };
  }
  const url = `${cfg.baseUrl.replace(/\/+$/, "")}/api/attendance/ingest`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-memoria-ingest-key": cfg.ingestKey,
        "user-agent": "Legatus-Attendance/0.1",
      },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      log.warn(
        { status: res.status, facilityId: event.facilityId },
        "memoria attendance forward non-2xx",
      );
    }
    return { ok: res.ok, status: res.status };
  } catch (err) {
    const msg = (err as Error).message;
    log.warn({ err: msg }, "memoria attendance forward failed");
    return { ok: false, error: msg };
  }
}
