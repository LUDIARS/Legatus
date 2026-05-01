/**
 * Legatus 内部 audit_log への書き込み.
 *
 * spec/service-schema.md §7.1 準拠. 全 outbound peer call と local API call をログ.
 */

import type Database from "better-sqlite3";

export type AuditSource = "mcp" | "post" | "tray" | "internal";
export type AuditStatus = "ok" | "error";

export interface AuditEntry {
  source: AuditSource;
  command: string;
  userId?: string;
  requestId?: string;
  status: AuditStatus;
  errorCode?: string;
  durationMs?: number;
}

export class AuditLog {
  constructor(private readonly db: Database.Database) {}

  record(entry: AuditEntry): void {
    this.db
      .prepare(
        `INSERT INTO audit_log(ts, source, command, user_id, request_id, status, error_code, duration_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        Math.floor(Date.now() / 1000),
        entry.source,
        entry.command,
        entry.userId ?? null,
        entry.requestId ?? null,
        entry.status,
        entry.errorCode ?? null,
        entry.durationMs ?? null,
      );
  }

  recent(limit = 100): unknown[] {
    return this.db
      .prepare(`SELECT * FROM audit_log ORDER BY id DESC LIMIT ?`)
      .all(limit);
  }
}
