/**
 * DNS / SNI tap モジュールの共通型.
 *
 * spec: <../../../spec/dns-sni-tap.md>
 */

/** Tap source — DNS query or TLS SNI passive observation. */
export type TapSource = "dns" | "sni";

/**
 * 1 件の domain access event.
 *
 * dnsmasq query log の 1 行 / SNI tap 1 接続が、 dedupe 後にこの形に正規化される.
 */
export interface DomainVisitEvent {
  /** ISO 8601 UTC */
  ts: string;
  /** 小文字化された FQDN, 末尾ドットなし */
  domain: string;
  source: TapSource;
  /** 送信元 IP (Tailscale tailnet IP の想定) */
  src_ip: string;
  /** Tailscale で解決した device label. 解決不能なら src_ip と同じ文字列. */
  device_label: string;
  /** Tailscale が報告する OS hint. 不明なら null. */
  device_os: string | null;
  /** DNS query type (A / AAAA / HTTPS / MX / ...) — DNS source のみ */
  qtype?: string;
  /** SNI バイト数推定 — SNI source のみ */
  bytes?: number;
}

/** Tailscale が知っている tailnet 内デバイス 1 件の概要. */
export interface TailscaleDeviceInfo {
  /** Tailscale assigned IP (v4 か v6 の単一). 1 デバイスが複数 IP を持つので
   *  下位の cache 側で IP→info の map を構築する. */
  ip: string;
  hostname: string;
  os: string | null;
  /** tailnet user (Cernere 経由のユーザではない). */
  user_login: string;
  online: boolean;
  /** ISO 8601 last_seen — Tailscale が報告したまま */
  last_seen: string | null;
}

/**
 * Forward 先 (Memoria) に POST する batch payload.
 * `/api/visits/external` が受け取る形.
 */
export interface DomainVisitBatch {
  events: DomainVisitEvent[];
  /** Legatus 側で flush した時刻 (debug 用) */
  flushed_at: string;
}
