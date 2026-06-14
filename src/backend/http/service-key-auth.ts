/**
 * Service-key middleware for inbound relay endpoints.
 *
 * Aedilis 等の外部サービス → Legatus loopback 受け口の認証に使う.
 * Actio Placement relay (X-Placement-Service-Key) と同型で、ヘッダの
 * service key を timing-safe に突合する.
 *
 * bind は 127.0.0.1 のみのため IP filter は省略 (bearerAuth と同方針).
 */

import type { Context, MiddlewareHandler } from "hono";
import { LegatusError } from "../../shared/errors.js";

export const ATTENDANCE_SERVICE_KEY_HEADER = "x-attendance-service-key";

export function serviceKeyAuth(
  expected: string,
  header: string,
): MiddlewareHandler {
  return async (c: Context, next) => {
    if (!expected) {
      throw new LegatusError("forbidden", "relay endpoint not configured");
    }
    const provided = c.req.header(header) ?? "";
    if (!timingSafeEqual(provided, expected)) {
      throw new LegatusError("unauthorized", "invalid service key");
    }
    await next();
  };
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
