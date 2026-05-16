/**
 * dnsmasq query log の 1 行を DomainVisitEvent 化.
 *
 * 例 (dnsmasq --log-queries 出力):
 *   `Apr 14 21:15:03 dnsmasq[123]: query[A] github.com from 100.122.174.105`
 *   `2026-05-02 14:23:15.012 query[AAAA] api.github.com from 100.122.174.105`
 *
 * formatter は dnsmasq build により syslog 形式 / `--log-facility=-` 形式が
 * 異なる. 両方サポートしたいので最低限「query[<TYPE>] <DOMAIN> from <IP>」
 * の正規表現マッチで掴む.
 *
 * spec: <../../../spec/dns-sni-tap.md> §6 (dnsmasq.ts)
 */

const QUERY_LINE_RE =
  /query\[(?<qtype>[A-Z0-9]+)\]\s+(?<domain>[^\s]+)\s+from\s+(?<ip>[0-9a-fA-F:.]+)/;

export interface ParsedDnsmasqLine {
  qtype: string;
  domain: string;
  src_ip: string;
}

/**
 * 1 行を parse. query[T] domain from ip 形式以外 (forwarded / reply 行等) は
 * null を返す.
 */
export function parseDnsmasqLine(line: string): ParsedDnsmasqLine | null {
  const m = line.match(QUERY_LINE_RE);
  if (!m?.groups) return null;
  const domain = m.groups.domain.toLowerCase().replace(/\.$/, "");
  if (!domain) return null;
  return {
    qtype: m.groups.qtype,
    domain,
    src_ip: m.groups.ip,
  };
}

/** ログ行先頭の timestamp を best-effort で取り出す. 失敗時は受信時刻にフォールバック. */
export function extractTimestamp(
  line: string,
  fallbackNow: () => Date = () => new Date(),
): string {
  // ISO-ish: 2026-05-02 14:23:15.012 / 2026-05-02T14:23:15.012Z
  const iso = line.match(
    /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2}(?:\.\d+)?)(Z|[+-]\d{2}:?\d{2})?/,
  );
  if (iso) {
    const tz = iso[3] ?? "Z";
    const d = new Date(`${iso[1]}T${iso[2]}${tz}`);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  // syslog: "Apr 14 21:15:03"
  const sys = line.match(
    /^([A-Z][a-z]{2})\s+(\d{1,2})\s+(\d{2}:\d{2}:\d{2})/,
  );
  if (sys) {
    // syslog は year を持たないので fallback の年を使う
    const yr = fallbackNow().getFullYear();
    const d = new Date(`${sys[1]} ${sys[2]} ${yr} ${sys[3]} UTC`);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  return fallbackNow().toISOString();
}
