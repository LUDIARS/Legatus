/**
 * Legatus runtime config — env から組み立てる単一エントリポイント.
 *
 * env-cli が `.env` を生成する前提。Electron / backend / MCP すべてが本モジュール経由で env を読む。
 */

export interface LegatusConfig {
  cernereUrl: string;
  cernereProjectClientId: string;
  cernereProjectClientSecret: string;
  cernereProjectKey: string;
  localHost: string;
  localPort: number;
  dbPath: string;
  saPublicBaseUrl: string;
  actioBaseUrl: string;
  actioPlacementServiceKey: string;
}

export function loadConfig(): LegatusConfig {
  return {
    cernereUrl: process.env.CERNERE_URL ?? "",
    cernereProjectClientId: process.env.CERNERE_PROJECT_CLIENT_ID ?? "",
    cernereProjectClientSecret: process.env.CERNERE_PROJECT_CLIENT_SECRET ?? "",
    cernereProjectKey: process.env.CERNERE_PROJECT_KEY ?? "legatus",
    localHost: process.env.LEGATUS_LOCAL_HOST ?? "127.0.0.1",
    localPort: Number(process.env.LEGATUS_LOCAL_PORT ?? "17320"),
    dbPath: process.env.LEGATUS_DB_PATH ?? "",
    saPublicBaseUrl:
      process.env.LEGATUS_SA_PUBLIC_BASE_URL ?? "ws://127.0.0.1:{port}",
    actioBaseUrl: process.env.ACTIO_BASE_URL ?? "",
    actioPlacementServiceKey: process.env.ACTIO_PLACEMENT_SERVICE_KEY ?? "",
  };
}

export function assertCernereProjectCredentials(c: LegatusConfig): void {
  if (!c.cernereProjectClientId || !c.cernereProjectClientSecret || !c.cernereUrl) {
    throw new Error(
      "CERNERE_URL / CERNERE_PROJECT_CLIENT_ID / CERNERE_PROJECT_CLIENT_SECRET が未設定です。" +
        "Cernere admin で legatus project を発行してから env を再生成してください。",
    );
  }
}
