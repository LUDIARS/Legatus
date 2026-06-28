# DNS / SNI Tap Module — `src/backend/dnstap`

| 項目 | 値 |
|---|---|
| ステータス | Draft v0.1.0 |
| 提案日 | 2026-05-02 |
| 関連 | `spec/service-schema.md` (v0.1.0-draft), Memoria `page_visits` / `domain_catalog` |

## 1. 目的

ユーザーが個人デバイス (主に **iPhone**, 将来的に Android / Mac / Windows) で
**どのドメインに / いつ / どのデバイスから** アクセスしたかを Legatus 経由で
Memoria に永続化し、 ライフログ・日記・週次サマリの素材にする。

ページ本文 / アプリ内イベントは捕捉しない (HTTPS のため不可能 / 高コスト)。
**「ドメイン + 時刻 + 通信量 + デバイス名」 のみ** を扱う。

## 2. 取得粒度の限界

| 項目 | 取得可否 | 備考 |
|---|---|---|
| 訪問ドメイン | ✓ | DNS query log + TLS SNI 観測 |
| 訪問時刻 (秒粒度) | ✓ | DNS query / 接続開始時刻 |
| 通信バイト数 (推定) | △ | SNI tap 経由なら可。 DNS only なら不可 |
| ページ URL / クエリ文字列 | ✗ | HTTPS で暗号化、 MITM は実用不可 (cert pinning) |
| アプリ内イベント | ✗ | アプリの公開 API がない限り不可 |
| Safari タブ詳細 | ✗ | iOS sandbox 外 |

実装上の捕捉点は **2 系統** で、 設定で切替:

1. **DNS query log mode** (デフォルト推奨): home PC で `dnsmasq` / `blocky` /
   `Pi-hole` を動かし、 Tailscale MagicDNS or DHCP で iPhone がこの resolver を
   使うように。 query log を tail。
2. **SNI passive tap mode** (補助 / future): exit node 上で `tcpdump` / `nfqueue`
   で TCP/443 の SNI を観測。 DNS log より正確 (CDN や Encrypted Client Hello
   非対応)、 ただし root 権限要 + Encrypted Client Hello 普及で精度低下予定。

## 3. データフロー

```
┌──────────┐  Tailscale     ┌─────────────────┐    DomainVisitEvent
│ iPhone   ├────────────────│ home PC          │ ────────────────►
│ (Safari, │  exit node     │ ┌─ dnsmasq ──┐   │
│  apps)   │  + MagicDNS    │ │ query.log  │   │
└──────────┘                │ └────┬───────┘   │
                            │      │           │
                            │ ┌────▼──────────┐│
                            │ │ Legatus       ││
                            │ │ src/backend/  ││
                            │ │   dnstap/     ││
                            │ │ - tail        ││
                            │ │ - parse       ││
                            │ │ - dedupe      ││
                            │ │ - tag device  ││
                            │ │ - buffer      ││
                            │ └────┬──────────┘│
                            │      │           │
                            │ ┌────▼──────────┐│
                            │ │ Memoria       ││
                            │ │ POST /api/    ││
                            │ │   visits/     ││
                            │ │   external    ││
                            │ │ (PeerAdapter) ││
                            │ └───────────────┘│
                            └──────────────────┘
```

## 4. デバイス名タグ (Tailscale 連携)

iPhone を識別する手段:

- DNS query / SNI 観測の **送信元 IP** は Tailscale が割り当てた
  `100.x.y.z` 形式の tailnet IP
- Tailscale CLI (`tailscale status --json`) で **tailnet 内デバイスの一覧** が
  取れる: `Self.HostName`, `Peer[*].HostName` / `Peer[*].TailscaleIPs`
- Legatus は起動時 + 定期 (5 分間隔) で `tailscale status` を取得し、
  IP → `device_label` マッピングを memo (TTL 付き)
- 1 つの iPhone が複数 IP (v4/v6) を持つので両方ハッシュ
- 解決失敗時は IP 文字列をそのまま label にして欠落させない

```ts
interface TailscaleDeviceInfo {
  ip: string;            // "100.122.x.y"
  hostname: string;      // "iphone-of-foo"
  os: "iOS" | "Android" | "macOS" | ...;
  user_login: string;    // tailnet user
  online: boolean;
  last_seen?: string;    // ISO
}
```

## 5. データ構造

OwnTracks の `LocationEvent` に倣う:

```ts
/** 1 件の domain access event (DNS query or SNI). */
interface DomainVisitEvent {
  /** ISO 8601 UTC */
  ts: string;
  /** lower-cased FQDN, trailing dot 除去 */
  domain: string;
  /** "dns" | "sni" — tap source */
  source: "dns" | "sni";
  /** 送信元 IP (tailnet IP) */
  src_ip: string;
  /** Tailscale で解決した device label。 解決不可なら src_ip と同値 */
  device_label: string;
  /** Tailscale OS hint (iOS/Android/macOS/Windows/Linux/null) */
  device_os: string | null;
  /** DNS query type (A/AAAA/HTTPS/MX/...) — DNS source のみ */
  qtype?: string;
  /** SNI バイト数推定 — SNI source のみ */
  bytes?: number;
}
```

## 6. 内部 module 構造

```
src/backend/dnstap/
├── types.ts        # DomainVisitEvent / TailscaleDeviceInfo / config types
├── config.ts       # DnstapConfig (env→struct)
├── tailscale.ts    # `tailscale status --json` parser + IP-cache
├── dnsmasq.ts      # dnsmasq query log tail-er + parser
├── sni.ts          # (Phase 2) SNI passive tap via tcpdump
├── buffer.ts       # 時間 + ドメイン dedupe バッファ
├── coordinator.ts  # tap → buffer → forward 統合
└── client.ts       # Memoria への HTTP forward (PeerAdapter 経由)
```

owntracks/ と並列構造、 同パターン (config / types / 入力 client / buffer /
summarizer / coordinator) を踏襲。

### `dnsmasq.ts` のパース対象

```text
2026-05-02 14:23:15.012 query[A] github.com from 100.122.174.105
2026-05-02 14:23:15.013 forwarded github.com to 1.1.1.1
```
→ `query[A] github.com from 100.122.174.105` 行のみ抽出、 timestamp + qtype
+ domain + src_ip を produce。

### `buffer.ts` の dedupe 規則

- 同一 (`device_label`, `domain`) の event が **5 秒以内** に複数到着したら
  1 件に集約 (バースト DNS 問合せ — A, AAAA, HTTPS RR 等が同時に飛ぶ)
- flush 周期: 30 秒 (owntracks の 60 秒より頻度高め)
- domain 単位の重複統合は Memoria 側で `page_visits` の upsert に任せる

## 7. Memoria 受け口

Memoria に新エンドポイント:

```http
POST /api/visits/external
Content-Type: application/json

[
  {
    "ts": "2026-05-02T14:23:15.012Z",
    "domain": "github.com",
    "device_label": "iphone-of-foo",
    "device_os": "iOS",
    "source": "dns"
  },
  ...
]
```

Memoria 側の処理:
- `page_visits` upsert (URL 代わりに `dns://${domain}` を使う or 専用カラム
  `device_label`, `device_os` を追加)
- `visit_events` への 1:1 insert (時系列イベント)
- `domain_catalog` ヒットがあれば description / kind を join、 無ければ
  pending として queue 投入 (既存の `maybeQueueDomain` を使い回し)

**スキーマ拡張要否**: `visit_events` に `device_label TEXT, device_os TEXT,
source TEXT` を ALTER TABLE で追加。

## 8. 設定 (env / app_settings)

| キー | 既定 | 用途 |
|---|---|---|
| `LEGATUS_DNSTAP_ENABLED` | `false` | モジュール ON/OFF (default OFF — 明示有効化) |
| `LEGATUS_DNSMASQ_LOG_PATH` | `/var/log/dnsmasq.log` | tail 対象 |
| `LEGATUS_DNSTAP_FLUSH_MS` | `30000` | buffer flush 間隔 |
| `LEGATUS_DNSTAP_DEDUPE_MS` | `5000` | バースト dedupe 窓 |
| `LEGATUS_TAILSCALE_BIN` | `tailscale` | CLI パス |
| `LEGATUS_TAILSCALE_REFRESH_MS` | `300000` | device map 更新間隔 |
| `LEGATUS_DNSTAP_SKIP_DOMAINS` | `""` | カンマ区切り skip list |
| `LEGATUS_DNSTAP_FORWARD_URL` | `http://localhost:5180/api/visits/external` | Memoria endpoint |

## 9. オプトアウト

3 段:

1. **デバイス側**: iPhone 上で Tailscale を切る / exit node を home から外す
   → そもそも DNS が home に届かない
2. **モジュール側**: `LEGATUS_DNSTAP_SKIP_DOMAINS` で特定ドメイン (銀行 / 医療
   等) を log から除外
3. **Legatus 全体**: `LEGATUS_DNSTAP_ENABLED=false` でモジュール停止 (default)

センシティブ性が高いので **default OFF**、 ユーザーが明示有効化する設計。

## 10. テスト

`tests/dnstap-*.test.ts`:

- `dnsmasq-parser.test.ts` — query log 1 行のパース、 異常行スキップ
- `dnstap-buffer.test.ts` — 5 秒窓 dedupe、 flush 周期、 順序保持
- `tailscale-cache.test.ts` — `tailscale status --json` パース、 IP→label、
  cache TTL、 解決不能時の fallback (src_ip をそのまま label)
- `dnstap-coordinator.test.ts` — DNS 行 → DomainVisitEvent → forward の
  end-to-end、 Memoria への HTTP は mock

## 11. 後の拡張

- **Phase 2**: SNI passive tap (`tcpdump -i tailscale0`) で TCP/443 を観測。
  DNS だけだと CDN / DoH に弱いケースの補強
- **Phase 3**: bytes_sent / bytes_recv の推定 (conntrack 連携)
- **Phase 4**: HTTPS Encrypted Client Hello (ECH) 普及対応 — DNS log
  への依存を減らし、 OS 側 reporting (Apple's Privacy Report API 等) に乗り換え

## 12. 既知の制約

- **iOS 17+ Privacy Relay** が有効だと DNS が Apple/Cloudflare に飛んで home
  resolver が見えない → `Tailscale exit node` を有効化したセッションでも
  Privacy Relay 優先される。 ユーザーに「Wi-Fi 設定で Apple Private Relay を
  off にする」 周知が必要
- **Encrypted Client Hello** が広まると SNI tap が無力化される
- DNS query log は IP → device 紐付けに **Tailscale 経由のアドレスでアクセス
  された分** のみ反映。 home Wi-Fi 直で DNS 問合せた場合は別経路 (これは v0.1
  範囲外)
- データ量が多くなる (1 日数千件) のでバッファ + dedupe + Memoria 側
  page_visits 集約で管理
