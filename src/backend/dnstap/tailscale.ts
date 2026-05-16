/**
 * `tailscale status --json` を実行して tailnet IP → device label の map を維持.
 *
 * 1 デバイスが v4 / v6 の両方を持つので、 IP 単位で map を作る.
 * 一定間隔で再 fetch して online / hostname 変更に追従.
 *
 * spec: <../../../spec/dns-sni-tap.md> §4 (Tailscale 連携)
 */

import { spawn } from "node:child_process";
import type { TailscaleDeviceInfo } from "./types.js";
import { createChildLogger } from "../../shared/logger.js";

const log = createChildLogger("tailscale-cache");

interface TailscaleSelf {
  HostName?: string;
  OS?: string;
  TailscaleIPs?: string[];
  Online?: boolean;
  UserID?: number;
  LastSeen?: string;
}

interface TailscalePeer extends TailscaleSelf {
  ID?: string;
}

interface TailscaleStatus {
  Self?: TailscaleSelf;
  Peer?: Record<string, TailscalePeer>;
  User?: Record<
    string,
    {
      LoginName?: string;
    }
  >;
}

/** `tailscale status --json` を 1 回実行して raw JSON を返す. spawn-only. */
export async function fetchTailscaleStatus(
  bin: string,
  timeoutMs: number = 5_000,
): Promise<TailscaleStatus | null> {
  return new Promise((resolve) => {
    const proc = spawn(bin, ["status", "--json"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
    }, timeoutMs);
    proc.stdout.on("data", (chunk) => (stdout += chunk.toString()));
    proc.stderr.on("data", (chunk) => (stderr += chunk.toString()));
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        log.warn(
          { code, stderr: stderr.slice(0, 200) },
          "tailscale status failed",
        );
        resolve(null);
        return;
      }
      try {
        resolve(JSON.parse(stdout) as TailscaleStatus);
      } catch (err) {
        log.warn({ err: (err as Error).message }, "tailscale JSON parse failed");
        resolve(null);
      }
    });
    proc.on("error", (err) => {
      clearTimeout(timer);
      log.warn({ err: err.message }, "tailscale spawn failed");
      resolve(null);
    });
  });
}

/** TailscaleStatus を IP → DeviceInfo の Map に展開. */
export function buildIpMap(
  status: TailscaleStatus | null,
): Map<string, TailscaleDeviceInfo> {
  const out = new Map<string, TailscaleDeviceInfo>();
  if (!status) return out;

  const userById = status.User ?? {};
  function loginName(userId?: number): string {
    if (userId === undefined) return "";
    return userById[String(userId)]?.LoginName ?? "";
  }

  function record(node: TailscaleSelf | TailscalePeer | undefined): void {
    if (!node) return;
    const ips = node.TailscaleIPs ?? [];
    if (ips.length === 0) return;
    const info: TailscaleDeviceInfo = {
      ip: "", // overwritten per-IP below
      hostname: node.HostName ?? "unknown",
      os: node.OS ?? null,
      user_login: loginName(node.UserID),
      online: node.Online ?? false,
      last_seen: node.LastSeen ?? null,
    };
    for (const ip of ips) {
      out.set(ip, { ...info, ip });
    }
  }

  record(status.Self);
  for (const id of Object.keys(status.Peer ?? {})) {
    record(status.Peer![id]);
  }
  return out;
}

export interface TailscaleCacheOptions {
  bin: string;
  refreshMs: number;
  /** test injection */
  fetcher?: typeof fetchTailscaleStatus;
}

/**
 * IP → DeviceInfo を内部 Map に持ちつつ定期 refresh.
 * `lookup(ip)` で解決を試み、 不明な IP は null を返す.
 */
export class TailscaleCache {
  private map = new Map<string, TailscaleDeviceInfo>();
  private timer: NodeJS.Timeout | null = null;
  private readonly fetcher: typeof fetchTailscaleStatus;

  constructor(private readonly opts: TailscaleCacheOptions) {
    this.fetcher = opts.fetcher ?? fetchTailscaleStatus;
  }

  /** 即時 refresh (起動時 + 定期). 失敗しても既存 map は保持. */
  async refresh(): Promise<void> {
    const status = await this.fetcher(this.opts.bin);
    const fresh = buildIpMap(status);
    if (fresh.size > 0) {
      this.map = fresh;
      log.debug({ size: fresh.size }, "tailscale map refreshed");
    } else {
      log.warn("tailscale refresh produced empty map (keeping old cache)");
    }
  }

  start(): void {
    if (this.timer) return;
    void this.refresh();
    this.timer = setInterval(() => void this.refresh(), this.opts.refreshMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  lookup(ip: string): TailscaleDeviceInfo | null {
    return this.map.get(ip) ?? null;
  }

  /** test 用 — 内部 map を直接置換 */
  setMapForTest(map: Map<string, TailscaleDeviceInfo>): void {
    this.map = map;
  }
}
