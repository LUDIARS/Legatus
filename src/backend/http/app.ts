/**
 * Legatus Hono app factory.
 *
 * v0.1 では loopback POST API のサーフェスを最小化して /health のみ.
 * Legatus 直近の主機能は OwnTracks (MQTT) → Memoria/Actio forwarder.
 * `actio_add_task` 系の loopback POST API は v0.2+ で再開予定.
 */

import { Hono } from "hono";
import { errorHandler } from "./error-handler.js";
import type { CernereSessionStore } from "../auth/cernere-session.js";
import type { AuditLog } from "../audit/audit-log.js";

export interface AppDeps {
  sessions: CernereSessionStore;
  audit: AuditLog;
  /** 起動時刻 (ISO 8601). status エンドポイント用. */
  startedAt: string;
}

export function buildApp(deps: AppDeps): Hono {
  const app = new Hono();

  app.onError(errorHandler);

  app.get("/health", (c) =>
    c.json({ ok: true, service: "legatus", version: "0.1.0" }),
  );

  app.get("/v1/status", (c) => {
    const session = deps.sessions.loadAny();
    return c.json({
      ok: true,
      signedIn: !!session,
      userId: session?.userId ?? null,
      startedAt: deps.startedAt,
    });
  });

  return app;
}
