# Legatus

LUDIARS 個人 PC 常駐の **サービス代理人 (Service Envoy)**。

外部ツールや個人デバイス (OwnTracks app、将来は Claude Code / 自作 CLI / Web UI) から命令や信号を受け取り、
Cernere 認証下の各 LUDIARS サービス (Actio / Memoria / Calicula / Nuntius 等) へ
**`PeerAdapter` (B2B WebSocket)** または既存 service-key API で代理実行する。

ユーザの個人デバイスで動作し、Cernere ユーザセッションを保持する。

```
┌──────────────┐   MQTT/Tailscale   ┌──────────────────┐  PeerAdapter WS  ┌──────────────┐
│ OwnTracks    ├───────────────────►│  Legatus (PC)    ├─────────────────►│ Actio        │
│ (phone app)  │  owntracks/+/+     │  + Mosquitto     │  (challenge)     │ (placement)  │
└──────────────┘                    │                  │                  ├──────────────┤
                                    │  Electron + Hono │                  │ Memoria      │
┌──────────────┐  POST / MCP        │  ws + SQLite     │                  │ (location.   │
│ Claude Code  ├───────────────────►│  keytar          │                  │  summary)    │
└──────────────┘  127.0.0.1 (v0.2+) └────────┬─────────┘                  └──────────────┘
                                             │
                                  Cernere    │
                                  project WS │
                                             ▼
                                    ┌──────────────────┐
                                    │ Cernere          │
                                    │ (managed_project │
                                    │  + relay_pairs)  │
                                    └──────────────────┘
```

---

## v0.1 の主機能 — OwnTracks 受信

Legatus 直近の主目的は **OwnTracks の GPS 情報を MQTT で受けて Memoria と Actio に渡す**こと。
従来 Imperativus (DMZ) で受けていた処理を Legatus に移し、センシティブな位置情報が DMZ を通らない構成にする。

### 入力

- OwnTracks Recorder/iOS/Android アプリが Tailscale 経由で **Legatus PC 同居の Mosquitto** に publish
- Topic: `owntracks/<user>/<device>` (デフォルト)
- Payload: `_type='location'` の JSON (`lat`, `lon`, `tst`, `vel`, ...)

### 出力

| 宛先 | プロトコル | コマンド | 流量 |
|------|----------|---------|------|
| **Actio Placement** | HTTP + service-key (v0.2 で PeerAdapter 移行予定) | `POST /api/placement/locations` | 1 event ごとに即時 |
| **Memoria** | PeerAdapter (Cernere 経由) | `location.summary.append` | 5 分ごとの集計 1 件 |

### 集計ポリシー

- 個別の location event は **Legatus の memory にのみ載せる**。SQLite には保存しない。
- 5 分ごとに集計して Memoria に **サマリだけ**送る (start/end/累積距離/最大速度/点数)。
- buffer 空 = 何もしない。`netDistanceMeters < 100m` (動いていない) = 何もしない。
- 個人データ非保管ポリシー (LUDIARS § AIFormat) に準拠。

詳細は [`spec/service-schema.md`](spec/service-schema.md) §3.1 / §3.2 を参照。

---

## 役割

- **Cernere ユーザセッション保持** — 一度ログインすれば常駐、refresh_token を暗号化保存
- **Cernere project identity** — `legatus` という名前で `managed_projects` に登録され、各サービスとの `relay_pairs` を持つ
- **OwnTracks (MQTT) 受信** — phone から Tailscale 経由で publish された GPS を購読
- **集計 + 転送** — 即時転送 (Actio) と 5 分集計 (Memoria) を分担
- **個人データ非保管** — Cernere を単一情報源とする LUDIARS ルールに準拠、Legatus 側は session token と audit log のみ保持

非役割 (やらないこと):

- 位置情報の永続保管 (Memoria に集計済みサマリだけ預ける)
- 多ユーザ対応 (個人 PC 前提、初期 v0.1 は single-user)
- 通知配信 (Nuntius の責務)

---

## 技術スタック

| 分類 | 技術 |
|------|------|
| シェル | Electron 33+ |
| バックエンド | Node.js 22+ + TypeScript + Hono |
| MQTT クライアント | mqtt.js |
| WS / Cernere 連携 | `@ludiars/cernere-service-adapter` (PeerAdapter) |
| ローカル DB | better-sqlite3 (audit_log + 暗号化された Cernere session token) |
| OS credential vault | `keytar` (Windows DPAPI / macOS Keychain / Linux secret-service) |
| 暗号化 | Node 標準 `crypto` (AES-256-GCM) |
| バリデーション | zod |

---

## アーキテクチャ

### 内部レイヤー

```
+-----------------------------+
| Electron main (tray UI)     |
| - Sign-in popup             |
| - Status indicator          |
+--------------+--------------+
               |
               | (in-process)
               v
+-----------------------------+
| Backend (Hono, in-process)  |
|                             |
|  +-----------------------+  |
|  | OwnTracks coordinator |  |
|  |  - mqtt.js subscriber |  |
|  |  - LocationBuffer     |  |
|  |    (5min flush)       |  |
|  +-----------+-----------+  |
|              |              |
|              v              |
|  +-----------------------+  |
|  | Service Adapter Layer |  |
|  |  - actio-placement    |  |
|  |    (HTTP service-key) |  |
|  |  - memoria-location   |  |
|  |    (PeerAdapter)      |  |
|  +-----------+-----------+  |
|              |              |
|              v              |
|  +-----------------------+  |
|  | PeerAdapter           |  |
|  | (cernere-service-     |  |
|  |  adapter, caller-only)|  |
|  +-----------+-----------+  |
+--------------|--------------+
               |
               v
        Cernere + targets
```

### 認証レイヤー

Legatus は **2 つの Cernere identity** を同時に保持する:

| Identity | 何を表すか | 取得方法 | 保管場所 |
|----------|-----------|---------|---------|
| **project** | Legatus 自身 (B2B 通信用) | env (`CERNERE_PROJECT_CLIENT_ID` / `_CLIENT_SECRET`) | OS credential vault (将来) |
| **user**    | このマシンの所有ユーザ      | Cernere Composite popup ログイン → `accessToken` / `refreshToken` | SQLite (AES-256-GCM 暗号化) |

呼び出し時は **project credentials で PeerAdapter 経由**で Memoria を叩き、`payload.userId` に user identity を載せる。
Actio Placement は既存の HTTP service-key API を使うため、`payload.user_id` に user identity を載せて転送する。

---

## セットアップ

### 前提条件

- Node.js 22+
- Tailscale (phone と PC 両方に install + 同一 tailnet)
- Mosquitto (Legatus PC 同居)
- Cernere に `legatus` プロジェクトが登録済 (`client_id` / `client_secret` 取得済 — Cernere migration 020 で seed 済)
- Cernere `relay_pairs` に `(legatus, memoria)` が登録済 (将来 `(legatus, actio)` も)
- Actio 側に `legatus` からの placement service-key が共有済

### 1. インストール

```bash
git clone https://github.com/LUDIARS/Legatus.git
cd Legatus
npm install
```

### 2. 環境変数

`@ludiars/cernere-env-cli` + Infisical で管理 (LUDIARS 標準):

```bash
npm run env:setup
npm run env:initialize
npm run env:gen
```

Infisical で設定する主要キー:

| キー | 用途 |
|------|------|
| `CERNERE_URL` | Cernere base URL |
| `CERNERE_PROJECT_CLIENT_ID` | Legatus project 認証 |
| `CERNERE_PROJECT_CLIENT_SECRET` | 同上 |
| `OWNTRACKS_MQTT_URL` | Mosquitto URL (default `mqtt://127.0.0.1:1883`) |
| `OWNTRACKS_MQTT_USERNAME` / `_PASSWORD` | Mosquitto 認証 (推奨) |
| `OWNTRACKS_MQTT_TOPIC` | 購読 topic (default `owntracks/+/+`) |
| `LEGATUS_LOCATION_FLUSH_INTERVAL_MS` | Memoria 転送間隔 (default 300_000 = 5 分) |
| `LEGATUS_LOCATION_MIN_DISPLACEMENT_M` | "動いていない" 判定の閾値 (default 100m) |
| `ACTIO_BASE_URL` | Actio 本体 URL |
| `ACTIO_PLACEMENT_SERVICE_KEY` | Actio Placement Module の service-key |

詳細は `.env.example` 参照。

### 3. Mosquitto + Tailscale 設定

別途 OwnTracks 側のセットアップガイドあり (本 README とは別。Legatus PC で `mosquitto` を install
→ Tailscale tailnet IP のみ listen → phone OwnTracks app に Tailscale IP + topic prefix `owntracks/<user>/<device>` を設定)。

### 4. 起動

```bash
npm run dev:backend   # MQTT subscriber + PeerAdapter のみ (Electron なし、開発時)
npm run dev           # Electron + tray + backend (本番形態)
npm run build         # production build
```

初回起動時に tray から **Sign in with Cernere** → popup ログイン → user_token / refresh_token 保存。
sign in 前は OwnTracks event は受信しても drop される。

---

## API 概要

詳細は [`spec/service-schema.md`](spec/service-schema.md) を参照。

### 現在 (v0.1)

| 方向 | 通信 | 用途 |
|------|------|------|
| OwnTracks (phone) → Legatus | MQTT (Tailscale) | GPS publish 受信 |
| Legatus → Actio Placement | HTTP + service-key | location event 即時転送 |
| Legatus → Memoria | PeerAdapter | 5 分集計サマリ転送 |
| (loopback) → Legatus `/health` | HTTP | 死活確認 |
| (loopback) → Legatus `/v1/status` | HTTP | sign-in 状態確認 |

### v0.2+ (予定 / backlog)

| 方向 | 通信 | 用途 |
|------|------|------|
| Claude Code → Legatus MCP | stdio | `actio_add_task` / `memoria_add_bookmark` 等の代理操作 |
| (loopback) → Legatus `/v1/actio/tasks` | HTTP + Bearer | POST API 経由のタスク投入 |
| Actio Placement | HTTP → PeerAdapter 移行 | 通信統一 |

---

## Outbound peer commands (Legatus → 各サービス)

### v0.1 — Memoria

| command | 説明 |
|---------|------|
| `location.summary.append` | 5 分集計された移動サマリ |

### 将来 — Actio (v0.2 で peer 化)

| command | 説明 |
|---------|------|
| `placement.location.update` | OwnTracks event ごと転送 (現在は HTTP) |
| `tasks.create` | タスク追加 (v0.2+ MCP で再開) |

### 将来 — Calicula / Nuntius / 他

`spec/service-schema.md` の各 service セクションに追記。

---

## Inbound peer commands (各サービス → Legatus)

将来用 (v0.1 では未実装)。サービス側からの event push 受信:

| command | 想定用途 |
|---------|---------|
| `notify` | サービスからユーザへの通知を Legatus 経由で push |
| `health` | Legatus 死活確認 |

---

## 個人データポリシー

LUDIARS ルール準拠:

- **個人データは Cernere を単一情報源** とする
- Legatus は user.id と Cernere refresh_token のみ保持 (暗号化)
- name / email / role 等は表示時に Cernere から fetch
- **token は SQLite に AES-256-GCM 暗号化、マスタ鍵は OS credential vault** に保管
- **個別の GPS 座標は SQLite に保存しない** (memory のみ、5 分後に集計 → 破棄)
- audit_log は Legatus 内部だけに残る

---

## 開発ステータス

**v0.1 scaffold + OwnTracks receiver 実装中 (2026-05-01)**

### 着手順序

1. ~~命名~~ (Legatus 確定)
2. ~~スタック決定~~ (Electron + Node)
3. ~~service schema 作成~~ (v0.1.0-draft)
4. ~~Cernere admin 作業~~ (`managed_projects.create` + `relay_pairs.add`、 Cernere PR #76)
5. ~~Legatus repo 初期化 + scaffold~~
6. **v0.1 実装** ← 現在地 (本 PR)
7. Memoria 側 `location.summary.append` peer handler 実装 (別 PR)
8. Actio 側で `placement.locations` を peer command 化 (v0.2)

---

## ライセンス

MIT
