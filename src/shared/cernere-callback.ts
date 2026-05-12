/**
 * Cernere Composite ログイン callback URL のパース.
 *
 * Electron に依存しないため backend / test / electron すべてから利用可能.
 */

import { URL } from "node:url";

export interface CallbackTokens {
  userId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

const PROTOCOL = "legatus:";

export function parseCallback(url: string): CallbackTokens | null {
  try {
    const u = new URL(url);
    if (u.protocol !== PROTOCOL) return null;
    if (u.host !== "auth" || u.pathname !== "/callback") return null;

    const accessToken = u.searchParams.get("accessToken") ?? "";
    const refreshToken = u.searchParams.get("refreshToken") ?? "";
    const userId = u.searchParams.get("userId") ?? extractSubFromJwt(accessToken);
    const expiresAtStr = u.searchParams.get("expiresAt");
    if (!accessToken || !refreshToken || !userId) return null;
    const expiresAt = expiresAtStr
      ? Number(expiresAtStr)
      : Math.floor(Date.now() / 1000) + 3600;
    return { userId, accessToken, refreshToken, expiresAt };
  } catch {
    return null;
  }
}

function extractSubFromJwt(jwt: string): string {
  try {
    const [, payload] = jwt.split(".");
    if (!payload) return "";
    const json = Buffer.from(payload, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as { sub?: string };
    return parsed.sub ?? "";
  } catch {
    return "";
  }
}
