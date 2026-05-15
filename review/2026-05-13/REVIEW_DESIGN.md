# REVIEW_DESIGN — Legatus

評価日: 2026-05-13 / レビュー対象: v0.1 scaffold + OwnTracks/dnstap forwarder
評価: **B+ (合格)**

## 1. 設計コンセプトの整合性

`README.md` と `spec/service-schema.md` (version 0.1.0-draft) が「個人 PC 常駐の Service Envoy」「Cernere ユーザセッション保持」「個別 GPS を SQLite に保存しない」という核ポリシーを一貫して述べており、LUDIARS の AIFormat §5 (Cernere 単一情報源) と整合している。`spec/service-schema.md:233-239` の **skip 条件** (buffer 空 / netDistance < 100m / session 未取得) は実装 `src/backend/owntracks/buffer.ts:62-99` の挙動とそのまま一致しており、 spec → impl の追跡性は良好。

## 2. レイヤ分割

`server.ts` (起動 lifecycle) / `owntracks/coordinator.ts` (購読+集計) / `services/relay-targets.ts` (target ビルダー) / `peer/peer-adapter.ts` (Cernere caller) の 4 層分離は spec §2.1 の caller-only 設計をきれいに踏んでいる。
特に `RelayTarget` (`src/backend/owntracks/coordinator.ts:31-37`) で `forwardEvent` (即時) と `forwardSummary` (集計) を **interface 1 つで両方に対応** させた点は良い。Actio が v0.2 で peer 化された時の差し替え点が `services/relay-targets.ts` 1 箇所に閉じる。

## 3. Cernere モード OFF 共存

`README.md:160-180` のセットアップ手順は Cernere 必須を匂わせるが、 実装は `src/shared/config.ts:35` の `cernereEnabled` 自動判定で **env 3 つが空なら HTTP 経路のみで動く**形になっており、v0.1 で「ローカル + tailnet」だけで完結する設計判断は spec/README の妥協線として現実的。 PR #1 の段階的展開戦略として妥当。

## 4. 個人データ非保管ポリシー

`spec/service-schema.md:285-294` で「個別 GPS は SQLite に保存しない (memory のみ 5 分後に集計 → 破棄)」と明記。実装 `LocationBuffer.flush()` で `this.buffer = []` (`buffer.ts:63`) と drain → 破棄を 1 ステップで行っており、 中間状態が露出しない設計。 audit_log には userId/requestId しか残らない (`audit-log.ts:31-40`)。

## 5. 弱点

| ID | 内容 | severity |
|----|------|----------|
| D-1 | `src/backend/server.ts:88-110` で `dnstap` が **v0.1 scope に含まれているのに spec/service-schema.md には §3.x として明記がない** (別 spec `spec/dns-sni-tap.md` 参照のみ)。 service schema version 0.1.0-draft で network-tap も同梱されるなら schema にも目次レベルで触れるべき | low |
| D-2 | `spec/service-schema.md:295-297` の Skip 条件「Cernere user session 未取得時は drop」は実装 `coordinator.ts:166-170` で `LEGATUS_OWNER_USER_ID` fallback が **session より優先**して採用されており、 spec の文言と順序が逆 (実装側が現実的だが spec が古い) | low |
| D-3 | `README.md:84` で「DB は audit_log + 暗号化 Cernere session token」だが、`docker-compose.yaml` (Mosquitto) と `legatus.db-wal` 4MB の WAL 増大を見るに、 audit_log の retention policy が未定 (`audit-log.ts` に prune なし) | medium |
| D-4 | spec §3.1.1 / §3.2.1 で `idempotencyKey` の生成責任を Legatus 側と書いているが、 `coordinator.ts:79` では `randomUUID()` を毎回新規発行するだけで、 同一 event の再送/再起動後の重複は target 側依存。 spec §7.2 の「10 分 TTL cache」が実装に未到達 (`audit/idempotency.ts` は class のみで未使用) | medium |

## 6. 結論

scaffold + OwnTracks v0.1 という宣言された scope に対して spec / 実装 / テストの 3 つが緊密に揃っており、設計面の決定事項 (Cernere optional / memory-only GPS / caller-only PeerAdapter / 5分集計) は LUDIARS ポリシーに矛盾しない。 minor な 4 点 (上記 D-1〜D-4) を v0.2 で吸収すれば B+ → A に上げられる。
