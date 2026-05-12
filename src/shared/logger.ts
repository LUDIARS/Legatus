import pino, { type Logger } from "pino";

const level = process.env.LEGATUS_LOG_LEVEL ?? "info";

export const rootLogger: Logger = pino({
  level,
  transport:
    process.env.NODE_ENV === "production"
      ? undefined
      : {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "SYS:HH:MM:ss" },
        },
});

export function createChildLogger(name: string): Logger {
  return rootLogger.child({ name });
}
