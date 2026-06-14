/**
 * Legatus runtime config — env から組み立てる単一エントリポイント.
 *
 * env-cli が `.env` を生成する前提だが、 `.env` が手書きで存在する dev
 * 起動でも同じ shape で動く. Cernere 認証は optional (VPN/local 運用想定).
 */

export interface CernereConfig {
  enabled: boolean;
  url: string;
  projectClientId: string;
  projectClientSecret: string;
  projectKey: string;
}

export interface RelayTargetsConfig {
  memoria: { enabled: boolean; baseUrl: string };
  actioPlacement: { enabled: boolean; baseUrl: string; serviceKey: string };
}

/**
 * 出席イベント relay の設定.
 *
 * Aedilis (出席チェックイン) → Legatus loopback 受け口 → Memoria ingest の
 * 中継経路. 受信側 (Aedilis→Legatus) は service key、転送側 (Legatus→Memoria)
 * は Memoria の ingest key で認証する.
 */
export interface AttendanceRelayConfig {
  /** Memoria ingest base URL と key が揃っている時のみ有効. */
  enabled: boolean;
  /** Memoria 受信口の base URL (例: http://127.0.0.1:5180). */
  memoriaIngestUrl: string;
  /** Memoria 側 ingest 認証キー (X-Memoria-Ingest-Key). */
  memoriaIngestKey: string;
  /** Aedilis→Legatus 受信認証の service key. 空なら受信口を無効化. */
  serviceKey: string;
}

export interface LegatusConfig {
  cernere: CernereConfig;
  localHost: string;
  localPort: number;
  dbPath: string;
  saPublicBaseUrl: string;
  ownerUserId: string;
  relays: RelayTargetsConfig;
  attendanceRelay: AttendanceRelayConfig;
}

export function loadConfig(): LegatusConfig {
  const cernereUrl = process.env.CERNERE_URL ?? "";
  const cernereId = process.env.CERNERE_PROJECT_CLIENT_ID ?? "";
  const cernereSecret = process.env.CERNERE_PROJECT_CLIENT_SECRET ?? "";
  const cernereEnabled = !!(cernereUrl && cernereId && cernereSecret);

  const memoriaBaseUrl = process.env.MEMORIA_BASE_URL ?? "";
  const actioBaseUrl = process.env.ACTIO_BASE_URL ?? "";
  const actioServiceKey = process.env.ACTIO_PLACEMENT_SERVICE_KEY ?? "";

  const memoriaIngestUrl = process.env.MEMORIA_INGEST_URL ?? "";
  const memoriaIngestKey = process.env.MEMORIA_INGEST_KEY ?? "";
  const attendanceServiceKey = process.env.ATTENDANCE_RELAY_SERVICE_KEY ?? "";

  return {
    cernere: {
      enabled: cernereEnabled,
      url: cernereUrl,
      projectClientId: cernereId,
      projectClientSecret: cernereSecret,
      projectKey: process.env.CERNERE_PROJECT_KEY ?? "legatus",
    },
    localHost: process.env.LEGATUS_LOCAL_HOST ?? "127.0.0.1",
    localPort: Number(process.env.LEGATUS_LOCAL_PORT ?? "17320"),
    dbPath: process.env.LEGATUS_DB_PATH ?? "",
    saPublicBaseUrl:
      process.env.LEGATUS_SA_PUBLIC_BASE_URL ?? "ws://127.0.0.1:{port}",
    ownerUserId:
      process.env.LEGATUS_OWNER_USER_ID ??
      process.env.LEGATUS_FORCED_USER_ID ??
      "",
    relays: {
      memoria: {
        enabled: !!memoriaBaseUrl,
        baseUrl: memoriaBaseUrl,
      },
      actioPlacement: {
        enabled: !!(actioBaseUrl && actioServiceKey),
        baseUrl: actioBaseUrl,
        serviceKey: actioServiceKey,
      },
    },
    attendanceRelay: {
      enabled: !!(memoriaIngestUrl && memoriaIngestKey),
      memoriaIngestUrl,
      memoriaIngestKey,
      serviceKey: attendanceServiceKey,
    },
  };
}
