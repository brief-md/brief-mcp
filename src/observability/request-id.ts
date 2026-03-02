// src/observability/request-id.ts

import type { Logger } from "./logger.js";

export function generateRequestId(): string {
  return crypto.randomUUID();
}

export function withRequestId(id: string, logger: Logger): Logger {
  // Inject requestId into the context of every log call (OBS-04)
  return {
    trace: (msg, ctx) => logger.trace(msg, { ...ctx, requestId: id }),
    debug: (msg, ctx) => logger.debug(msg, { ...ctx, requestId: id }),
    info: (msg, ctx) => logger.info(msg, { ...ctx, requestId: id }),
    warn: (msg, ctx) => logger.warn(msg, { ...ctx, requestId: id }),
    error: (msg, ctx) => logger.error(msg, { ...ctx, requestId: id }),
    fatal: (msg, ctx) => logger.fatal(msg, { ...ctx, requestId: id }),
  };
}
