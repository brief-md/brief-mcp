// src/observability/child-logger.ts

import {
  _createLoggerFromConfig,
  _getLoggerConfig,
  type Logger,
} from "./logger.js";

export function createChildLogger(parent: Logger, moduleName: string): Logger {
  const config = _getLoggerConfig(parent);
  if (config !== undefined) {
    // Create new logger with same config but different module name
    return _createLoggerFromConfig({ ...config, moduleName });
  }
  // Fallback for non-internal loggers (mocks etc.)
  return {
    trace: (msg, ctx) => parent.trace(`[${moduleName}] ${msg}`, ctx),
    debug: (msg, ctx) => parent.debug(`[${moduleName}] ${msg}`, ctx),
    info: (msg, ctx) => parent.info(`[${moduleName}] ${msg}`, ctx),
    warn: (msg, ctx) => parent.warn(`[${moduleName}] ${msg}`, ctx),
    error: (msg, ctx) => parent.error(`[${moduleName}] ${msg}`, ctx),
    fatal: (msg, ctx) => parent.fatal(`[${moduleName}] ${msg}`, ctx),
  };
}
