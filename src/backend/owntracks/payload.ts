/**
 * OwnTracks topic / payload パース.
 * Imperativus の同名モジュールと互換 (将来 lib 化検討).
 */

import type { OwntracksLocation, ParsedOwntracksTopic } from "./types.js";

export function parseOwntracksTopic(topic: string): ParsedOwntracksTopic | null {
  const parts = topic.split("/");
  if (parts.length < 3) return null;
  if (parts[0] !== "owntracks") return null;
  const user = parts[1];
  const device = parts[2];
  if (!user || !device) return null;
  return { user, device };
}

export function parseOwntracksLocation(input: unknown): OwntracksLocation | null {
  if (typeof input !== "object" || input === null) return null;
  const o = input as Record<string, unknown>;
  if (o._type !== "location") return null;
  if (typeof o.lat !== "number" || !Number.isFinite(o.lat)) return null;
  if (typeof o.lon !== "number" || !Number.isFinite(o.lon)) return null;
  if (typeof o.tst !== "number" || !Number.isFinite(o.tst)) return null;
  if (o.lat < -90 || o.lat > 90) return null;
  if (o.lon < -180 || o.lon > 180) return null;

  return {
    _type: "location",
    lat: o.lat,
    lon: o.lon,
    tst: o.tst,
    acc: typeof o.acc === "number" ? o.acc : undefined,
    alt: typeof o.alt === "number" ? o.alt : undefined,
    batt: typeof o.batt === "number" ? o.batt : undefined,
    vel: typeof o.vel === "number" ? o.vel : undefined,
    cog: typeof o.cog === "number" ? o.cog : undefined,
    tid: typeof o.tid === "string" ? o.tid : undefined,
    conn: typeof o.conn === "string" ? o.conn : undefined,
  };
}
