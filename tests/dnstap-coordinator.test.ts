import { describe, it, expect } from "vitest";
import { dnsmasqLineToEvent } from "../src/backend/dnstap/coordinator.js";
import { TailscaleCache } from "../src/backend/dnstap/tailscale.js";

function makeCache(
  ip: string,
  hostname: string,
  os: string | null,
): TailscaleCache {
  const cache = new TailscaleCache({ bin: "tailscale", refreshMs: 60_000 });
  cache.setMapForTest(
    new Map([
      [
        ip,
        {
          ip,
          hostname,
          os,
          user_login: "foo@example.com",
          online: true,
          last_seen: null,
        },
      ],
    ]),
  );
  return cache;
}

describe("dnsmasqLineToEvent", () => {
  const fixedNow = () => new Date("2026-05-02T14:00:00.000Z");

  it("returns DomainVisitEvent for a query line with known IP", () => {
    const cache = makeCache("100.122.174.105", "iphone-of-foo", "iOS");
    const line =
      "2026-05-02 14:23:15.012 query[A] github.com from 100.122.174.105";
    const ev = dnsmasqLineToEvent(line, cache, [], fixedNow);
    expect(ev).toEqual({
      ts: "2026-05-02T14:23:15.012Z",
      domain: "github.com",
      source: "dns",
      src_ip: "100.122.174.105",
      device_label: "iphone-of-foo",
      device_os: "iOS",
      qtype: "A",
    });
  });

  it("falls back device_label to src_ip when Tailscale doesn't know the IP", () => {
    const cache = makeCache("100.0.0.1", "myhost", "linux");
    const line =
      "2026-05-02 14:23:15.012 query[A] foo.com from 100.99.99.99";
    const ev = dnsmasqLineToEvent(line, cache, [], fixedNow);
    expect(ev?.device_label).toBe("100.99.99.99");
    expect(ev?.device_os).toBeNull();
  });

  it("returns null for skipped domains (suffix match)", () => {
    const cache = makeCache("100.0.0.1", "iphone", "iOS");
    const line =
      "2026-05-02 14:23:15.012 query[A] login.bank.example from 100.0.0.1";
    const ev = dnsmasqLineToEvent(
      line,
      cache,
      ["bank.example"],
      fixedNow,
    );
    expect(ev).toBeNull();
  });

  it("returns null for non-query lines", () => {
    const cache = makeCache("100.0.0.1", "iphone", "iOS");
    expect(
      dnsmasqLineToEvent(
        "2026-05-02 14:23:15.012 forwarded foo.com to 1.1.1.1",
        cache,
        [],
        fixedNow,
      ),
    ).toBeNull();
  });
});
