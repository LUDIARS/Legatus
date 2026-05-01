import { describe, it, expect, vi } from "vitest";
import { DnstapBuffer } from "../src/backend/dnstap/buffer.js";
import type { DomainVisitEvent } from "../src/backend/dnstap/types.js";

function ev(
  domain: string,
  device: string = "iphone",
  ts: string = "2026-05-02T14:00:00.000Z",
): DomainVisitEvent {
  return {
    ts,
    domain,
    source: "dns",
    src_ip: "100.x.x.x",
    device_label: device,
    device_os: "iOS",
    qtype: "A",
  };
}

describe("DnstapBuffer", () => {
  it("flushes accumulated events", async () => {
    const captured: DomainVisitEvent[][] = [];
    const buf = new DnstapBuffer({
      flushIntervalMs: 99_999,
      dedupeWindowMs: 5_000,
      onFlush: (events) => {
        captured.push(events);
      },
    });
    buf.push(ev("a.com"));
    buf.push(ev("b.com"));
    expect(buf.size()).toBe(2);
    await buf.flush();
    expect(captured.length).toBe(1);
    expect(captured[0].map((e) => e.domain)).toEqual(["a.com", "b.com"]);
    expect(buf.size()).toBe(0);
  });

  it("dedupes burst within the window (same device+domain)", async () => {
    let now = 1_000;
    const captured: DomainVisitEvent[][] = [];
    const buf = new DnstapBuffer({
      flushIntervalMs: 99_999,
      dedupeWindowMs: 5_000,
      onFlush: (events) => {
        captured.push(events);
      },
      now: () => now,
    });
    buf.push(ev("github.com")); // accepted
    now = 2_000;
    buf.push(ev("github.com")); // dedupe (same device+domain in window)
    buf.push(ev("github.com", "ipad")); // accepted (different device)
    now = 8_000; // window has lapsed (>5s from first push)
    buf.push(ev("github.com")); // accepted (out of window)
    await buf.flush();
    expect(captured[0].length).toBe(3);
    expect(captured[0].map((e) => e.device_label)).toEqual([
      "iphone",
      "ipad",
      "iphone",
    ]);
  });

  it("flush returns empty array when no events", async () => {
    const onFlush = vi.fn();
    const buf = new DnstapBuffer({
      flushIntervalMs: 99_999,
      dedupeWindowMs: 5_000,
      onFlush,
    });
    const r = await buf.flush();
    expect(r).toEqual([]);
    expect(onFlush).not.toHaveBeenCalled();
  });

  it("onFlush errors are swallowed (events dropped, buffer cleared)", async () => {
    const buf = new DnstapBuffer({
      flushIntervalMs: 99_999,
      dedupeWindowMs: 5_000,
      onFlush: () => {
        throw new Error("forward broken");
      },
    });
    buf.push(ev("a.com"));
    await buf.flush(); // must not throw
    expect(buf.size()).toBe(0);
  });
});
