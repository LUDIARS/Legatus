# Legatus — Service Schema

Legatus が他 LUDIARS サービスとやり取りする WS インタフェースの formal な仕様。
Cernere `PeerAdapter` を介した B2B 通信のコマンドカタログ。

最終更新: 2026-05-01 / version: 0.1.0-draft

---

## 0. 用語

| 用語 | 意味 |
|------|------|
| **caller** | invoke 元の project (PeerAdapter caller info の `caller.projectKey`) |
| **target** | invoke 先の projectKey (`actio` / `memoria` / ...) |
| **peer command** | `PeerAdapter.invoke(target, action, payload)` で送る単位、`action` は `<module>.<verb>` 形式 |
| **user_id** | Cernere の `users.id` (UUID v4) |
| **legatus** | 本サービスの projectKey (Cernere `managed_projects` 上の名前) |

---

## 1. Cernere project 登録仕様

### 1.1 managed_projects エントリ

```jsonc
{
  "projectKey": "legatus",
  "name": "Legatus",
  "description": "Personal-PC service envoy. Bridges external tools to LUDIARS services.",
  "client_id": "<generated>",
  "client_secret": "<generated>"
}
```

### 1.2 relay_pairs

Legatus が呼び出す各 target を双方向ペアとして登録:

```
(legatus, actio)
(legatus, memoria)       -- v0.2+
(legatus, calicula)      -- v0.2+
(legatus, nuntius)       -- v0.2+
```

逆向き (target → legatus) は **inbound peer command** が実装される時点で追加。
v0.1 では legatus は invoker のみで receiver 機能を持たない。

### 1.3 project_definition

Cernere の `Project_definition.Create` で以下を登録 (任意、可視性のため):

```jsonc
{
  "code": "legatus",
  "name": "Legatus",
  "dataSchema": {},
  "commands": [
    "actio.tasks.create"
  ],
  "pluginRepository": "https://github.com/LUDIARS/Legatus"
}
```

---

## 2. PeerAdapter 設定

### 2.1 Legatus 側 (caller)

```typescript
import { PeerAdapter } from "@ludiars/cernere-service-adapter";

const sa = new PeerAdapter({
  projectId:       env.CERNERE_PROJECT_CLIENT_ID,
  projectSecret:   env.CERNERE_PROJECT_CLIENT_SECRET,
  cernereBaseUrl:  env.CERNERE_URL,
  saListenHost:    "127.0.0.1",
  saListenPort:    0,
  saPublicBaseUrl: "ws://127.0.0.1:{port}",
  accept: {
    // v0.1: inbound 受信なし。将来サービスから event push を受ける場合に追加
  },
});

await sa.start();

// 呼び出し例
const result = await sa.invoke<ActioTasksCreateResponse>(
  "actio",
  "tasks.create",
  { userId, title: "牛乳", ... },
);
```

### 2.2 Target 側 (Actio 等)

各 target は `accept.legatus` に許可コマンドを宣言:

```typescript
const sa = new PeerAdapter({
  ...,
  accept: {
    legatus: ["tasks.create", "tasks.update", "tasks.delete"],
  },
});

sa.handle("tasks.create", async (caller, payload) => {
  if (caller.projectKey !== "legatus") {
    throw new PeerError("forbidden", "Only legatus can call tasks.create");
  }
  // payload.userId をオーナーとしてタスク作成
  return await taskRepo.create({ userId: payload.userId, ... });
});
```

`accept.legatus` で許可しない command は forbidden で reject される (fail-closed)。

---

## 3. Outbound peer commands

Legatus が呼び出す peer command 一覧。各サービス側で実装が必要。

### 3.1 Actio

projectKey: `actio`

#### 3.1.1 `tasks.create`

タスクを Actio に追加する。

**Caller**: `legatus`
**Direction**: `legatus → actio`
**Idempotency**: `idempotencyKey` 指定時は重複回避。同 key + 同 userId は同一タスクを返す。

**Payload (request)**:

```typescript
{
  userId: string;              // Cernere users.id (UUID v4) — 必須
  title: string;               // 1 <= len <= 200
  body?: string;               // Markdown 可、最大 10000 文字
  deadline?: string;           // ISO 8601 datetime (UTC 推奨)
  tags?: string[];             // 各 tag は [a-z0-9-_]{1,32}
  priority?: "low" | "normal" | "high";   // default: "normal"
  pluginRef?: {                // Actio task plugin への外部参照 (optional)
    pluginId: string;          // 例: "pm" / "voting"
    externalId: string;        // 各 plugin が解釈する文字列
  };
  idempotencyKey?: string;     // UUID 推奨、同一 key の再送は冪等
  source?: {                   // 監査用、Actio が operation_logs に記録
    via: "legatus";
    tool: string;              // "claude-code" / "mcp" / "post-api" / etc.
    requestId?: string;        // Legatus 側の request id
  };
}
```

**Response (success)**:

```typescript
{
  id: string;                  // Actio tasks.id (UUID v4)
  userId: string;              // 確認用 echo
  title: string;
  deadline: string | null;     // ISO 8601 or null
  priority: "low" | "normal" | "high";
  createdAt: string;           // ISO 8601
  url?: string;                // Actio frontend での deep link (省略可)
}
```

**Errors**:

| code | message 例 | 意味 |
|------|-----------|------|
| `bad_request`        | "title is required" | payload バリデーション失敗 |
| `forbidden`          | "Only legatus can call tasks.create" | caller が legatus でない |
| `user_not_found`     | "userId not in Actio users" | 該当 userId が Actio 側に未存在 |
| `quota_exceeded`     | "task limit reached" | (将来) ユーザのタスク上限 |
| `internal_error`     | "..." | Actio 内部エラー |

#### 3.1.2 `tasks.update` (v0.2+)

未定。仕様策定後に追加。

#### 3.1.3 `tasks.delete` (v0.2+)

未定。仕様策定後に追加。

---

### 3.2 Memoria

projectKey: `memoria`

#### 3.2.1 `location.summary.append` (v0.1)

5 分間隔で集計された移動サマリを Memoria に追記する。 Legatus が
OwnTracks (MQTT) で受けた個別の location event は **Legatus の memory に
しか乗らず**、 flush 時に集約済みサマリだけが Memoria 側に永続化される。

**Caller**: `legatus`
**Direction**: `legatus → memoria`
**Idempotency**: payload 内に `requestId` を含めて Memoria 側で重複弾きする想定 (実装は Memoria 側担当)。

**Payload**:

```typescript
{
  userId: string;                // Cernere users.id (UUID v4)
  intervalStart: string;         // ISO 8601 UTC, flush window 開始
  intervalEnd: string;           // ISO 8601 UTC, flush window 内最終 event の tst
  start: { lat: number; lon: number };
  end:   { lat: number; lon: number };
  totalDistanceMeters: number;   // 連続点間の累積距離
  netDistanceMeters: number;     // start ↔ end の直線距離
  maxSpeedKmh?: number;          // OwnTracks vel が来ていれば
  meanSpeedKmh?: number;
  pointCount: number;
  deviceIds: string[];
  source: {
    via: "legatus";
    tool: "owntracks-mqtt";
    requestId?: string;
  };
}
```

**Skip 条件 (Legatus 側で flush しない / Memoria に投げない)**:

| 条件 | 動作 |
|------|------|
| buffer が空 (5 分間 OwnTracks publish 0 件) | Memoria 呼び出しなし |
| `netDistanceMeters < LEGATUS_LOCATION_MIN_DISPLACEMENT_M` (default 100m) | "動いていない" → Memoria 呼び出しなし |
| Cernere user session 未取得 | OwnTracks event ごと drop (buffer にも入れない) |

**Response**: Memoria 側で生成したサマリ ID と任意の URL を返す想定 (具体は Memoria 側 spec で確定)。

#### 3.2.2 v0.2+ 予定

| command | 説明 |
|---------|------|
| `bookmarks.create` | ブックマーク追加 |
| `dig.append` | Dig (調べ物ログ) への追記 |
| `dictionary.add` | 辞書エントリ追加 |
| `diary.append` | 日記エントリ追加 |

---

### 3.3 Calicula (v0.2+)

projectKey: `calicula`

予定コマンド:

| command | 説明 |
|---------|------|
| `events.create` | カリキュラム予定追加 |

---

### 3.4 Nuntius (v0.2+)

projectKey: `nuntius`

予定コマンド (Nuntius 既存 WS command を peer 経由で呼ぶ):

| command | 説明 |
|---------|------|
| `notify.schedule` | 時間指定通知の登録 |
| `notify.publish` | トピックへの即時配信 |

---

## 4. Inbound peer commands

v0.1 では実装しない。Legatus は invoker only。

将来 (v0.3+) に追加予定:

| command | caller | 用途 |
|---------|--------|------|
| `legatus.health` | 任意 LUDIARS service | Legatus が起動中・指定 user が active かを確認 |
| `legatus.notify` | nuntius / actio etc. | サービスからユーザへの push 通知を Legatus 経由で OS native notification に変換 |

---

## 5. ローカル API (Claude Code 等の外部ツール ↔ Legatus)

PeerAdapter とは別レイヤ。同一 PC 内のループバック通信。

### 5.1 MCP server (stdio)

Claude Code の MCP として起動。

**Tool: `actio_add_task`**

```jsonc
{
  "name": "actio_add_task",
  "description": "Add a task to the user's Actio task list via Legatus.",
  "inputSchema": {
    "type": "object",
    "required": ["title"],
    "properties": {
      "title":    { "type": "string", "maxLength": 200 },
      "body":     { "type": "string", "description": "Markdown allowed" },
      "deadline": { "type": "string", "format": "date-time" },
      "tags":     { "type": "array",  "items": { "type": "string" } },
      "priority": { "type": "string", "enum": ["low","normal","high"] }
    }
  }
}
```

`userId` は Legatus が現在の Cernere ユーザセッションから自動補完するため、tool 引数には含めない。

### 5.2 POST API (loopback)

```
POST http://127.0.0.1:{LEGATUS_LOCAL_PORT}/v1/actio/tasks
Authorization: Bearer {LEGATUS_LOCAL_TOKEN}
Content-Type: application/json

{
  "title": "牛乳",
  "deadline": "2026-05-02T18:00:00Z",
  "tags": ["買い物"]
}

→ 201 Created
{
  "id": "task_abc123",
  "url": "https://actio.ludiars/tasks/abc123"
}
```

bind は `127.0.0.1` のみ。`LEGATUS_LOCAL_TOKEN` は起動時に乱数生成し OS credential vault に保管。
MCP server (CC 子プロセス) は同じ token を OS credential vault から取得して使う。

### 5.3 認証フロー

| プロセス | 認証 |
|---------|------|
| Claude Code → MCP server | stdio (PID 信頼) |
| MCP server → POST API   | `LEGATUS_LOCAL_TOKEN` (Bearer) |
| Legatus → Actio          | PeerAdapter (project credentials + challenge) |

---

## 6. Cernere ユーザセッション (Legatus 内部のみ)

Legatus 自身が user として Cernere にログインする部分。Outbound peer command の `payload.userId` を埋めるための情報源。

### 6.1 ログインフロー

1. tray から **Sign in with Cernere** → BrowserWindow を popup で開く
2. URL: `${CERNERE_URL}/login?mode=composite&redirect=legatus://auth/callback`
3. Cernere で認証成功 → `legatus://auth/callback?accessToken=...&refreshToken=...` (custom protocol で Electron に戻る)
4. Legatus が `accessToken` / `refreshToken` を SQLite に AES-256-GCM 暗号化保存
5. `accessToken` の `sub` (= user.id) を `currentUserId` としてメモリ保持

### 6.2 Token storage

| 項目 | 保管先 |
|------|--------|
| `LEGATUS_LOCAL_TOKEN` (POST API 用) | OS credential vault (`legatus.local-token`) |
| `LEGATUS_DB_KEY` (DB 暗号化マスタ鍵) | OS credential vault (`legatus.db-key`) |
| `accessToken` / `refreshToken` (Cernere user) | SQLite テーブル `cernere_session`、AES-256-GCM、IV per-row |

### 6.3 SQLite schema (抜粋)

```sql
CREATE TABLE cernere_session (
  user_id            TEXT PRIMARY KEY,
  access_token_enc   BLOB NOT NULL,
  access_token_iv    BLOB NOT NULL,
  access_token_tag   BLOB NOT NULL,
  refresh_token_enc  BLOB NOT NULL,
  refresh_token_iv   BLOB NOT NULL,
  refresh_token_tag  BLOB NOT NULL,
  expires_at         INTEGER NOT NULL,  -- unix sec
  updated_at         INTEGER NOT NULL
);

CREATE TABLE audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ts          INTEGER NOT NULL,
  source      TEXT NOT NULL,        -- "mcp" / "post" / "tray"
  command     TEXT NOT NULL,        -- e.g. "actio.tasks.create"
  user_id     TEXT,
  request_id  TEXT,
  status      TEXT NOT NULL,        -- "ok" / "error"
  error_code  TEXT,
  duration_ms INTEGER
);
```

---

## 7. 監査・冪等性・エラー伝搬

### 7.1 audit log

Legatus は内部 `audit_log` テーブルに全 outbound peer call と全 local API call を記録する。
これは Cernere の `operation_logs` とは別 (Legatus が誰の代理で何を発行したかをユーザ自身が確認できる)。

### 7.2 idempotency

- MCP / POST API → Legatus: Legatus が `idempotencyKey` を生成してキャッシュ (10 分 TTL)
- Legatus → target: 上記 key を payload に転送
- 同一 key の再送は cache から前回 response を返す (target を再呼び出ししない)

### 7.3 エラー伝搬

target からのエラー (`PeerError`) は MCP / POST に以下の形で伝搬:

```jsonc
// MCP tool error
{ "isError": true, "content": [{ "type": "text", "text": "user_not_found: ..." }] }

// POST API error
HTTP 4xx/5xx
{ "code": "user_not_found", "message": "..." , "from": "actio" }
```

---

## 8. バージョニング

`service-schema.md` のヘッダ `version` で管理。

| version | 内容 |
|---------|------|
| 0.1.0 (draft) | Actio.tasks.create のみ |
| 0.2.0 (planned) | Memoria + Calicula + Nuntius outbound 追加 |
| 0.3.0 (planned) | Inbound peer command (legatus.notify 等) 追加 |

破壊的変更は major bump、後方互換追加は minor bump。

---

## 9. 実装側 (target) チェックリスト

新しい target が Legatus からの呼び出しを受け入れる時のチェックリスト:

- [ ] Cernere `relay_pairs` に `(legatus, <self>)` が登録されている
- [ ] `PeerAdapter` の `accept.legatus` に許可コマンドを列挙
- [ ] 各 `sa.handle()` で `caller.projectKey === "legatus"` を検証
- [ ] payload バリデーション (zod 等)
- [ ] `payload.userId` を権威として使い、target 側でユーザを upsert / 解決
- [ ] レスポンス schema を本ドキュメントに合わせる
- [ ] エラー code を本ドキュメントの一覧に揃える
- [ ] `source.via` / `source.tool` / `source.requestId` を operation_logs に記録
