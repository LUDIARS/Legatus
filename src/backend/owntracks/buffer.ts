/**
 * Periodic location buffer with flush timer.
 *
 * 単一インスタンスで全 device の event をまとめて受ける. flush 時刻に
 * summarize → emit → drop を 1 トランザクションで実行.
 */

import type { LocationEvent, LocationSummary } from "./types.js";
import { summarizeBuffer } from "./summarizer.js";
import { createChildLogger } from "../../shared/logger.js";

const log = createChildLogger("location-buffer");

export interface BufferOptions {
  flushIntervalMs: number;
  minDisplacementMeters: number;
  onFlush: (summary: LocationSummary) => void | Promise<void>;
  /** test injection */
  now?: () => number;
}

export class LocationBuffer {
  private buffer: LocationEvent[] = [];
  private timer: NodeJS.Timeout | null = null;
  private intervalStartMs: number;
  private readonly now: () => number;

  constructor(private readonly opts: BufferOptions) {
    this.now = opts.now ?? Date.now;
    this.intervalStartMs = this.now();
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(
      () => void this.flush(),
      this.opts.flushIntervalMs,
    );
    log.info({ intervalMs: this.opts.flushIntervalMs }, "location buffer started");
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    await this.flush();
  }

  push(event: LocationEvent): void {
    this.buffer.push(event);
  }

  /** 現在の buffer サイズ. test 確認用. */
  size(): number {
    return this.buffer.length;
  }

  /** 即時 flush. interval を待たずに summarize する (test / shutdown 用). */
  async flush(): Promise<LocationSummary | null> {
    const drained = this.buffer;
    this.buffer = [];
    const intervalStart = this.intervalStartMs;
    this.intervalStartMs = this.now();

    if (drained.length === 0) return null;

    const summary = summarizeBuffer(
      drained,
      intervalStart,
      this.opts.minDisplacementMeters,
    );

    if (!summary) {
      log.debug(
        { points: drained.length },
        "skip flush (no movement above threshold)",
      );
      return null;
    }

    try {
      await this.opts.onFlush(summary);
    } catch (err) {
      log.warn(
        { err: (err as Error).message },
        "onFlush threw (summary dropped)",
      );
    }
    return summary;
  }
}
