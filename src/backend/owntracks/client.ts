/**
 * MQTT subscriber. mqtt.js + 自動再接続 + 1 リスナーへ正規化された LocationEvent を流す.
 */

import mqtt, { type MqttClient } from "mqtt";
import { createChildLogger } from "../../shared/logger.js";
import { parseOwntracksLocation, parseOwntracksTopic } from "./payload.js";
import type { OwntracksMqttConfig } from "./config.js";
import type { LocationEvent } from "./types.js";

const log = createChildLogger("owntracks-mqtt");

export type LocationEventHandler = (event: LocationEvent) => void | Promise<void>;

export interface OwntracksClientHandle {
  client: MqttClient;
  stop: () => Promise<void>;
}

export function startOwntracksClient(
  config: OwntracksMqttConfig,
  onEvent: LocationEventHandler,
): OwntracksClientHandle {
  const opts: mqtt.IClientOptions = {
    clientId: config.clientId,
    reconnectPeriod: 5000,
    connectTimeout: 10_000,
  };
  if (config.username) opts.username = config.username;
  if (config.password) opts.password = config.password;

  const client = mqtt.connect(config.url, opts);

  client.on("connect", () => {
    log.info({ url: config.url, topic: config.topic }, "mqtt connected");
    client.subscribe(config.topic, { qos: 1 }, (err) => {
      if (err) log.error({ err: err.message }, "mqtt subscribe failed");
      else log.info({ topic: config.topic }, "mqtt subscribed");
    });
  });

  client.on("reconnect", () => log.info("mqtt reconnecting"));
  client.on("close", () => log.info("mqtt connection closed"));
  client.on("error", (err) => log.error({ err: err.message }, "mqtt error"));

  client.on("message", async (topic, payload) => {
    const t = parseOwntracksTopic(topic);
    if (!t) return;
    let raw: unknown;
    try {
      raw = JSON.parse(payload.toString("utf8"));
    } catch {
      return;
    }
    const loc = parseOwntracksLocation(raw);
    if (!loc) return;

    const event: LocationEvent = {
      topicUser: t.user,
      device: t.device,
      lat: loc.lat,
      lon: loc.lon,
      ts: new Date(loc.tst * 1000).toISOString(),
      acc: loc.acc,
      alt: loc.alt,
      vel: loc.vel,
      cog: loc.cog,
    };

    try {
      await onEvent(event);
    } catch (err) {
      log.warn({ err: (err as Error).message }, "location handler threw");
    }
  });

  return {
    client,
    stop: async () =>
      new Promise<void>((resolve) => client.end(false, {}, () => resolve())),
  };
}
