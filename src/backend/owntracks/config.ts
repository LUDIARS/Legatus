/**
 * OwnTracks subscriber 設定.
 *
 * Mosquitto は Legatus PC 同居前提 (option 1: tailnet 経由で phone OwnTracks
 * app から publish, Legatus は loopback で subscribe).
 * Mosquitto の listen interface は Tailscale tailnet IPv4 + 127.0.0.1 のみ
 * (一般のインターネットには公開しない). 本 config は接続先 URL のみ持つ.
 */

export interface OwntracksMqttConfig {
  url: string;
  username: string;
  password: string;
  topic: string;
  clientId: string;
}

export interface OwntracksRuntimeConfig {
  enabled: boolean;
  mqtt: OwntracksMqttConfig;
  /** flush 間隔 (ms). default 5 分. */
  flushIntervalMs: number;
  /** netDistance がこの値未満なら flush を skip ("動いていない"). default 100m. */
  minDisplacementMeters: number;
  /** ループユーザの OwnTracks topic 名 → 強制ユーザ ID 上書き. 空なら session userId にフォールバック. */
  forcedUserId: string | null;
}

export function loadOwntracksConfig(env = process.env): OwntracksRuntimeConfig {
  return {
    enabled: (env.OWNTRACKS_ENABLED ?? "true").toLowerCase() !== "false",
    mqtt: {
      url: env.OWNTRACKS_MQTT_URL ?? "mqtt://127.0.0.1:1883",
      username: env.OWNTRACKS_MQTT_USERNAME ?? "",
      password: env.OWNTRACKS_MQTT_PASSWORD ?? "",
      topic: env.OWNTRACKS_MQTT_TOPIC ?? "owntracks/+/+",
      clientId:
        env.OWNTRACKS_MQTT_CLIENT_ID ?? `legatus-owntracks-${process.pid}`,
    },
    flushIntervalMs: Number(env.LEGATUS_LOCATION_FLUSH_INTERVAL_MS ?? 300_000),
    minDisplacementMeters: Number(env.LEGATUS_LOCATION_MIN_DISPLACEMENT_M ?? 100),
    forcedUserId: env.LEGATUS_FORCED_USER_ID || null,
  };
}
