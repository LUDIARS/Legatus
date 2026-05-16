/**
 * Cernere PeerAdapter init (caller-only, optional).
 *
 * Legatus は Cernere モード OFF (env 未設定) でも起動する. その場合は
 * peer adapter は null. Memoria/Actio 等への relay は HTTP path 経由となる.
 *
 * Cernere モード時のみ inbound peer command を v0.3+ で追加する想定 (現状空).
 */

import { PeerAdapter } from "@ludiars/cernere-service-adapter";
import type { CernereConfig } from "../../shared/config.js";
import { createChildLogger } from "../../shared/logger.js";

const log = createChildLogger("peer-sa");
let adapter: PeerAdapter | null = null;

export async function initPeerAdapter(cfg: CernereConfig): Promise<PeerAdapter | null> {
  if (!cfg.enabled) {
    log.info("cernere mode OFF (CERNERE_PROJECT_* unset) — peer adapter not started");
    return null;
  }
  if (adapter) return adapter;

  adapter = new PeerAdapter({
    projectId: cfg.projectClientId,
    projectSecret: cfg.projectClientSecret,
    cernereBaseUrl: cfg.url,
    saListenHost: "127.0.0.1",
    saListenPort: 0,
    saPublicBaseUrl: "ws://127.0.0.1:{port}",
    accept: {
      // v0.1: caller only. inbound peer command は v0.3+ で追加.
    },
  });

  await adapter.start();
  log.info({ port: adapter.boundListenPort }, "peer adapter started (caller-only)");
  return adapter;
}

export function currentPeerAdapter(): PeerAdapter | null {
  return adapter;
}

export async function shutdownPeerAdapter(): Promise<void> {
  if (adapter) {
    await adapter.stop();
    adapter = null;
  }
}

export function setPeerAdapterForTest(stub: PeerAdapter | null): void {
  adapter = stub;
}
