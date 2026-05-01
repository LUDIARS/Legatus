/**
 * Location buffer + summarizer.
 *
 * - in-memory buffer に LocationEvent を時系列で蓄積
 * - flush 時に「動いていない」「情報が来ていない」場合は skip
 * - それ以外はサマリ生成 → buffer 破棄
 *
 * spec/service-schema.md §3.5 の Memoria.location.summary.append payload と整合.
 */

import type { LocationEvent, LocationSummary } from "./types.js";

const EARTH_RADIUS_M = 6_371_000;

export function haversineMeters(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const φ1 = (a.lat * Math.PI) / 180;
  const φ2 = (b.lat * Math.PI) / 180;
  const dφ = ((b.lat - a.lat) * Math.PI) / 180;
  const dλ = ((b.lon - a.lon) * Math.PI) / 180;
  const h =
    Math.sin(dφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * @returns null when nothing to summarize (empty buffer or movement below threshold).
 */
export function summarizeBuffer(
  events: LocationEvent[],
  intervalStartMs: number,
  minDisplacementMeters: number,
): LocationSummary | null {
  if (events.length === 0) return null;

  const sorted = [...events].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  const net = haversineMeters(
    { lat: first.lat, lon: first.lon },
    { lat: last.lat, lon: last.lon },
  );
  if (net < minDisplacementMeters) return null;

  let total = 0;
  let maxSpeedKmh: number | undefined;
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    total += haversineMeters(prev, cur);
    if (cur.vel !== undefined) {
      maxSpeedKmh = Math.max(maxSpeedKmh ?? 0, cur.vel);
    }
  }

  const elapsedSec =
    (Date.parse(last.ts) - Date.parse(first.ts)) / 1000;
  const meanSpeedKmh =
    elapsedSec > 0 ? (total / elapsedSec) * 3.6 : undefined;

  const deviceIds = Array.from(new Set(sorted.map((e) => e.device)));

  return {
    intervalStart: new Date(intervalStartMs).toISOString(),
    intervalEnd: last.ts,
    start: { lat: first.lat, lon: first.lon },
    end: { lat: last.lat, lon: last.lon },
    totalDistanceMeters: Math.round(total),
    netDistanceMeters: Math.round(net),
    maxSpeedKmh: maxSpeedKmh !== undefined ? round1(maxSpeedKmh) : undefined,
    meanSpeedKmh: meanSpeedKmh !== undefined ? round1(meanSpeedKmh) : undefined,
    pointCount: sorted.length,
    deviceIds,
  };
}

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}
