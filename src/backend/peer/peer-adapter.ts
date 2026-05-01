/**
 * Legatus PeerAdapter init (caller-only).
 *
 * v0.1 では inbound peer command (`accept`) を持たない。Outbound 専用。
 * 将来 (v0.3+) で legatus.notify / legatus.health を追加する際に accept を埋める。
 *
 * Imperativus の src/service-adapter.ts と同様のシングルトンパターン。
 */

import { PeerAdapter } from "@ludiars/cernere-service-adapter";
import type { LegatusConfig } from "../../shared/config.js";
import { createChildLogger } from "../../shared/logger.js";

const log = createChildLogger("peer-sa");
let adapter: PeerAdapter | null = null;

export async function initPeerAdapter(cfg: LegatusConfig): Promise<PeerAdapter> {
  if (adapter) return adapter;

  adapter = new PeerAdapter({
    projectId: cfg.cernereProjectClientId,
    projectSecret: cfg.cernereProjectClientSecret,
    cernereBaseUrl: cfg.cernereUrl,
    saListenHost: "127.0.0.1",
    saListenPort: 0,
    saPublicBaseUrl: cfg.saPublicBaseUrl,
    accept: {
      // v0.1: Legatus は invoker only. inbound peer command は v0.3+ で追加.
    },
  });

  await adapter.start();
  log.info({ port: adapter.boundListenPort }, "peer adapter started (caller-only)");
  return adapter;
}

export function currentPeerAdapter(): PeerAdapter {
  if (!adapter) throw new Error("PeerAdapter not initialised. Call initPeerAdapter() first.");
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
