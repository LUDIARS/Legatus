/**
 * Legatus Electron main process.
 *
 * - tray icon + メニュー (Sign in / Status / Quit)
 * - backend (Hono + PeerAdapter) を main process 内で起動
 * - custom protocol `legatus://` で Cernere callback を受信
 * - single instance lock (二重起動回避)
 */

import { app, Menu, Tray, dialog } from "electron";
import { join } from "node:path";
import { startBackend, type BackendHandle } from "../backend/server.js";
import { loadConfig } from "../shared/config.js";
import { createChildLogger } from "../shared/logger.js";
import { openDb } from "../backend/db/index.js";
import { getOrCreateDbKey } from "../backend/auth/keychain.js";
import { CernereSessionStore } from "../backend/auth/cernere-session.js";
import { getTrayIcon } from "./tray-icon.js";
import {
  closeSignInPopup,
  openSignInPopup,
  parseCallback,
  persistCallbackTokens,
  registerProtocolHandler,
} from "./sign-in.js";

const log = createChildLogger("electron");

let tray: Tray | null = null;
let backend: BackendHandle | null = null;
let sessions: CernereSessionStore | null = null;

function refreshTrayMenu(): void {
  if (!tray) return;
  const status = sessions?.loadAny();
  const menu = Menu.buildFromTemplate([
    {
      label: status ? `Signed in: ${status.userId.slice(0, 8)}…` : "Not signed in",
      enabled: false,
    },
    { type: "separator" },
    {
      label: "Sign in with Cernere…",
      click: () => openSignInPopup(loadConfig()),
    },
    {
      label: "Show status",
      click: () => {
        dialog.showMessageBox({
          type: "info",
          title: "Legatus",
          message: status
            ? `userId: ${status.userId}\nbackend: 127.0.0.1:${backend?.port}`
            : "Not signed in. Use Sign in with Cernere…",
        });
      },
    },
    { type: "separator" },
    { label: "Quit", role: "quit" },
  ]);
  tray.setContextMenu(menu);
  tray.setToolTip(status ? "Legatus (signed in)" : "Legatus (not signed in)");
}

function handleProtocolUrl(url: string): void {
  const tokens = parseCallback(url);
  if (!tokens) {
    log.warn({ url }, "ignored protocol url (parse failed)");
    return;
  }
  if (!sessions) {
    log.error("session store not ready");
    return;
  }
  persistCallbackTokens(sessions, tokens);
  closeSignInPopup();
  refreshTrayMenu();
}

async function bootstrap(): Promise<void> {
  const cfg = loadConfig();

  const dbPath =
    cfg.dbPath || join(app.getPath("userData"), "legatus.db");

  const dbKey = await getOrCreateDbKey();
  const db = openDb(dbPath);
  sessions = new CernereSessionStore(db, dbKey);

  try {
    backend = await startBackend({ dbPath });
  } catch (err) {
    log.error({ err }, "backend failed to start");
    dialog.showErrorBox(
      "Legatus backend failed",
      err instanceof Error ? err.message : String(err),
    );
    app.quit();
    return;
  }

  tray = new Tray(getTrayIcon());
  refreshTrayMenu();
  log.info("tray installed");
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    const url = argv.find((a) => a.startsWith("legatus://"));
    if (url) handleProtocolUrl(url);
  });

  app.on("open-url", (event, url) => {
    event.preventDefault();
    handleProtocolUrl(url);
  });

  app.whenReady().then(() => {
    registerProtocolHandler();
    bootstrap().catch((err) => {
      log.error({ err }, "bootstrap failed");
      app.quit();
    });
  });

  app.on("window-all-closed", () => {
    // tray-only app: do not quit when all windows close (sign-in popup closes after success).
  });

  app.on("before-quit", async () => {
    if (backend) {
      await backend.shutdown().catch(() => undefined);
    }
  });
}
