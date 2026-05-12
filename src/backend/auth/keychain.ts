/**
 * OS credential vault wrapper (keytar).
 *
 * 保管項目:
 *  - `legatus.local-token` : POST API Bearer token (起動時に乱数生成)
 *  - `legatus.db-key`      : SQLite 暗号化マスタ鍵 (32 bytes, base64)
 */

import keytar from "keytar";
import { randomBytes } from "node:crypto";
import { generateMasterKey } from "../db/crypto.js";

const SERVICE = "legatus";
const ACCT_LOCAL_TOKEN = "local-token";
const ACCT_DB_KEY = "db-key";

export async function getOrCreateLocalToken(): Promise<string> {
  const existing = await keytar.getPassword(SERVICE, ACCT_LOCAL_TOKEN);
  if (existing) return existing;
  const fresh = randomBytes(32).toString("base64url");
  await keytar.setPassword(SERVICE, ACCT_LOCAL_TOKEN, fresh);
  return fresh;
}

export async function rotateLocalToken(): Promise<string> {
  const fresh = randomBytes(32).toString("base64url");
  await keytar.setPassword(SERVICE, ACCT_LOCAL_TOKEN, fresh);
  return fresh;
}

export async function getLocalToken(): Promise<string | null> {
  return keytar.getPassword(SERVICE, ACCT_LOCAL_TOKEN);
}

export async function getOrCreateDbKey(): Promise<Buffer> {
  const existing = await keytar.getPassword(SERVICE, ACCT_DB_KEY);
  if (existing) return Buffer.from(existing, "base64");
  const fresh = generateMasterKey();
  await keytar.setPassword(SERVICE, ACCT_DB_KEY, fresh.toString("base64"));
  return fresh;
}
