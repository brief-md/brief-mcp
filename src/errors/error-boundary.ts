// src/errors/error-boundary.ts — stub for TASK-04
// Replace with real implementation during build loop.

import type { Logger } from "../observability/logger.js";
import type { ToolResponse } from "../types/responses.js";

export async function withErrorBoundary<T>(
  _handler: () => Promise<T>,
  _logger: Logger,
): Promise<ToolResponse> {
  throw new Error("Not implemented: withErrorBoundary");
}
