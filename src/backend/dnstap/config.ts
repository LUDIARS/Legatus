/**
 * DNS / SNI tap モジュール設定 (env loader).
 *
 * default は **すべて off**. ユーザーが明示的に LEGATUS_DNSTAP_ENABLED=true
 * + LEGATUS_DNSMASQ_LOG_PATH を指定して初めて起動する.
 *
 * spec: <../../../spec/dns-sni-tap.md> §8 (設定)
 */

export interface DnstapRuntimeConfig {
  enabled: boolean;
  /** dnsmasq query log file の絶対パス. tail されて parse される. */
  dnsmasqLogPath: string;
  /** Tailscale CLI バイナリ名 (PATH 解決) */
  tailscaleBin: string;
  /** Tailscale device map を再 fetch する間隔 (ms). default 5 分. */
  tailscaleRefreshMs: number;
  /** flush 周期 (ms). default 30 秒. */
  flushIntervalMs: number;
  /** 同一 (device, domain) のバースト dedupe 窓 (ms). default 5 秒. */
  dedupeWindowMs: number;
  /** カンマ区切り skip ドメイン. 部分一致 (suffix match) で除外. */
  skipDomains: string[];
  /** Memoria endpoint URL. PeerAdapter 経由 forward する時の最終宛先. */
  forwardUrl: string;
}

export function loadDnstapConfig(env = process.env): DnstapRuntimeConfig {
  const skipRaw = env.LEGATUS_DNSTAP_SKIP_DOMAINS ?? "";
  return {
    enabled: (env.LEGATUS_DNSTAP_ENABLED ?? "false").toLowerCase() === "true",
    dnsmasqLogPath: env.LEGATUS_DNSMASQ_LOG_PATH ?? "/var/log/dnsmasq.log",
    tailscaleBin: env.LEGATUS_TAILSCALE_BIN ?? "tailscale",
    tailscaleRefreshMs: Number(env.LEGATUS_TAILSCALE_REFRESH_MS ?? 300_000),
    flushIntervalMs: Number(env.LEGATUS_DNSTAP_FLUSH_MS ?? 30_000),
    dedupeWindowMs: Number(env.LEGATUS_DNSTAP_DEDUPE_MS ?? 5_000),
    skipDomains: skipRaw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0),
    forwardUrl:
      env.LEGATUS_DNSTAP_FORWARD_URL ??
      "http://localhost:5180/api/visits/external",
  };
}

/** suffix match で skip 判定. 例: "example.com" は "foo.example.com" にもヒット. */
export function shouldSkipDomain(domain: string, skipList: string[]): boolean {
  const d = domain.toLowerCase();
  return skipList.some((s) => d === s || d.endsWith(`.${s}`));
}
