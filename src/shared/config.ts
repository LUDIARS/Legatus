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

export interface LegatusConfig {
  cernere: CernereConfig;
  localHost: string;
  localPort: number;
  dbPath: string;
  saPublicBaseUrl: string;
  ownerUserId: string;
  relays: RelayTargetsConfig;
}

export function loadConfig(): LegatusConfig {
  const cernereUrl = process.env.CERNERE_URL ?? "";
  const cernereId = process.env.CERNERE_PROJECT_CLIENT_ID ?? "";
  const cernereSecret = process.env.CERNERE_PROJECT_CLIENT_SECRET ?? "";
  const cernereEnabled = !!(cernereUrl && cernereId && cernereSecret);

  const memoriaBaseUrl = process.env.MEMORIA_BASE_URL ?? "";
  const actioBaseUrl = process.env.ACTIO_BASE_URL ?? "";
  const actioServiceKey = process.env.ACTIO_PLACEMENT_SERVICE_KEY ?? "";

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
  };
}
