/**
 * Legatus backend エントリポイント.
 *
 * Electron main から呼ばれるか、`npm run dev:backend` で単独起動.
 *
 * 起動手順:
 *  1. env から config 読込 + Cernere project 認証情報の検証
 *  2. SQLite open + migration 適用
 *  3. PeerAdapter (caller-only) 起動
 *  4. OwnTracks coordinator 起動 (MQTT subscribe → Actio/Memoria forward)
 *  5. Hono backend (loopback /health, /v1/status) listen
 */

import { serve } from "@hono/node-server";
import { join } from "node:path";
import { loadConfig, assertCernereProjectCredentials } from "../shared/config.js";
import { createChildLogger } from "../shared/logger.js";
import { openDb, closeDb } from "./db/index.js";
import { getOrCreateLocalToken, getOrCreateDbKey } from "./auth/keychain.js";
import { CernereSessionStore } from "./auth/cernere-session.js";
import { AuditLog } from "./audit/audit-log.js";
import { initPeerAdapter, shutdownPeerAdapter } from "./peer/peer-adapter.js";
import { buildApp } from "./http/app.js";
import { loadOwntracksConfig } from "./owntracks/config.js";
import {
  startOwntracksCoordinator,
  type CoordinatorHandle,
} from "./owntracks/coordinator.js";

const log = createChildLogger("server");

export interface BackendHandle {
  port: number;
  shutdown: () => Promise<void>;
}

export interface StartBackendOptions {
  dbPath?: string;
  port?: number;
}

export async function startBackend(opts: StartBackendOptions = {}): Promise<BackendHandle> {
  const cfg = loadConfig();
  assertCernereProjectCredentials(cfg);

  const dbPath = opts.dbPath ?? cfg.dbPath ?? join(process.cwd(), "legatus.db");
  const port = opts.port ?? cfg.localPort;

  const dbKey = await getOrCreateDbKey();
  await getOrCreateLocalToken(); // ensure exists for future loopback API

  const db = openDb(dbPath);
  const sessions = new CernereSessionStore(db, dbKey);
  const audit = new AuditLog(db);
  const startedAt = new Date().toISOString();

  await initPeerAdapter(cfg);

  const owntracksConfig = loadOwntracksConfig();
  const coordinator: CoordinatorHandle | null = startOwntracksCoordinator({
    config: owntracksConfig,
    actioPlacement: {
      baseUrl: cfg.actioBaseUrl,
      serviceKey: cfg.actioPlacementServiceKey,
    },
    sessions,
    audit,
  });

  const app = buildApp({ sessions, audit, startedAt });

  const server = serve({
    fetch: app.fetch,
    hostname: cfg.localHost,
    port,
  });

  log.info({ host: cfg.localHost, port, dbPath }, "Legatus backend listening");

  return {
    port,
    shutdown: async () => {
      server.close();
      await coordinator?.stop();
      await shutdownPeerAdapter();
      closeDb();
    },
  };
}

const isMain = import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}`;
if (isMain) {
  startBackend().catch((err) => {
    log.error({ err }, "failed to start Legatus backend");
    process.exit(1);
  });
}
