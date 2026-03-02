// src/errors/unhandled-rejection.ts — stub for TASK-04
// Replace with real implementation during build loop.

import type { Logger } from "../observability/logger.js";

export function installUnhandledRejectionHandler(_logger: Logger): void {
  throw new Error("Not implemented: installUnhandledRejectionHandler");
}

export function removeUnhandledRejectionHandler(): void {
  throw new Error("Not implemented: removeUnhandledRejectionHandler");
}
