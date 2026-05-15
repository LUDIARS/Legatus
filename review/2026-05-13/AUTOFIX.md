# AUTOFIX — Legatus

評価日: 2026-05-13
autofix_count: **0** (本レビューでは列挙のみ、 ソースコード修正なし)

## 1. 方針

ユーザ要請により本 review run ではコード修正を行わない。 下記は次回 auto-fix run / PR 化候補の「安全範囲」リスト。 全項目とも実装影響範囲を src/ 1 箇所に限定でき、 既存 28 tests を破壊しない見込み。

## 2. 安全に自動修正可能な候補 (列挙のみ)

| ID | 対象 | 改修内容 | risk |
|----|------|---------|------|
| A-1 | `src/backend/services/relay-targets.ts:31` | `process.env.MEMORIA_USE_PEER_ADAPTER` の直読みを `LegatusConfig.relays.memoria.usePeerAdapter` に移送し、 `src/shared/config.ts` の `RelayTargetsConfig` に同フラグを足す | low (型追加 + 1 行差し替え) |
| A-2 | `src/backend/audit/idempotency.ts` | コメントを「dead code (v0.2 で配線予定 — spec/service-schema.md §7.2)」に書き換える。 暫定で TODO marker 付与 | low |
| A-3 | `src/backend/http/auth-middleware.ts` | 同上、 dead code 警告コメント追加 | low |
| A-4 | `src/backend/owntracks/coordinator.ts:80,124` | summary 経路の `randomUUID()` を coordinator 起動時に確保した seq counter (or UUIDv7) に変更し、 event 経路と一貫した naming にする | medium (audit_log の format 影響 — 既存テストは name を見てないので OK) |
| A-5 | `src/backend/owntracks/buffer.ts:80-84` | skip 経路で `[...drained].sort(...)` が summarizer.ts の二度目ソートになっている問題。 `summarizeBuffer` を変更して `{summary, skipReason, netMeters}` を返す形に拡張 | medium (summarizer の return 型変更 → tests/owntracks-summarizer.test.ts を 1 箇所修正) |
| A-6 | `src/backend/server.ts:44-58` | 手書き dotenv parser を `dotenv` npm package に差し替え (1 dep 追加 + 5 行削除) | low |
| A-7 | `src/backend/audit/audit-log.ts` | `prune(before: number)` メソッド追加 (90 日 retention の default policy)。 server.ts の起動時に 1 度呼ぶ | low |
| A-8 | `.env.example` | `OWNTRACKS_MQTT_USERNAME` / `_PASSWORD` の必須化 (空 default → required コメント変更) + README に明記 | low (docs only) |
| A-9 | `src/backend/db/index.ts:10` | module-singleton を class 化して test isolation を改善 | high (refactor — server.ts / electron/main.ts も書き換え。 autofix 範囲外、 別 PR) |
| A-10 | dnstap 関連 | rotate 追従の TODO コメントが既にあるので chokidar 化提案 | high (npm dep + 設計変更) |

## 3. 本 run では実施しない理由

- 指示が「列挙のみ、 ソースコード修正禁止」(autofix_count=0)
- LUDIARS 個人 PC 常駐サービスの中核 (位置情報) を扱うため、 自動修正は最小範囲のみに留めるのが安全
- M-1 (idempotency 配線) と V-1 (Memoria HTTP 認証) は **spec 確定 + Memoria 側修正** と同期が必要なので autofix 不適

## 4. 次回 auto-fix run で着手するなら

A-1 / A-2 / A-3 / A-6 / A-7 / A-8 の 6 項目を同一日付ブランチ `chore/review-2026-05-13-autofix` で 1 PR 化することを推奨。 影響範囲が docs + comment + 1 関数追加 + 1 依存追加に閉じる。
