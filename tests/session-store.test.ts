import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { applyMigrations } from "../src/backend/db/schema.js";
import { generateMasterKey } from "../src/backend/db/crypto.js";
import { CernereSessionStore } from "../src/backend/auth/cernere-session.js";

function fresh(): { store: CernereSessionStore; key: Buffer; db: Database.Database } {
  const db = new Database(":memory:");
  applyMigrations(db);
  const key = generateMasterKey();
  return { store: new CernereSessionStore(db, key), key, db };
}

describe("CernereSessionStore", () => {
  let store: CernereSessionStore;

  beforeEach(() => {
    ({ store } = fresh());
  });

  it("upserts and loads a session with encrypted tokens", () => {
    store.upsert({
      userId: "user-1",
      accessToken: "AT-12345",
      refreshToken: "RT-67890",
      expiresAt: 1_700_000_000,
    });

    const loaded = store.load("user-1");
    expect(loaded?.accessToken).toBe("AT-12345");
    expect(loaded?.refreshToken).toBe("RT-67890");
    expect(loaded?.expiresAt).toBe(1_700_000_000);
  });

  it("loadAny returns a stored session when present", () => {
    store.upsert({ userId: "u-only", accessToken: "a", refreshToken: "b", expiresAt: 1 });
    expect(store.loadAny()?.userId).toBe("u-only");
  });

  it("requireCurrent throws when empty", () => {
    expect(() => store.requireCurrent()).toThrow(/not_signed_in|Cernere/);
  });
});
