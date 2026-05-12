import { describe, it, expect, vi } from "vitest";
import { LocationBuffer } from "../src/backend/owntracks/buffer.js";
import type { LocationEvent, LocationSummary } from "../src/backend/owntracks/types.js";

const TOKYO = { lat: 35.6812, lon: 139.7671 };
const SHINJUKU = { lat: 35.6896, lon: 139.6917 };

function ev(ts: string, lat: number, lon: number): LocationEvent {
  return { topicUser: "u", device: "iphone", lat, lon, ts };
}

describe("LocationBuffer", () => {
  it("flush returns null on empty buffer", async () => {
    const onFlush = vi.fn();
    const b = new LocationBuffer({
      flushIntervalMs: 1000,
      minDisplacementMeters: 100,
      onFlush,
    });
    expect(await b.flush()).toBeNull();
    expect(onFlush).not.toHaveBeenCalled();
  });

  it("flush returns null and skips onFlush when below threshold", async () => {
    const onFlush = vi.fn();
    const b = new LocationBuffer({
      flushIntervalMs: 1000,
      minDisplacementMeters: 1000,
      onFlush,
    });
    b.push(ev("2026-05-01T00:00:00Z", TOKYO.lat, TOKYO.lon));
    b.push(ev("2026-05-01T00:00:30Z", TOKYO.lat + 0.0001, TOKYO.lon));
    expect(await b.flush()).toBeNull();
    expect(onFlush).not.toHaveBeenCalled();
    expect(b.size()).toBe(0);
  });

  it("flush calls onFlush and clears buffer when summary produced", async () => {
    const summaries: LocationSummary[] = [];
    const b = new LocationBuffer({
      flushIntervalMs: 1000,
      minDisplacementMeters: 100,
      onFlush: (s) => {
        summaries.push(s);
      },
    });
    b.push(ev("2026-05-01T00:00:00Z", TOKYO.lat, TOKYO.lon));
    b.push(ev("2026-05-01T00:05:00Z", SHINJUKU.lat, SHINJUKU.lon));
    const result = await b.flush();
    expect(result).not.toBeNull();
    expect(summaries).toHaveLength(1);
    expect(b.size()).toBe(0);
  });

  it("interval timer drives auto-flush", async () => {
    vi.useFakeTimers();
    try {
      const summaries: LocationSummary[] = [];
      const b = new LocationBuffer({
        flushIntervalMs: 1000,
        minDisplacementMeters: 100,
        onFlush: (s) => {
          summaries.push(s);
        },
      });
      b.start();
      b.push(ev("2026-05-01T00:00:00Z", TOKYO.lat, TOKYO.lon));
      b.push(ev("2026-05-01T00:05:00Z", SHINJUKU.lat, SHINJUKU.lon));
      await vi.advanceTimersByTimeAsync(1000);
      // microtasks
      await Promise.resolve();
      await Promise.resolve();
      expect(summaries).toHaveLength(1);
      await b.stop();
    } finally {
      vi.useRealTimers();
    }
  });
});
