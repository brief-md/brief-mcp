// Re-export from observability module for import compatibility
export * from "./observability/logger.js";

import _defaultLogger from "./observability/logger.js";

// Individual log methods — exported as functions so vitest can spy on them
// via `import * as logger` namespace imports
export function debug(msg: string, context?: Record<string, unknown>): void {
  _defaultLogger.debug(msg, context);
}
export function info(msg: string, context?: Record<string, unknown>): void {
  _defaultLogger.info(msg, context);
}
export function warn(msg: string, context?: Record<string, unknown>): void {
  _defaultLogger.warn(msg, context);
}
export function error(msg: string, context?: Record<string, unknown>): void {
  _defaultLogger.error(msg, context);
}
