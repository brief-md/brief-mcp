// src/observability/request-id.ts — stub for TASK-03
// Replace with real implementation during build loop.

import type { Logger } from "./logger.js";

export function generateRequestId(): string {
  throw new Error("Not implemented: generateRequestId");
}

export function withRequestId(_id: string, _logger: Logger): Logger {
  throw new Error("Not implemented: withRequestId");
}
