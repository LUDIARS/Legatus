/**
 * dnstap module の統合: dnsmasq tail → parse → tailscale tag → buffer → forward.
 *
 * 起動 / 停止 1 関数で全体の lifecycle を握る. 個別モジュール (parser, cache,
 * buffer, client) は注入可能で test しやすい.
 *
 * spec: <../../../spec/dns-sni-tap.md> §6 (coordinator.ts)
 */

import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import type { DnstapRuntimeConfig } from "./config.js";
import { shouldSkipDomain } from "./config.js";
import type { DomainVisitEvent } from "./types.js";
import { parseDnsmasqLine, extractTimestamp } from "./dnsmasq.js";
import { TailscaleCache } from "./tailscale.js";
import { DnstapBuffer } from "./buffer.js";
import { DnstapClient } from "./client.js";
import { createChildLogger } from "../../shared/logger.js";

const log = createChildLogger("dnstap-coordinator");

export interface DnstapCoordinatorHandle {
  stop: () => Promise<void>;
}

/**
 * Pure transform: 1 ログ行 → DomainVisitEvent | null.
 * tail の I/O から切り離してテスト可能にしておく.
 */
export function dnsmasqLineToEvent(
  line: string,
  cache: TailscaleCache,
  skipDomains: string[],
  now: () => Date = () => new Date(),
): DomainVisitEvent | null {
  const parsed = parseDnsmasqLine(line);
  if (!parsed) return null;
  if (shouldSkipDomain(parsed.domain, skipDomains)) return null;
  const ts = extractTimestamp(line, now);
  const dev = cache.lookup(parsed.src_ip);
  return {
    ts,
    domain: parsed.domain,
    source: "dns",
    src_ip: parsed.src_ip,
    device_label: dev?.hostname ?? parsed.src_ip,
    device_os: dev?.os ?? null,
    qtype: parsed.qtype,
  };
}

export async function startDnstapCoordinator(
  config: DnstapRuntimeConfig,
): Promise<DnstapCoordinatorHandle> {
  if (!config.enabled) {
    log.info("dnstap module disabled (LEGATUS_DNSTAP_ENABLED!=true)");
    return { stop: async () => {} };
  }

  const cache = new TailscaleCache({
    bin: config.tailscaleBin,
    refreshMs: config.tailscaleRefreshMs,
  });
  cache.start();

  const client = new DnstapClient({ forwardUrl: config.forwardUrl });
  const buffer = new DnstapBuffer({
    flushIntervalMs: config.flushIntervalMs,
    dedupeWindowMs: config.dedupeWindowMs,
    onFlush: (events) => client.forward(events),
  });
  buffer.start();

  // Tail file. v0.1 では node:readline で chunk 単位読み + EOF→ wait の単純実装.
  // production では `tail -F` 相当の rotate 追従が要るので chokidar / `tail-file`
  // パッケージへ差し替え予定.
  const stream = createReadStream(config.dnsmasqLogPath, {
    encoding: "utf8",
    flags: "r",
  });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  rl.on("line", (line) => {
    const ev = dnsmasqLineToEvent(line, cache, config.skipDomains);
    if (ev) buffer.push(ev);
  });
  rl.on("error", (err) => {
    log.warn({ err: err.message }, "dnsmasq log read error");
  });

  log.info(
    { path: config.dnsmasqLogPath, flushMs: config.flushIntervalMs },
    "dnstap coordinator started",
  );

  return {
    stop: async () => {
      rl.close();
      stream.close();
      cache.stop();
      await buffer.stop();
      log.info("dnstap coordinator stopped");
    },
  };
}
