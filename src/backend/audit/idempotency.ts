/**
 * In-memory idempotency cache for outbound peer calls.
 *
 * spec/service-schema.md §7.2 準拠 (10 分 TTL).
 *
 * Legatus は単一プロセスなので memory cache で十分。process restart 時はキャッシュ消失するが、
 * target 側 (Actio 等) の idempotencyKey 処理が真の権威となる。
 */

const TTL_MS = 10 * 60 * 1000;

interface CacheEntry {
  expiresAt: number;
  response: unknown;
}

export class IdempotencyCache {
  private readonly cache = new Map<string, CacheEntry>();

  get(key: string): unknown | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt < Date.now()) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.response;
  }

  set(key: string, response: unknown): void {
    this.cache.set(key, { expiresAt: Date.now() + TTL_MS, response });
  }

  prune(): void {
    const now = Date.now();
    for (const [k, v] of this.cache) {
      if (v.expiresAt < now) this.cache.delete(k);
    }
  }
}
