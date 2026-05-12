import { describe, it, expect } from "vitest";
import {
  haversineMeters,
  summarizeBuffer,
} from "../src/backend/owntracks/summarizer.js";
import type { LocationEvent } from "../src/backend/owntracks/types.js";

const TOKYO = { lat: 35.6812, lon: 139.7671 };
const SHINJUKU = { lat: 35.6896, lon: 139.6917 };

function ev(ts: string, lat: number, lon: number, vel?: number): LocationEvent {
  return { topicUser: "u", device: "iphone", lat, lon, ts, vel };
}

describe("haversineMeters", () => {
  it("Tokyo ↔ Shinjuku ≈ 6.9km", () => {
    const d = haversineMeters(TOKYO, SHINJUKU);
    expect(d).toBeGreaterThan(6500);
    expect(d).toBeLessThan(7300);
  });

  it("zero distance", () => {
    expect(haversineMeters(TOKYO, TOKYO)).toBe(0);
  });
});

describe("summarizeBuffer", () => {
  it("returns null for empty buffer", () => {
    expect(summarizeBuffer([], 0, 100)).toBeNull();
  });

  it("returns null when net distance below threshold", () => {
    const events = [
      ev("2026-05-01T00:00:00Z", TOKYO.lat, TOKYO.lon),
      ev("2026-05-01T00:01:00Z", TOKYO.lat + 0.0001, TOKYO.lon),
      ev("2026-05-01T00:02:00Z", TOKYO.lat - 0.0001, TOKYO.lon),
    ];
    expect(summarizeBuffer(events, Date.parse("2026-05-01T00:00:00Z"), 100)).toBeNull();
  });

  it("summarizes movement above threshold", () => {
    const events = [
      ev("2026-05-01T00:00:00Z", TOKYO.lat, TOKYO.lon, 0),
      ev("2026-05-01T00:02:30Z", (TOKYO.lat + SHINJUKU.lat) / 2, (TOKYO.lon + SHINJUKU.lon) / 2, 50),
      ev("2026-05-01T00:05:00Z", SHINJUKU.lat, SHINJUKU.lon, 30),
    ];
    const summary = summarizeBuffer(events, Date.parse("2026-05-01T00:00:00Z"), 100);
    expect(summary).not.toBeNull();
    expect(summary!.start).toEqual({ lat: TOKYO.lat, lon: TOKYO.lon });
    expect(summary!.end).toEqual({ lat: SHINJUKU.lat, lon: SHINJUKU.lon });
    expect(summary!.netDistanceMeters).toBeGreaterThan(6500);
    expect(summary!.totalDistanceMeters).toBeGreaterThanOrEqual(summary!.netDistanceMeters - 1);
    expect(summary!.maxSpeedKmh).toBe(50);
    expect(summary!.pointCount).toBe(3);
    expect(summary!.deviceIds).toEqual(["iphone"]);
  });

  it("dedupes deviceIds", () => {
    const events: LocationEvent[] = [
      { topicUser: "u", device: "iphone", lat: TOKYO.lat, lon: TOKYO.lon, ts: "2026-05-01T00:00:00Z" },
      { topicUser: "u", device: "watch", lat: SHINJUKU.lat, lon: SHINJUKU.lon, ts: "2026-05-01T00:05:00Z" },
      { topicUser: "u", device: "iphone", lat: SHINJUKU.lat, lon: SHINJUKU.lon, ts: "2026-05-01T00:06:00Z" },
    ];
    const summary = summarizeBuffer(events, Date.parse("2026-05-01T00:00:00Z"), 100);
    expect(summary!.deviceIds.sort()).toEqual(["iphone", "watch"]);
  });
});
