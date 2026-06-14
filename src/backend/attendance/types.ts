/**
 * 出席イベントの型. Aedilis のチェックインから送られてくる payload と一致させる.
 *
 * 個人データは userId アンカーのみ保持し、Legatus 側では永続化しない
 * (fire-and-forward でなく転送結果だけ返す中継).
 */

export interface AttendanceCheckedInEvent {
  type: "attendance.checked_in";
  userId: string;
  facilityId: string;
  /** epoch ms. */
  checkedInAt: number;
  reservationId: string | null;
  source: "aedilis";
}
