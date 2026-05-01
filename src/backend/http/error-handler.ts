/**
 * Hono error handler — LegatusError を JSON にマップする.
 */

import type { Context, ErrorHandler } from "hono";
import { LegatusError, httpStatusFor } from "../../shared/errors.js";
import { createChildLogger } from "../../shared/logger.js";
import type { ContentfulStatusCode } from "hono/utils/http-status";

const log = createChildLogger("http");

export const errorHandler: ErrorHandler = (err, c: Context) => {
  if (err instanceof LegatusError) {
    return c.json(err.toJSON(), httpStatusFor(err.code) as ContentfulStatusCode);
  }
  log.error({ err }, "unhandled error");
  return c.json(
    { code: "internal_error", message: err instanceof Error ? err.message : String(err) },
    500,
  );
};
