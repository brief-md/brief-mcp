// src/errors/partial-success.ts — stub for TASK-04
// Replace with real implementation during build loop.

import type { Logger } from "../observability/logger.js";

export async function settleAll<T>(
  _operations: Array<() => Promise<T>>,
  _logger: Logger,
): Promise<{ results: T[]; warnings: string[] }> {
  throw new Error("Not implemented: settleAll");
}
