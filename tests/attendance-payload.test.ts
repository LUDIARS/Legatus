import { describe, it, expect } from "vitest";
import { parseAttendanceEvent } from "../src/backend/attendance/payload.js";

const valid = {
  type: "attendance.checked_in",
  userId: "u_123",
  facilityId: "fac_a",
  checkedInAt: 1700000000000,
  reservationId: "r_1",
  source: "aedilis",
};

describe("parseAttendanceEvent", () => {
  it("parses a valid event", () => {
    expect(parseAttendanceEvent(valid)).toEqual(valid);
  });

  it("accepts null reservationId", () => {
    const ev = { ...valid, reservationId: null };
    expect(parseAttendanceEvent(ev)).toEqual(ev);
  });

  it("rejects wrong type", () => {
    expect(parseAttendanceEvent({ ...valid, type: "attendance.left" })).toBeNull();
  });

  it("rejects wrong source", () => {
    expect(parseAttendanceEvent({ ...valid, source: "other" })).toBeNull();
  });

  it("rejects missing userId", () => {
    const { userId: _drop, ...rest } = valid;
    void _drop;
    expect(parseAttendanceEvent(rest)).toBeNull();
  });

  it("rejects empty facilityId", () => {
    expect(parseAttendanceEvent({ ...valid, facilityId: "" })).toBeNull();
  });

  it("rejects non-numeric checkedInAt", () => {
    expect(parseAttendanceEvent({ ...valid, checkedInAt: "x" })).toBeNull();
  });

  it("rejects numeric reservationId", () => {
    expect(parseAttendanceEvent({ ...valid, reservationId: 5 })).toBeNull();
  });

  it("rejects null / non-object", () => {
    expect(parseAttendanceEvent(null)).toBeNull();
    expect(parseAttendanceEvent("foo")).toBeNull();
  });

  it("drops extra fields (normalizes to known shape)", () => {
    expect(parseAttendanceEvent({ ...valid, evil: true })).toEqual(valid);
  });
});
