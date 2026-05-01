/**
 * Legatus SQLite schema. spec/service-schema.md §6.3 準拠.
 *
 * v0.1 では 2 テーブル:
 * - cernere_session: AES-256-GCM 暗号化された Cernere user token
 * - audit_log:        全 outbound peer call と local API call の監査ログ
 */

import type Database from "better-sqlite3";

export const SCHEMA_VERSION = 1;

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS schema_meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS cernere_session (
    user_id            TEXT PRIMARY KEY,
    access_token_enc   BLOB NOT NULL,
    access_token_iv    BLOB NOT NULL,
    access_token_tag   BLOB NOT NULL,
    refresh_token_enc  BLOB NOT NULL,
    refresh_token_iv   BLOB NOT NULL,
    refresh_token_tag  BLOB NOT NULL,
    expires_at         INTEGER NOT NULL,
    updated_at         INTEGER NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS audit_log (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    ts           INTEGER NOT NULL,
    source       TEXT NOT NULL,
    command      TEXT NOT NULL,
    user_id      TEXT,
    request_id   TEXT,
    status       TEXT NOT NULL,
    error_code   TEXT,
    duration_ms  INTEGER
  )`,

  `CREATE INDEX IF NOT EXISTS idx_audit_log_ts ON audit_log(ts DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_log_request ON audit_log(request_id)`,
];

export function applyMigrations(db: Database.Database): void {
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  const tx = db.transaction((stmts: string[]) => {
    for (const stmt of stmts) db.exec(stmt);
  });
  tx(STATEMENTS);

  db.prepare(
    `INSERT OR REPLACE INTO schema_meta(key, value) VALUES('version', ?)`,
  ).run(String(SCHEMA_VERSION));
}
