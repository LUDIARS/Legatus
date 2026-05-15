# REVIEW_IMPLEMENTATION — Legatus

評価日: 2026-05-13
評価: **B+ (合格 — 軽微なバグ 1 件 + 設計乖離 2 件)**

## 1. 全体感

src 合計 ~1,000 行 + tests ~570 行 で v0.1 scope に見合ったサイズ。 TypeScript strict (`tsconfig.json`)、 zod による payload validation (`src/backend/services/memoria-location.ts:14-31`)、 pino structured logging、 `eventBus` 経由の WS broadcast の 4 点が一貫しており、 新規モジュール追加時の型/ログ/イベント発火パターンが定着している。

## 2. バグ / 設計乖離

| ID | severity | 場所 | 内容 |
|----|----------|------|------|
| I-1 | medium | `src/backend/owntracks/buffer.ts:81-84` | `summary === null` 分岐で **空でない buffer** に対して `sorted[0]` / `sorted[sorted.length-1]` を参照するが、 `drained.length === 0` は 1 つ上の if で弾いている のでこれ自体は安全。 ただし `[...drained].sort` で **二度目のソート** が summarizer.ts:38 と重複しており、 `pointCount` が大きい時の O(n log n) 二重コスト。 summarizer.ts に `net` だけ返す副関数を切り出すか、 summarizer 側に skipReason を含めて返す方が筋が良い |
| I-2 | medium | `src/backend/owntracks/coordinator.ts:79-110` | summary 経路で `randomUUID()` で requestId を生成しているが、 `idempotencyCache` (`src/backend/audit/idempotency.ts`) と接続されていない。 PR #1 で**未配線**。 spec §7.2 が「10 分 TTL cache」を要求しているのに class が export のみで `coordinator.ts` / `peer-adapter.ts` から `.get` / `.set` を呼んでいる箇所が grep で 0 件 |
| I-3 | low | `src/backend/server.ts:74-76` | `dbPath` の解決順序が `opts.dbPath || cfg.dbPath || join(process.cwd(), "legatus.db")` で、 cfg.dbPath は `process.env.LEGATUS_DB_PATH ?? ""` (`src/shared/config.ts:51`)。 空文字は falsy なので意図通りだが、 user-data dir (Electron `app.getPath('userData')`) を本来使うべき箇所で **cwd 依存**。 Electron 本番起動だと cwd がインストールパスになり書き込み権限不足で落ち得る |
| I-4 | low | `src/backend/owntracks/coordinator.ts:130-148` | event 即時 relay で **target ごとに requestId を毎回新規発行**。 同一 event が複数 target に流れる時に追跡しにくい。 1 event に 1 requestId を bind し、 各 target に同じ key を渡す方が audit_log の join 性が上がる |
| I-5 | low | `src/backend/services/relay-targets.ts:31` | `process.env.MEMORIA_USE_PEER_ADAPTER` を **buildRelayTargets 内で直接読む**。 `cfg` 経由で集めるポリシーから外れている。 `LegatusConfig.relays` 配下にフラグを集約すべき |

## 3. 良い実装

- `src/backend/db/crypto.ts:32-39` — `seal` で IV を per-row random、 final + getAuthTag を順序通り。
- `src/backend/owntracks/payload.ts:18-41` — zod を入れず手書き narrowing で十分高速、 `Number.isFinite` + 範囲 (`-90..90`, `-180..180`) も両方チェック。 unknown 入力に強い。
- `src/backend/owntracks/buffer.ts:62-70` — drain → buffer 再代入 → intervalStart 更新を 3 行で **rotation atomic** にしてある (event loop 内なので結果的に安全)。
- tests/owntracks-buffer.test.ts:55-78 で `vi.useFakeTimers` + `advanceTimersByTimeAsync` を使った interval timer の動作確認まで含まれており、 timer-driven flush の retro test が成立している。
- `src/backend/dnstap/coordinator.ts:31-51` で `dnsmasqLineToEvent` を pure 関数として抽出 → tests/dnstap-coordinator.test.ts でユニットテスト可能にしている分離が綺麗。

## 4. 微小な品質ノイズ

- `src/backend/server.ts:44-58` の `loadDotEnv` が手書き parser。 quote stripping は OK だが `\r` 末尾を `.trim()` で消すのみで multi-line value 非対応。 LUDIARS 標準は env-cli が gen するので実害は無いが、 `dotenv` 1 dep 入れた方が安全。
- `src/backend/peer/peer-adapter.ts:38` で `adapter.boundListenPort` をログ出力。 PeerAdapter SDK の API 変更耐性低 (typo risk)。
- `src/electron/sign-in.ts:80-91` で `persistCallbackTokens` 後に **session 確立イベントを backend に通知する経路がない**。 v0.1 では `coordinator.ts:169` で次回 event 時に `sessions.loadAny()` するため遅延 OK だが、 即座反映のためには `eventBus` イベントが欲しい。

## 5. 結論

実装品質は scaffold + v0.1 として水準を満たしている。 修正優先度は I-2 (idempotency 未配線) > I-1 (二重ソート) > I-3 (dbPath は Electron 起動時の hazard)。 残りは v0.2 で吸収可能。
