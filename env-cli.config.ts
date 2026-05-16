import type { EnvCliConfig } from "../Cernere/packages/env-cli/src/types.js";

const config: EnvCliConfig = {
  name: "Legatus",

  /**
   * Legatus が .env から読むキー一覧.
   * Cernere モードは optional. VPN+ローカル運用時は CERNERE_PROJECT_* を空にして OK.
   */
  infraKeys: {
    // ─── Cernere 認証 (optional) ─────────────────────────
    CERNERE_URL: "http://localhost:8080",
    CERNERE_PROJECT_CLIENT_ID: "",
    CERNERE_PROJECT_CLIENT_SECRET: "",
    CERNERE_PROJECT_KEY: "legatus",

    // ─── Local API (loopback POST) ────────────────────────
    LEGATUS_LOCAL_HOST: "127.0.0.1",
    LEGATUS_LOCAL_PORT: "17320",

    // ─── Storage ──────────────────────────────────────────
    LEGATUS_DB_PATH: "",

    // ─── Logging ──────────────────────────────────────────
    LEGATUS_LOG_LEVEL: "info",

    // ─── Cernere mode 用 SA listen ────────────────────────
    LEGATUS_SA_PUBLIC_BASE_URL: "ws://127.0.0.1:{port}",

    // ─── Owner identity (Cernere session が無いローカル運用時) ──
    LEGATUS_OWNER_USER_ID: "",

    // ─── OwnTracks (MQTT subscriber) ──────────────────────
    OWNTRACKS_ENABLED: "true",
    OWNTRACKS_MQTT_URL: "mqtt://127.0.0.1:1883",
    OWNTRACKS_MQTT_USERNAME: "",
    OWNTRACKS_MQTT_PASSWORD: "",
    OWNTRACKS_MQTT_TOPIC: "owntracks/+/+",
    OWNTRACKS_MQTT_CLIENT_ID: "",

    // ─── Location buffer ──────────────────────────────────
    LEGATUS_LOCATION_FLUSH_INTERVAL_MS: "300000",
    LEGATUS_LOCATION_MIN_DISPLACEMENT_M: "100",

    // ─── Memoria HTTP relay (loopback/tailnet 内, 認証なし) ──
    MEMORIA_BASE_URL: "",

    // ─── Memoria PeerAdapter relay (Cernere モード時の選択肢) ──
    MEMORIA_USE_PEER_ADAPTER: "false",

    // ─── Actio Placement HTTP relay (既存 Iv パターン) ──
    ACTIO_BASE_URL: "",
    ACTIO_PLACEMENT_SERVICE_KEY: "",

    // ─── DNS / SNI tap (Phase B, default OFF) ─────────
    LEGATUS_DNSTAP_ENABLED: "false",
    LEGATUS_DNSMASQ_LOG_PATH: "/var/log/dnsmasq.log",
    LEGATUS_TAILSCALE_BIN: "tailscale",
    LEGATUS_TAILSCALE_REFRESH_MS: "300000",
    LEGATUS_DNSTAP_FLUSH_MS: "30000",
    LEGATUS_DNSTAP_DEDUPE_MS: "5000",
    LEGATUS_DNSTAP_SKIP_DOMAINS: "",
    LEGATUS_DNSTAP_FORWARD_URL: "http://localhost:5180/api/visits/external",
  },

  defaultSiteUrl: "https://app.infisical.com",
  defaultEnvironment: "dev",
};

export default config;
