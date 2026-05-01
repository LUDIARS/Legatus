/**
 * Memoria への forward client.
 *
 * v0.1 は単純な fetch POST. PeerAdapter (Cernere 認証) 統合は v0.2 で
 * 既存 owntracks/ の forward 経路に乗せ替える予定.
 *
 * spec: <../../../spec/dns-sni-tap.md> §7 (Memoria 受け口)
 */

import type { DomainVisitBatch, DomainVisitEvent } from "./types.js";
import { createChildLogger } from "../../shared/logger.js";

const log = createChildLogger("dnstap-forward");

export interface DnstapClientOptions {
  forwardUrl: string;
  /** test injection */
  fetcher?: typeof fetch;
}

export class DnstapClient {
  private readonly fetcher: typeof fetch;

  constructor(private readonly opts: DnstapClientOptions) {
    this.fetcher = opts.fetcher ?? fetch;
  }

  async forward(events: DomainVisitEvent[]): Promise<void> {
    if (events.length === 0) return;
    const batch: DomainVisitBatch = {
      events,
      flushed_at: new Date().toISOString(),
    };
    try {
      const res = await this.fetcher(this.opts.forwardUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(batch),
      });
      if (!res.ok) {
        log.warn(
          { status: res.status, count: events.length },
          "memoria forward returned non-2xx",
        );
        return;
      }
      log.debug({ count: events.length }, "forwarded dnstap batch to memoria");
    } catch (err) {
      log.warn(
        { err: (err as Error).message, count: events.length },
        "dnstap forward failed",
      );
    }
  }
}
