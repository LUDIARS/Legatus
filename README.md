# Legatus

LUDIARS 個人 PC 常駐の **サービス代理人 (Service Envoy)**。

外部ツール (Claude Code / 自作 CLI / Web UI) から `MCP` または `POST API` で命令を受け取り、
Cernere 認証下の各 LUDIARS サービス (Actio / Memoria / Calicula 等) へ
**`PeerAdapter` (B2B WebSocket)** で代理実行する。

ユーザの個人デバイスで動作し、Cernere ユーザセッションを保持する。

```
┌──────────────┐  POST / MCP   ┌──────────────────┐  PeerAdapter WS  ┌──────────────┐
│ Claude Code  ├──────────────►│  Legatus (PC)    ├─────────────────►│ Actio        │
└──────────────┘  127.0.0.1    │                  │   (challenge)    ├──────────────┤
                               │  Electron + Hono │                  │ Memoria      │
                               │  ws + SQLite     │                  ├──────────────┤
                               │  keytar          │                  │ Calicula     │
                               └────────┬─────────┘                  ├──────────────┤
                                        │                            │ Nuntius      │
                            Cernere     │                            ├──────────────┤
                            project WS  │                            │ ...          │
                                        ▼                            └──────────────┘
                               ┌──────────────────┐
                               │ Cernere          │
                               │ (managed_project │
                               │  + relay_pairs)  │
                               └──────────────────┘
```

---

## 役割

- **Cernere ユーザセッション保持** — 一度ログインすれば常駐、refresh_token を暗号化保存
- **Cernere project identity** — `legatus` という名前で `managed_projects` に登録され、各サービスとの `relay_pairs` を持つ
- **MCP / POST API** — 同一 PC 上のツールから命令を受ける
- **Service Adapter 層** — 各ターゲットサービスへの呼び出しを per-service モジュールに分離
- **個人データ非保管** — Cernere を単一情報源とする LUDIARS ルールに準拠 (cache 以上は持たない)

非役割 (やらないこと):

- データ集計・永続化 (Memoria 等の本来サービスの責務)
- 通知配信 (Nuntius の責務)
- 多ユーザ対応 (個人 PC 前提、初期 v0.1 は single-user)

---

## 技術スタック

| 分類 | 技術 |
|------|------|
| シェル | Electron 32+ |
| バックエンド | Node.js 22+ + TypeScript + Hono |
| WS クライアント / ホスト | `ws` (Node 標準) |
| Cernere 連携 | `@ludiars/cernere-service-adapter` (PeerAdapter) |
| MCP server | `@modelcontextprotocol/sdk` |
| ローカル DB | better-sqlite3 |
| OS credential vault | `keytar` (Windows DPAPI / macOS Keychain / Linux secret-service) |
| 暗号化 | Node 標準 `crypto` (AES-256-GCM) |
| フロント (tray UI) | React 19 + Vite + Foundation UI |

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
               | IPC
               v
+-----------------------------+
| Hono backend (loopback)     |
|                             |
|  +-----------------------+  |
|  | MCP server (stdio)    |  |
|  | POST API (127.0.0.1)  |  |
|  +-----------+-----------+  |
|              |              |
|              v              |
|  +-----------------------+  |
|  | Command Router        |  |
|  | (validate + audit)    |  |
|  +-----------+-----------+  |
|              |              |
|              v              |
|  +-----------------------+  |
|  | Service Adapter Layer |  |
|  | - actio.ts            |  |
|  | - memoria.ts          |  |
|  | - calicula.ts         |  |
|  | - ...                 |  |
|  +-----------+-----------+  |
|              |              |
|              v              |
|  +-----------------------+  |
|  | PeerAdapter           |  |
|  | (cernere-service-     |  |
|  |  adapter)             |  |
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
| **project** | Legatus 自身 (B2B 通信用) | env (`CERNERE_PROJECT_CLIENT_ID` / `_CLIENT_SECRET`) | OS credential vault |
| **user**    | このマシンの所有ユーザ      | Cernere Composite popup ログイン → `accessToken` / `refreshToken` | SQLite (AES-256-GCM 暗号化) |

呼び出し時は **project credentials で PeerAdapter 経由**で Actio 等を叩き、`payload.userId` に user identity を載せる。Actio 側は Legatus を信頼している前提で `userId` を権威として扱う。

---

## セットアップ

### 前提条件

- Node.js 22+
- Cernere に `legatus` プロジェクトが登録済 (`client_id` / `client_secret` 取得済)
- Cernere の `relay_pairs` に少なくとも `(legatus, actio)` が登録済
- Actio 側に `legatus` からの peer handler が実装済 (`spec/service-schema.md` 参照)

### 1. Cernere project 登録

Cernere admin で以下を発行:

| 値 | 用途 | 環境変数 |
|----|------|---------|
| `client_id` | Legatus B2B 認証 | `CERNERE_PROJECT_CLIENT_ID` |
| `client_secret` | 同上 | `CERNERE_PROJECT_CLIENT_SECRET` |
| `project_key` | `legatus` (固定) | `CERNERE_PROJECT_KEY` |

`relay_pairs` に登録 (admin 作業):

```
(legatus, actio)
(legatus, memoria)      -- 将来
(legatus, calicula)     -- 将来
(legatus, nuntius)      -- 将来
```

### 2. インストール

```bash
git clone https://github.com/LUDIARS/Legatus.git
cd Legatus
npm install
```

### 3. 環境変数

`@ludiars/cernere-env-cli` + Infisical で管理 (LUDIARS 標準):

```bash
npm run env:setup
npm run env:initialize
npm run env:gen
```

Infisical で設定する値:

| キー | 用途 |
|------|------|
| `CERNERE_URL` | Cernere base URL |
| `CERNERE_PROJECT_CLIENT_ID` | Legatus project 認証 |
| `CERNERE_PROJECT_CLIENT_SECRET` | 同上 |
| `LEGATUS_LOCAL_PORT` | loopback POST API のポート (default: 17320) |
| `LEGATUS_DB_PATH` | SQLite ファイルパス (default: `userData/legatus.db`) |

### 4. 起動

```bash
npm run dev      # Electron + Hono backend in dev (hot reload)
npm run build    # production build
```

初回起動時に tray から **Sign in with Cernere** → popup ログイン → user_token / refresh_token 保存。

---

## API 概要

詳細は [`spec/service-schema.md`](spec/service-schema.md) を参照。

### MCP server (Claude Code 連携)

`stdio` transport で起動。Claude Code 設定ファイルに追加:

```json
{
  "mcpServers": {
    "legatus": {
      "command": "node",
      "args": ["/path/to/Legatus/dist/mcp-server.js"]
    }
  }
}
```

公開する tool 一覧 (v0.1):

| tool | 説明 |
|------|------|
| `actio_add_task` | Actio にタスクを追加 |

将来追加: `memoria_add_bookmark` / `calicula_add_event` / `nuntius_send_notification` 等。

### POST API (loopback only)

```
POST http://127.0.0.1:{LEGATUS_LOCAL_PORT}/v1/actio/tasks
Authorization: Bearer {LEGATUS_LOCAL_TOKEN}
Content-Type: application/json
```

`LEGATUS_LOCAL_TOKEN` は Legatus 起動時にランダム生成し OS credential vault に保管。MCP server は同じ token を使って POST API を叩く構造。

---

## Outbound peer commands (Legatus → 各サービス)

Legatus が他サービスに対して呼び出す peer command の一覧。各サービス側で `PeerAdapter.handle()` への登録が必要。

### v0.1 — Actio

| command | 説明 |
|---------|------|
| `tasks.create` | タスク追加 |

### 将来 — Memoria / Calicula / Nuntius / 他

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
- name / email / role 等は表示時に Cernere から fetch (キャッシュ TTL 5 分)
- **token は SQLite に AES-256-GCM 暗号化、マスタ鍵は OS credential vault** に保管

---

## 開発ステータス

**設計フェーズ (2026-05-01)** — 命名確定、service schema 作成中。実装着手前。

### 着手順序

1. ~~命名~~ (Legatus 確定)
2. ~~スタック決定~~ (Electron + Node)
3. **service schema 作成** ← 現在地
4. Actio 側 peer handler PR (Cernere admin 作業 + Actio 実装)
5. Cernere admin 作業 (`managed_projects.create` + `relay_pairs.add`)
6. Legatus repo 初期化 + scaffold
7. Legatus v0.1 実装 (Actio.tasks.create のみ)
8. Claude Code から疎通確認

---

## ライセンス

MIT
