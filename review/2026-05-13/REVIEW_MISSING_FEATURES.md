# REVIEW_MISSING_FEATURES — Legatus

評価日: 2026-05-13
評価: **B (v0.1 宣言 scope はカバー / 周辺ピースに不足)**

## 1. v0.1 scope に対する充足度

| spec の要件 | 実装場所 | 充足 |
|------------|---------|------|
| OwnTracks MQTT subscribe | `src/backend/owntracks/client.ts:35-43` | ◎ |
| 即時 Actio Placement HTTP relay | `src/backend/services/actio-placement.ts:33-65` | ◎ |
| 5 分集計 Memoria summary | `src/backend/owntracks/buffer.ts` + `services/memoria-location-http.ts` | ◎ |
| Skip 条件 (空 / netDistance < 100m) | `src/backend/owntracks/summarizer.ts:46` + `buffer.ts:68-99` | ◎ |
| Cernere session 暗号化保存 | `src/backend/auth/cernere-session.ts:37-66` | ◎ |
| keytar マスタ鍵 | `src/backend/auth/keychain.ts:35-41` | ◎ |
| audit_log | `src/backend/audit/audit-log.ts:22-47` | ◎ |
| `/health` `/v1/status` | `src/backend/http/app.ts:37-51` | ◎ |
| WS broadcast (`/ws`) | `src/backend/server.ts:127` (`attachWsServer`) | ◎ |

→ **v0.1 で謳った OwnTracks forwarder の必須機能は揃っている**。

## 2. 不足機能

| ID | 場所 | severity | 内容 |
|----|------|----------|------|
| M-1 | `src/backend/audit/idempotency.ts` | medium | `IdempotencyCache` クラスは作られたが **どこからも `.get`/`.set` されていない** (`Grep` で usage 0)。 spec §7.2 で 10 分 TTL cache を要求しているが、 outbound peer call の冪等性が target 側完全依存になっている。 同一 event が複数 target に行く時 (Actio + Memoria) も coordinator.ts 内で requestId を毎回新規発行 (`coordinator.ts:79, 125`) |
| M-2 | (未実装) | medium | spec §5.1 の **MCP server (stdio)** が未着手。 README.md:243-247 で v0.2+ と書き換えてあるが、 spec §5.1 の `actio_add_task` ツール定義はあるのに backend 側 dispatcher が無い (`src/backend/http/app.ts:37-51` に POST 経路無し)。 v0.2 開始時の差分量が大きい |
| M-3 | (未実装) | medium | spec §5.2 の **POST `/v1/actio/tasks`** + spec §5.3 の Bearer-token 経路。 `bearerAuth` middleware は作られたが (`src/backend/http/auth-middleware.ts:13-22`) 適用しているルートが 0。 → middleware が dead code 化している |
| M-4 | spec §3.2.2 v0.2+ | low | Memoria の `bookmarks.create` / `dig.append` / `dictionary.add` / `diary.append` の **placeholder すら無い**。 spec で v0.2+ 予約済 |
| M-5 | spec §4 | low | Inbound peer command (`legatus.health` / `legatus.notify`) が `accept: {}` 空 (`src/backend/peer/peer-adapter.ts:31`)。 v0.3+ 予定なので OK だが、 `accept` 配下に **空 stub すらない** ため誤って caller-only と思われ得る |
| M-6 | Electron tray | medium | `src/electron/main.ts` + `tray-icon.ts` (13 行) を確認するに、 tray の **Sign-in ボタン以外の機能** (start/stop, status, restart) が未実装。 README.md:223-225 で「tray から Sign in」を約束しているが UX 全体は粗 |
| M-7 | dnstap | low | `LEGATUS_DNSTAP_ENABLED=false` default で OFF だが、 enable 時に `tail -F` 相当の rotate 追従なし (`dnstap/coordinator.ts:75-77` のコメントに自己申告あり)。 log rotation で event lost が決定的 |
| M-8 | DB retention | low | audit_log の prune / vacuum 機構が一切なし (`audit-log.ts` に該当メソッド無し)。 long-running 想定に対する gap |
| M-9 | テスト | low | `services/relay-targets.ts` と `services/memoria-location-http.ts` の HTTP relay 経路に対する **unit test なし** (`tests/` ディレクトリに http relay test 不在)。 owntracks 集計 → fetch までは未到達 |

## 3. 推奨追加 (将来)

- `legatus session` 操作の CLI (sign-in / sign-out / status を tray なしで叩く)
- `audit_log` viewer (Memoria UI の `legatus` セクション)
- OwnTracks 以外の入力源 (Garmin Connect / Tasker / iOS Shortcuts) の adapter
- `relay-targets.ts` の構成を Memoria コマンド単位に展開 (bookmarks/dig 等の future hook 用)

## 4. 結論

v0.1 で謳ったコア機能 (OwnTracks → Memoria/Actio) は通過。 **idempotency cache の未配線 (M-1)** と **Bearer middleware が dead code (M-3)** の 2 件は spec で約束したのに hooks がない欠落で、 v0.2 の冒頭に持ってきて潰すのが妥当。 MCP / POST API (M-2/M-3) は v0.2 開始時点で順次実装予定なので scope 外として OK。
