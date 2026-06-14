/**
 * 出席イベント payload のパース / バリデーション.
 *
 * owntracks/payload.ts と同じく zod を使わず手書きで narrow する
 * (依存を増やさない / エラーメッセージを制御しやすい). 不正なら null.
 */

import type { AttendanceCheckedInEvent } from "./types.js";

export function parseAttendanceEvent(
  input: unknown,
): AttendanceCheckedInEvent | null {
  if (typeof input !== "object" || input === null) return null;
  const o = input as Record<string, unknown>;

  if (o.type !== "attendance.checked_in") return null;
  if (o.source !== "aedilis") return null;
  if (typeof o.userId !== "string" || o.userId.length === 0) return null;
  if (typeof o.facilityId !== "string" || o.facilityId.length === 0) return null;
  if (typeof o.checkedInAt !== "number" || !Number.isFinite(o.checkedInAt)) {
    return null;
  }
  if (o.reservationId !== null && typeof o.reservationId !== "string") {
    return null;
  }

  return {
    type: "attendance.checked_in",
    userId: o.userId,
    facilityId: o.facilityId,
    checkedInAt: o.checkedInAt,
    reservationId: o.reservationId,
    source: "aedilis",
  };
}
