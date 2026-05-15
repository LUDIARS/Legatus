# REVIEW — Legatus (summary)

評価日: 2026-05-13
レビュー対象: PR #1 で merge された v0.1 scaffold + OwnTracks/dnstap forwarder
範囲: README.md / DESIGN.md (なし) / spec/service-schema.md / spec/dns-sni-tap.md / src/ / tests/

## 1. 評価サマリ

| 観点 | 評価 | キーポイント |
|------|------|-------------|
| Design | **B+** | spec ↔ impl の追跡性良好、 個人データ非保管ポリシー遵守、 idempotency 設計と Mem HTTP の認証線が薄い |
| Vulnerability | **B**  | 公衆攻撃面ほぼ無し、 Memoria HTTP relay の認証なし + MQTT auth optional が中位リスク |
| Implementation | **B+** | strict TS / zod / pino / event bus が一貫、 idempotency cache 未配線 + Electron 起動時 cwd 依存 |
| Missing Features | **B**  | v0.1 scope は完遂、 MCP/POST API + bearerAuth/idempotencyCache が dead code |
| Quality | **A-** | 1 ファイル 1 責務 + tests 12 個 + 構造化ログ + 詳細コメント、 HTTP relay の test 未整備 |

総合: **B+ (weighted_score 79)**

加重式: `Design 0.20 + Vuln 0.25 + Impl 0.25 + Missing 0.15 + Quality 0.15`
B+ = 82, B = 75, A- = 87 を点数換算: `82*0.20 + 75*0.25 + 82*0.25 + 75*0.15 + 87*0.15 = 79.45`

## 2. 主要所見

1. **OwnTracks → Memoria/Actio forwarder の v0.1 必須機能は揃っている** — MQTT 購読 / 即時 Actio Placement / 5 分集計 Memoria summary / Skip 条件 / Cernere session 暗号化 / audit_log / health/status / WS broadcast すべて実装済
2. **dead code 2 件** — `IdempotencyCache` (`src/backend/audit/idempotency.ts`) と `bearerAuth` middleware (`src/backend/http/auth-middleware.ts`) が export されているが usage 0。 spec §5.2/§7.2 で約束した経路の hook が未配線
3. **認証線が薄い 2 箇所** — Memoria HTTP relay (`src/backend/services/memoria-location-http.ts:38-61`) は service-key 無し、 Mosquitto auth は optional。 tailnet 設定ミスで GPS が漏れ得る
4. **個人データ非保管ポリシーは厳格に遵守** — `LocationBuffer.flush()` で drain → 破棄を atomic 化、 audit_log は userId/command のみ。 LUDIARS AIFormat §5 適合
5. **scaffold としての code hygiene は高い** — 1 ファイル 1 責務 / 全モジュール `createChildLogger` / spec §番号をコメントに明示 / fake-timer による interval flush test まで作り込み

## 3. 件数

- 重要度高: 0
- 中位: 5 (V-1 Memoria HTTP 認証なし / V-2 .env 配置 / I-1 二重ソート / I-2 idempotency 未配線 / M-3 bearerAuth dead code)
- 低位: 14
- 良い点: 6

## 4. 次に着手すべき優先度

1. **M-3 / Q-2** `bearerAuth` の配線 (v0.2 POST API 開始時に必須) または削除判断
2. **M-1 / I-2** `IdempotencyCache` を coordinator から配線 (spec §7.2)
3. **V-1** Memoria 側 spec に `x-legatus-service-key` 等を追加 + Memoria 側 endpoint 完成と同期
4. **I-3** Electron 本番起動時の `dbPath` を `app.getPath('userData')` ベースに変更
5. **M-6** tray UX (sign-in 以外の操作) の最低限整備
