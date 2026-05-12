import type { EnvCliConfig } from "../Cernere/packages/env-cli/src/types.js";

const config: EnvCliConfig = {
  name: "Legatus",

  /**
   * Legatus が .env から読むキー一覧。
   * Infisical に同名キーがあればそちらを優先し、なければ default を使用。
   *
   * Legatus は個人 PC 常駐サービスのため、CERNERE_PROJECT_CLIENT_ID/SECRET
   * のみが secret。他は loopback 用の設定値。
   */
  infraKeys: {
    // ─── Cernere 認証 (project identity) ──────────────────
    CERNERE_URL: "http://localhost:8080",
    CERNERE_PROJECT_CLIENT_ID: "",
    CERNERE_PROJECT_CLIENT_SECRET: "",
    CERNERE_PROJECT_KEY: "legatus",

    // ─── Local API (loopback POST) ────────────────────────
    LEGATUS_LOCAL_HOST: "127.0.0.1",
    LEGATUS_LOCAL_PORT: "17320",

    // ─── Storage ──────────────────────────────────────────
    LEGATUS_DB_PATH: "",          // 空 = userData/legatus.db (Electron app.getPath)

    // ─── Logging ──────────────────────────────────────────
    LEGATUS_LOG_LEVEL: "info",

    // ─── Service Adapter listen (peer in/out) ─────────────
    LEGATUS_SA_PUBLIC_BASE_URL: "ws://127.0.0.1:{port}",

    // ─── OwnTracks (MQTT subscriber) ──────────────────────
    OWNTRACKS_ENABLED: "true",
    OWNTRACKS_MQTT_URL: "mqtt://127.0.0.1:1883",
    OWNTRACKS_MQTT_USERNAME: "",
    OWNTRACKS_MQTT_PASSWORD: "",
    OWNTRACKS_MQTT_TOPIC: "owntracks/+/+",
    OWNTRACKS_MQTT_CLIENT_ID: "",

    // ─── Location buffer (Memoria summarizer) ─────────────
    LEGATUS_LOCATION_FLUSH_INTERVAL_MS: "300000",
    LEGATUS_LOCATION_MIN_DISPLACEMENT_M: "100",
    LEGATUS_FORCED_USER_ID: "",

    // ─── Actio Placement forwarder ────────────────────────
    ACTIO_BASE_URL: "",
    ACTIO_PLACEMENT_SERVICE_KEY: "",
  },

  defaultSiteUrl: "https://app.infisical.com",
  defaultEnvironment: "dev",
};

export default config;
