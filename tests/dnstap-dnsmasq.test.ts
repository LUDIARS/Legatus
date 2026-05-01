import { describe, it, expect } from "vitest";
import {
  parseDnsmasqLine,
  extractTimestamp,
} from "../src/backend/dnstap/dnsmasq.js";

describe("parseDnsmasqLine", () => {
  it("parses standard query line", () => {
    const line =
      "2026-05-02 14:23:15.012 dnsmasq[123]: query[A] github.com from 100.122.174.105";
    expect(parseDnsmasqLine(line)).toEqual({
      qtype: "A",
      domain: "github.com",
      src_ip: "100.122.174.105",
    });
  });

  it("parses AAAA query (IPv6)", () => {
    expect(
      parseDnsmasqLine("query[AAAA] api.github.com from fd7a:115c:a1e0::1"),
    ).toEqual({
      qtype: "AAAA",
      domain: "api.github.com",
      src_ip: "fd7a:115c:a1e0::1",
    });
  });

  it("lowercases the domain and strips trailing dot", () => {
    expect(parseDnsmasqLine("query[A] GitHub.COM. from 1.2.3.4")).toEqual({
      qtype: "A",
      domain: "github.com",
      src_ip: "1.2.3.4",
    });
  });

  it("rejects non-query lines", () => {
    expect(parseDnsmasqLine("forwarded github.com to 1.1.1.1")).toBeNull();
    expect(parseDnsmasqLine("")).toBeNull();
    expect(parseDnsmasqLine("garbage line")).toBeNull();
  });

  it("rejects malformed query syntax", () => {
    expect(parseDnsmasqLine("query[] github.com from 1.2.3.4")).toBeNull();
    expect(parseDnsmasqLine("query[A]  from 1.2.3.4")).toBeNull();
  });
});

describe("extractTimestamp", () => {
  it("parses ISO-with-space timestamp", () => {
    const line = "2026-05-02 14:23:15.012 query[A] github.com from 1.2.3.4";
    const ts = extractTimestamp(line);
    expect(ts).toBe("2026-05-02T14:23:15.012Z");
  });

  it("parses ISO-with-T timestamp + Z", () => {
    const line = "2026-05-02T14:23:15Z query[A] foo.com from 1.2.3.4";
    expect(extractTimestamp(line)).toBe("2026-05-02T14:23:15.000Z");
  });

  it("parses syslog-format timestamp using fallback year", () => {
    const fallback = () => new Date(Date.UTC(2026, 4, 2, 0, 0, 0));
    const line = "May  2 14:23:15 dnsmasq[123]: query[A] foo.com from 1.2.3.4";
    const ts = extractTimestamp(line, fallback);
    // year is taken from the fallback ("now") since syslog has none.
    expect(ts.startsWith("2026-")).toBe(true);
    expect(ts).toContain("14:23:15");
  });

  it("falls back to now() when no timestamp found", () => {
    const fixed = new Date("2026-05-02T00:00:00.000Z");
    const ts = extractTimestamp("query[A] foo.com from 1.2.3.4", () => fixed);
    expect(ts).toBe("2026-05-02T00:00:00.000Z");
  });
});
