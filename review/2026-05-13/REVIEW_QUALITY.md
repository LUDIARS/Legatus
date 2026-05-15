# REVIEW_QUALITY — Legatus

評価日: 2026-05-13
評価: **A- (良好)**

## 1. テスト

| 観点 | 結果 |
|------|------|
| テストファイル数 | 12 (PR #1 説明の「28 テスト pass」と整合) |
| カバレッジ対象 | crypto / session store / sign-in callback / idempotency / owntracks (buffer + payload + summarizer) / dnstap (buffer + config + coordinator + dnsmasq + tailscale) |
| 抜け | HTTP relay 経路 (`services/actio-placement.ts`, `services/memoria-location-http.ts`) の network mock test なし |
| 良点 | `tests/owntracks-buffer.test.ts:55-78` で fake timer による interval-driven flush の動作までカバー |

ユニットレベルのカバレッジは scaffold としては合格。 integration (mqtt broker→backend→relay 結合) は未整備だが PR #1 の scope 外。

## 2. コード品質

| 観点 | 評価 |
|------|------|
| TypeScript strict | `tsconfig.json` で strict、 `tsc --noEmit` を lint script として使用 (`package.json:20`) — 適合 |
| ロギング | `pino` + `createChildLogger` で **全モジュールが child logger を必ず使用** (12 ファイルすべて `createChildLogger("<module>")`)。 構造化ログが揃っている |
| エラー型 | `LegatusError` 単一型で code / message を統一 (`src/shared/errors.ts`) |
| バリデーション | zod を Memoria peer payload で使用 (`memoria-location.ts:14-31`)、 手書き narrowing を payload.ts で使用 — 場面で使い分けされている |
| コメント | 全ファイル先頭に **責務 + 設計判断** を 5-10 行で記述。 spec の §番号を明示している箇所が多く読みやすい |
| import 形式 | ESM (`type: "module"`) + `.js` 拡張子付き relative import 統一 |

## 3. ファイル構成

```
src/backend/
  owntracks/       (client / buffer / coordinator / config / payload / summarizer / types)
  dnstap/          (client / buffer / coordinator / config / dnsmasq / tailscale / types)
  services/        (actio-placement / actio / memoria-location / memoria-location-http / relay-targets)
  auth/            (cernere-session / keychain)
  audit/           (audit-log / idempotency)
  db/              (index / schema / crypto)
  http/            (app / auth-middleware / error-handler)
  peer/            (peer-adapter)
```

各モジュールが 1 責務 = 1 ファイル + types を分離 + tests と 1:1 対応する LUDIARS 標準形に綺麗にハマっている。

## 4. 改善余地

| ID | severity | 場所 | 内容 |
|----|----------|------|------|
| Q-1 | low | `src/backend/audit/idempotency.ts` | export されているが usage 0 = dead code。 配線するか v0.2 まで削除 |
| Q-2 | low | `src/backend/http/auth-middleware.ts` | 上と同じく未使用 (`bearerAuth` を import している箇所が 0) |
| Q-3 | low | `package.json:15-16` | `dev` / `dev:backend` が `../Cernere/...` への相対参照を持つ。 sibling repo 前提が hardcode。 仕方ない LUDIARS 流儀だが README にも明記したほうが clone 直後の人が詰まらない |
| Q-4 | low | `src/backend/server.ts:44-58` | 手書き dotenv parser。 lint が通っても multi-line value で壊れる |
| Q-5 | low | `src/backend/services/relay-targets.ts:31` | env を `cfg` 経由でなく直接 process.env から読む 1 箇所 — config 経路の純度が下がる |
| Q-6 | low | `src/backend/owntracks/coordinator.ts:80,124` | summary 経路で `randomUUID` + event 経路でも別 `randomUUID` を発行。 audit_log の join 性のため event/summary で **`source.requestId` 命名を統一** したい |
| Q-7 | low | `src/backend/db/index.ts:10` | `db: Database | null = null` の module-singleton。 test での再 open に `closeDb()` 経由が必須で test isolation が脆い。 1 instance を `LegatusBackend` class に格納する方が test friendly |

## 5. ドキュメント

- `README.md` は 318 行で構成 / 役割 / セットアップ / API 概要 / スケジュール の網羅性良好。
- `spec/service-schema.md` は version + バージョニング規約 + target チェックリスト (§9) があり well-formed。
- `infra/mosquitto/README.md` は別途存在 (内容未確認だが docker-compose と連動)。
- 不足: **CLAUDE.md なし**。 LUDIARS 他リポは AI 用ガイドを置く慣習なので、 v0.2 着手前に追加した方が再開コストが下がる。

## 6. 結論

scaffold 段階としては code hygiene / test coverage / docs の三拍子が揃っており **A-**。 q-1/q-2 の dead code はそのまま放置すると半年後に「何のためにあるんだっけ」になりやすいので、 v0.2 開始時に **使うか消すか** を即決すべき。
