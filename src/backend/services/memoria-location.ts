/**
 * Memoria への移動サマリ転送.
 *
 * spec/service-schema.md §3.5 の Memoria.location.summary.append を呼ぶ.
 * Memoria 側 handler は別 PR で実装予定. v0.1 では Legatus → Memoria 方向の
 * peer command 仕様を Legatus 側で先行定義し、Memoria 側に揃える.
 */

import { z } from "zod";
import { currentPeerAdapter } from "../peer/peer-adapter.js";
import { LegatusError } from "../../shared/errors.js";
import type { LocationSummary } from "../owntracks/types.js";

const PayloadSchema = z.object({
  userId: z.string().uuid(),
  intervalStart: z.string().datetime({ offset: true }),
  intervalEnd: z.string().datetime({ offset: true }),
  start: z.object({ lat: z.number(), lon: z.number() }),
  end: z.object({ lat: z.number(), lon: z.number() }),
  totalDistanceMeters: z.number().nonnegative(),
  netDistanceMeters: z.number().nonnegative(),
  maxSpeedKmh: z.number().nonnegative().optional(),
  meanSpeedKmh: z.number().nonnegative().optional(),
  pointCount: z.number().int().positive(),
  deviceIds: z.array(z.string().min(1)).min(1),
  source: z.object({
    via: z.literal("legatus"),
    tool: z.literal("owntracks-mqtt"),
    requestId: z.string().min(1).max(128).optional(),
  }),
});

export type MemoriaLocationSummaryPayload = z.infer<typeof PayloadSchema>;

export interface ForwardResult {
  ok: boolean;
  error?: string;
}

export async function forwardSummaryToMemoria(
  userId: string,
  summary: LocationSummary,
  requestId: string | undefined,
): Promise<ForwardResult> {
  const payload: MemoriaLocationSummaryPayload = {
    userId,
    intervalStart: summary.intervalStart,
    intervalEnd: summary.intervalEnd,
    start: summary.start,
    end: summary.end,
    totalDistanceMeters: summary.totalDistanceMeters,
    netDistanceMeters: summary.netDistanceMeters,
    maxSpeedKmh: summary.maxSpeedKmh,
    meanSpeedKmh: summary.meanSpeedKmh,
    pointCount: summary.pointCount,
    deviceIds: summary.deviceIds,
    source: { via: "legatus", tool: "owntracks-mqtt", requestId },
  };

  const parsed = PayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.message };
  }

  try {
    const peer = currentPeerAdapter();
    await peer.invoke("memoria", "location.summary.append", parsed.data);
    return { ok: true };
  } catch (err) {
    const e = err as { code?: string; message?: string };
    return {
      ok: false,
      error: e.code ? `${e.code}: ${e.message ?? ""}` : (err as Error).message,
    };
  }
}

export class MemoriaForwardError extends LegatusError {
  constructor(message: string) {
    super("upstream_error", message, "memoria");
  }
}
