/**
 * Legatus backend エントリポイント.
 *
 * Electron main から呼ばれるか、`npm run dev:backend` で単独起動.
 *
 * 起動手順:
 *  1. .env load + config 読込
 *  2. SQLite open + migration 適用 (audit_log + cernere_session のみ)
 *  3. Cernere PeerAdapter 起動 (env が揃っている場合のみ)
 *  4. relay targets 構築 (Memoria HTTP / Actio Placement / Cernere PeerAdapter)
 *  5. OwnTracks coordinator 起動 (MQTT subscribe → relay)
 *  6. Hono backend (loopback /health, /v1/status) listen
 */

import { serve } from "@hono/node-server";
import { join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { loadConfig } from "../shared/config.js";
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
import { buildRelayTargets } from "./services/relay-targets.js";
import { loadDnstapConfig } from "./dnstap/config.js";
import {
  startDnstapCoordinator,
  type DnstapCoordinatorHandle,
} from "./dnstap/coordinator.js";

const log = createChildLogger("server");

function loadDotEnv(file: string): void {
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

export interface BackendHandle {
  port: number;
  shutdown: () => Promise<void>;
}

export interface StartBackendOptions {
  dbPath?: string;
  port?: number;
}

export async function startBackend(opts: StartBackendOptions = {}): Promise<BackendHandle> {
  loadDotEnv(join(process.cwd(), ".env"));
  const cfg = loadConfig();

  const dbPath =
    opts.dbPath || cfg.dbPath || join(process.cwd(), "legatus.db");
  const port = opts.port ?? cfg.localPort;

  const dbKey = await getOrCreateDbKey();
  await getOrCreateLocalToken();

  const db = openDb(dbPath);
  const sessions = new CernereSessionStore(db, dbKey);
  const audit = new AuditLog(db);
  const startedAt = new Date().toISOString();

  await initPeerAdapter(cfg.cernere);

  const owntracksConfig = loadOwntracksConfig();
  const relays = buildRelayTargets(cfg);

  log.info(
    {
      cernereMode: cfg.cernere.enabled,
      ownerUserId: cfg.ownerUserId || null,
      relays: relays.map((r) => r.name),
      mqtt: { url: owntracksConfig.mqtt.url, topic: owntracksConfig.mqtt.topic },
    },
    "legatus boot config",
  );

  const coordinator: CoordinatorHandle | null = startOwntracksCoordinator({
    config: owntracksConfig,
    ownerUserId: cfg.ownerUserId,
    sessions: cfg.cernere.enabled ? sessions : null,
    audit,
    relays,
  });

  const dnstapConfig = loadDnstapConfig();
  const dnstapCoordinator: DnstapCoordinatorHandle = await startDnstapCoordinator(dnstapConfig);

  log.info(
    {
      attendanceRelay: cfg.attendanceRelay.enabled,
      attendanceReceiver: !!cfg.attendanceRelay.serviceKey,
    },
    "legatus attendance relay config",
  );

  const app = buildApp({
    sessions,
    audit,
    startedAt,
    attendanceRelay: cfg.attendanceRelay,
  });

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
      await dnstapCoordinator.stop();
      await shutdownPeerAdapter();
      closeDb();
    },
  };
}

function isEntrypoint(): boolean {
  const argv1 = process.argv[1] ?? "";
  if (!argv1) return false;
  const norm = argv1.replace(/\\/g, "/");
  const url = import.meta.url;
  return url === `file://${norm}` || url === `file:///${norm}` || url.endsWith(norm);
}

if (isEntrypoint()) {
  startBackend().catch((err) => {
    log.error({ err }, "failed to start Legatus backend");
    process.exit(1);
  });
}
