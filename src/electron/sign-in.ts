/**
 * Cernere Composite ログイン popup.
 *
 * spec/service-schema.md §6.1 のフロー:
 *   1. tray から Sign in → BrowserWindow popup を開く
 *   2. URL: ${CERNERE_URL}/login?mode=composite&redirect=legatus://auth/callback
 *   3. Cernere で認証成功 → legatus://auth/callback?accessToken=...&refreshToken=...
 *   4. open-url / second-instance で URL を捕捉 → tokens を保存 → BrowserWindow close
 */

import { BrowserWindow, app } from "electron";
import { URL } from "node:url";
import type { LegatusConfig } from "../shared/config.js";
import type { CernereSessionStore } from "../backend/auth/cernere-session.js";
import { createChildLogger } from "../shared/logger.js";
import { parseCallback, type CallbackTokens } from "../shared/cernere-callback.js";

export { parseCallback, type CallbackTokens };

const log = createChildLogger("sign-in");

const PROTOCOL = "legatus";
const REDIRECT = "legatus://auth/callback";

let signInWindow: BrowserWindow | null = null;

export function registerProtocolHandler(): void {
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [
        process.argv[1],
      ]);
    }
  } else {
    app.setAsDefaultProtocolClient(PROTOCOL);
  }
}

export function openSignInPopup(cfg: LegatusConfig): void {
  if (signInWindow && !signInWindow.isDestroyed()) {
    signInWindow.focus();
    return;
  }

  if (!cfg.cernere.enabled) {
    log.warn("openSignInPopup called but cernere mode is OFF — ignoring");
    return;
  }
  const loginUrl = new URL("/login", cfg.cernere.url);
  loginUrl.searchParams.set("mode", "composite");
  loginUrl.searchParams.set("redirect", REDIRECT);

  signInWindow = new BrowserWindow({
    width: 460,
    height: 640,
    title: "Sign in to Cernere",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  signInWindow.loadURL(loginUrl.toString()).catch((err) => {
    log.error({ err }, "failed to load Cernere login URL");
  });

  signInWindow.on("closed", () => {
    signInWindow = null;
  });
}

export function closeSignInPopup(): void {
  if (signInWindow && !signInWindow.isDestroyed()) {
    signInWindow.close();
  }
  signInWindow = null;
}

export function persistCallbackTokens(
  store: CernereSessionStore,
  tokens: CallbackTokens,
): void {
  store.upsert({
    userId: tokens.userId,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: tokens.expiresAt,
  });
  log.info({ userId: tokens.userId }, "Cernere session stored");
}
