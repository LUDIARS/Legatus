/**
 * Cernere ユーザセッション管理.
 *
 * spec/service-schema.md §6 準拠. SQLite + AES-256-GCM で access_token / refresh_token を保管.
 */

import type Database from "better-sqlite3";
import { seal, open as openSeal, type SealedSecret } from "../db/crypto.js";
import { LegatusError } from "../../shared/errors.js";

export interface CernereSession {
  userId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // unix sec
  updatedAt: number;
}

interface SessionRow {
  user_id: string;
  access_token_enc: Buffer;
  access_token_iv: Buffer;
  access_token_tag: Buffer;
  refresh_token_enc: Buffer;
  refresh_token_iv: Buffer;
  refresh_token_tag: Buffer;
  expires_at: number;
  updated_at: number;
}

export class CernereSessionStore {
  constructor(
    private readonly db: Database.Database,
    private readonly masterKey: Buffer,
  ) {}

  upsert(session: Omit<CernereSession, "updatedAt">): void {
    const access = seal(session.accessToken, this.masterKey);
    const refresh = seal(session.refreshToken, this.masterKey);
    const now = Math.floor(Date.now() / 1000);

    this.db
      .prepare(
        `INSERT INTO cernere_session(
          user_id,
          access_token_enc, access_token_iv, access_token_tag,
          refresh_token_enc, refresh_token_iv, refresh_token_tag,
          expires_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          access_token_enc = excluded.access_token_enc,
          access_token_iv = excluded.access_token_iv,
          access_token_tag = excluded.access_token_tag,
          refresh_token_enc = excluded.refresh_token_enc,
          refresh_token_iv = excluded.refresh_token_iv,
          refresh_token_tag = excluded.refresh_token_tag,
          expires_at = excluded.expires_at,
          updated_at = excluded.updated_at`,
      )
      .run(
        session.userId,
        access.ciphertext, access.iv, access.tag,
        refresh.ciphertext, refresh.iv, refresh.tag,
        session.expiresAt, now,
      );
  }

  load(userId: string): CernereSession | null {
    const row = this.db
      .prepare(`SELECT * FROM cernere_session WHERE user_id = ?`)
      .get(userId) as SessionRow | undefined;
    if (!row) return null;

    const access: SealedSecret = {
      ciphertext: row.access_token_enc,
      iv: row.access_token_iv,
      tag: row.access_token_tag,
    };
    const refresh: SealedSecret = {
      ciphertext: row.refresh_token_enc,
      iv: row.refresh_token_iv,
      tag: row.refresh_token_tag,
    };

    return {
      userId: row.user_id,
      accessToken: openSeal(access, this.masterKey),
      refreshToken: openSeal(refresh, this.masterKey),
      expiresAt: row.expires_at,
      updatedAt: row.updated_at,
    };
  }

  loadAny(): CernereSession | null {
    const row = this.db
      .prepare(`SELECT user_id FROM cernere_session ORDER BY updated_at DESC LIMIT 1`)
      .get() as { user_id: string } | undefined;
    return row ? this.load(row.user_id) : null;
  }

  delete(userId: string): void {
    this.db.prepare(`DELETE FROM cernere_session WHERE user_id = ?`).run(userId);
  }

  requireCurrent(): CernereSession {
    const session = this.loadAny();
    if (!session) {
      throw new LegatusError(
        "not_signed_in",
        "Cernere ユーザセッションがありません。tray から Sign in してください。",
      );
    }
    return session;
  }
}
