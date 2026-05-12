/**
 * AES-256-GCM helpers for Legatus encrypted storage.
 *
 * - master key: 32 bytes random, OS credential vault に保管 (keytar)
 * - per-row IV: 12 bytes random (GCM 推奨)
 * - tag: 16 bytes (default)
 *
 * spec/service-schema.md §6.2 / §6.3 準拠.
 */

import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";

const ALGO = "aes-256-gcm";
export const KEY_BYTES = 32;
export const IV_BYTES = 12;
export const TAG_BYTES = 16;

export interface SealedSecret {
  ciphertext: Buffer;
  iv: Buffer;
  tag: Buffer;
}

export function generateMasterKey(): Buffer {
  return randomBytes(KEY_BYTES);
}

export function seal(plaintext: string, key: Buffer): SealedSecret {
  if (key.length !== KEY_BYTES) {
    throw new Error(`master key must be ${KEY_BYTES} bytes`);
  }
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return { ciphertext, iv, tag };
}

export function open(sealed: SealedSecret, key: Buffer): string {
  if (key.length !== KEY_BYTES) {
    throw new Error(`master key must be ${KEY_BYTES} bytes`);
  }
  const decipher = createDecipheriv(ALGO, key, sealed.iv);
  decipher.setAuthTag(sealed.tag);
  const plaintext = Buffer.concat([
    decipher.update(sealed.ciphertext),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}
