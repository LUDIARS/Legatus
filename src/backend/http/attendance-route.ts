/**
 * 出席イベント relay の Hono ルート.
 *
 * POST /v1/attendance/checkin
 *   - 認証: X-Attendance-Service-Key (Aedilis→Legatus 間 service key)
 *   - body: AttendanceCheckedInEvent (Aedilis 由来)
 *   - 動作: payload を検証して Memoria の /api/attendance/ingest へ転送し、
 *           転送結果を呼び元に返す (fire-and-forget しない).
 *
 * /v1/* prefix なので app.ts の CORS middleware が効く.
 */

import { Hono } from "hono";
import {
  serviceKeyAuth,
  ATTENDANCE_SERVICE_KEY_HEADER,
} from "./service-key-auth.js";
import { parseAttendanceEvent } from "../attendance/payload.js";
import { forwardAttendanceToMemoria } from "../services/memoria-attendance-http.js";
import { LegatusError } from "../../shared/errors.js";
import { createChildLogger } from "../../shared/logger.js";
import type { AttendanceRelayConfig } from "../../shared/config.js";

const log = createChildLogger("attendance-route");

export function registerAttendanceRoute(
  app: Hono,
  cfg: AttendanceRelayConfig,
): void {
  app.post(
    "/v1/attendance/checkin",
    serviceKeyAuth(cfg.serviceKey, ATTENDANCE_SERVICE_KEY_HEADER),
    async (c) => {
      if (!cfg.enabled) {
        throw new LegatusError(
          "forbidden",
          "attendance relay disabled (MEMORIA_INGEST_URL / MEMORIA_INGEST_KEY unset)",
        );
      }

      let raw: unknown;
      try {
        raw = await c.req.json();
      } catch {
        throw new LegatusError("bad_request", "invalid JSON body");
      }

      const event = parseAttendanceEvent(raw);
      if (!event) {
        throw new LegatusError("bad_request", "invalid attendance event payload");
      }

      const result = await forwardAttendanceToMemoria(event, {
        baseUrl: cfg.memoriaIngestUrl,
        ingestKey: cfg.memoriaIngestKey,
      });

      if (!result.ok) {
        log.warn(
          { status: result.status, error: result.error },
          "attendance forward to memoria failed",
        );
        throw new LegatusError(
          "upstream_error",
          result.error ?? `memoria ingest returned ${result.status}`,
        );
      }

      return c.json({ ok: true, forwarded: true, memoriaStatus: result.status });
    },
  );
}
