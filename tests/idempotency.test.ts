import { describe, it, expect, vi } from "vitest";
import { IdempotencyCache } from "../src/backend/audit/idempotency.js";

describe("IdempotencyCache", () => {
  it("caches and returns the same response within TTL", () => {
    const cache = new IdempotencyCache();
    cache.set("k1", { id: "task-1" });
    expect(cache.get("k1")).toEqual({ id: "task-1" });
  });

  it("expires entries after 10 min", () => {
    vi.useFakeTimers();
    try {
      const cache = new IdempotencyCache();
      cache.set("k2", { id: "task-2" });
      vi.advanceTimersByTime(11 * 60 * 1000);
      expect(cache.get("k2")).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});
