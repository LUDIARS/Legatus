/**
 * Bearer token middleware for the loopback POST API.
 *
 * `LEGATUS_LOCAL_TOKEN` は起動時に keytar から取得し、各リクエストの
 * `Authorization: Bearer <token>` と一致するかを確認する。
 *
 * bind は 127.0.0.1 のみのため、IP filter は省略.
 */

import type { Context, MiddlewareHandler } from "hono";
import { LegatusError } from "../../shared/errors.js";

export function bearerAuth(expected: string): MiddlewareHandler {
  return async (c: Context, next) => {
    const header = c.req.header("authorization") ?? "";
    const match = /^Bearer\s+(.+)$/i.exec(header);
    if (!match || !timingSafeEqual(match[1], expected)) {
      throw new LegatusError("unauthorized", "invalid local token");
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
