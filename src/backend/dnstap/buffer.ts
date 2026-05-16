/**
 * Domain visit buffer with burst dedupe + periodic flush.
 *
 * 同一 (device_label, domain) が dedupeWindowMs 以内に複数届いたら 1 件に集約.
 * (A / AAAA / HTTPS RR が同時に飛ぶ DNS 仕様への対応.)
 *
 * 設計判断: dedupe は「窓内の最初の event」 を採用、 後続の qtype 違いは捨てる
 * (Memoria 側で domain 単位の集約に集約されるため、 細粒度の qtype を全件
 * 持つ意味は薄い).
 *
 * spec: <../../../spec/dns-sni-tap.md> §6 (buffer.ts)
 */

import type { DomainVisitEvent } from "./types.js";
import { createChildLogger } from "../../shared/logger.js";

const log = createChildLogger("dnstap-buffer");

export interface DnstapBufferOptions {
  flushIntervalMs: number;
  dedupeWindowMs: number;
  onFlush: (events: DomainVisitEvent[]) => void | Promise<void>;
  /** test injection */
  now?: () => number;
}

interface BufferEntry {
  /** epoch ms (push 時刻、 dedupe 判定に使用) */
  pushedAt: number;
  event: DomainVisitEvent;
}

export class DnstapBuffer {
  private entries: BufferEntry[] = [];
  private timer: NodeJS.Timeout | null = null;
  private readonly now: () => number;

  constructor(private readonly opts: DnstapBufferOptions) {
    this.now = opts.now ?? Date.now;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(
      () => void this.flush(),
      this.opts.flushIntervalMs,
    );
    log.info({ intervalMs: this.opts.flushIntervalMs }, "dnstap buffer started");
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    await this.flush();
  }

  /**
   * Push 1 件. dedupe 窓内に同じ (device_label, domain) があれば skip.
   */
  push(event: DomainVisitEvent): void {
    const now = this.now();
    const cutoff = now - this.opts.dedupeWindowMs;
    // 既存 entry を後ろから走査 (最近のものが見つかりやすい)
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const e = this.entries[i];
      if (e.pushedAt < cutoff) break; // それより前は窓外
      if (
        e.event.device_label === event.device_label &&
        e.event.domain === event.domain
      ) {
        return; // dedupe — skip
      }
    }
    this.entries.push({ pushedAt: now, event });
  }

  size(): number {
    return this.entries.length;
  }

  async flush(): Promise<DomainVisitEvent[]> {
    const drained = this.entries.map((e) => e.event);
    this.entries = [];
    if (drained.length === 0) return [];
    try {
      await this.opts.onFlush(drained);
    } catch (err) {
      log.warn(
        { err: (err as Error).message, count: drained.length },
        "dnstap onFlush threw (events dropped)",
      );
    }
    return drained;
  }
}
