import { describe, it, expect } from "vitest";
import {
  loadDnstapConfig,
  shouldSkipDomain,
} from "../src/backend/dnstap/config.js";

describe("loadDnstapConfig", () => {
  it("disables by default", () => {
    const c = loadDnstapConfig({});
    expect(c.enabled).toBe(false);
  });

  it("enables when LEGATUS_DNSTAP_ENABLED=true", () => {
    const c = loadDnstapConfig({ LEGATUS_DNSTAP_ENABLED: "true" });
    expect(c.enabled).toBe(true);
  });

  it("parses skip list from comma string", () => {
    const c = loadDnstapConfig({
      LEGATUS_DNSTAP_SKIP_DOMAINS: "bank.example, hospital.test ,  ",
    });
    expect(c.skipDomains).toEqual(["bank.example", "hospital.test"]);
  });

  it("uses sane defaults", () => {
    const c = loadDnstapConfig({});
    expect(c.flushIntervalMs).toBe(30_000);
    expect(c.dedupeWindowMs).toBe(5_000);
    expect(c.tailscaleRefreshMs).toBe(300_000);
    expect(c.dnsmasqLogPath).toBe("/var/log/dnsmasq.log");
    expect(c.tailscaleBin).toBe("tailscale");
    expect(c.forwardUrl).toBe("http://localhost:5180/api/visits/external");
  });
});

describe("shouldSkipDomain", () => {
  it("matches exact", () => {
    expect(shouldSkipDomain("bank.example", ["bank.example"])).toBe(true);
  });
  it("matches subdomain (suffix)", () => {
    expect(shouldSkipDomain("login.bank.example", ["bank.example"])).toBe(true);
  });
  it("does not match a different parent", () => {
    expect(shouldSkipDomain("notbank.example", ["bank.example"])).toBe(false);
  });
  it("is case-insensitive", () => {
    expect(shouldSkipDomain("LOGIN.BANK.example", ["bank.example"])).toBe(true);
  });
  it("returns false when skip list is empty", () => {
    expect(shouldSkipDomain("foo.com", [])).toBe(false);
  });
});
