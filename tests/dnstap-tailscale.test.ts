import { describe, it, expect } from "vitest";
import { buildIpMap, TailscaleCache } from "../src/backend/dnstap/tailscale.js";

describe("buildIpMap", () => {
  it("collects Self + Peer entries with both v4 and v6", () => {
    const status = {
      Self: {
        HostName: "myhost",
        OS: "linux",
        TailscaleIPs: ["100.64.0.1", "fd7a:115c:a1e0::1"],
        Online: true,
        UserID: 1,
      },
      Peer: {
        n1: {
          HostName: "iphone-of-foo",
          OS: "iOS",
          TailscaleIPs: ["100.122.174.105"],
          Online: true,
          UserID: 1,
        },
        n2: {
          HostName: "ipad-of-foo",
          OS: "iOS",
          TailscaleIPs: [],
          Online: false,
        },
      },
      User: {
        "1": { LoginName: "foo@example.com" },
      },
    };
    const map = buildIpMap(status);
    expect(map.size).toBe(3);
    expect(map.get("100.64.0.1")?.hostname).toBe("myhost");
    expect(map.get("fd7a:115c:a1e0::1")?.hostname).toBe("myhost");
    expect(map.get("100.122.174.105")?.hostname).toBe("iphone-of-foo");
    expect(map.get("100.122.174.105")?.user_login).toBe("foo@example.com");
    expect(map.get("100.122.174.105")?.os).toBe("iOS");
  });

  it("returns empty Map on null input", () => {
    expect(buildIpMap(null).size).toBe(0);
  });
});

describe("TailscaleCache", () => {
  it("lookup returns null for unknown IP", () => {
    const cache = new TailscaleCache({
      bin: "tailscale",
      refreshMs: 60_000,
      fetcher: async () => null,
    });
    expect(cache.lookup("1.2.3.4")).toBeNull();
  });

  it("refresh populates the map from injected fetcher", async () => {
    const cache = new TailscaleCache({
      bin: "tailscale",
      refreshMs: 60_000,
      fetcher: async () => ({
        Self: {
          HostName: "self",
          TailscaleIPs: ["100.0.0.1"],
        },
        Peer: {
          a: {
            HostName: "iphone-of-foo",
            OS: "iOS",
            TailscaleIPs: ["100.0.0.2"],
          },
        },
      }),
    });
    await cache.refresh();
    expect(cache.lookup("100.0.0.2")?.hostname).toBe("iphone-of-foo");
  });

  it("preserves old map on empty refresh", async () => {
    const cache = new TailscaleCache({
      bin: "tailscale",
      refreshMs: 60_000,
      fetcher: async () => ({
        Self: { HostName: "self", TailscaleIPs: ["100.0.0.1"] },
      }),
    });
    await cache.refresh();
    expect(cache.lookup("100.0.0.1")?.hostname).toBe("self");
    // Next refresh produces empty map → keep cache
    (cache as unknown as { fetcher: () => Promise<null> }).fetcher = async () => null;
    await cache.refresh();
    expect(cache.lookup("100.0.0.1")?.hostname).toBe("self");
  });
});
