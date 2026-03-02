// src/errors/partial-success.ts

import type { Logger } from "../observability/logger.js";

export async function settleAll<T>(
  operations: Array<() => Promise<T>>,
  logger: Logger,
): Promise<{ results: T[]; warnings: string[] }> {
  const settled = await Promise.allSettled(operations.map((op) => op()));

  const results: T[] = [];
  const warnings: string[] = [];

  for (const outcome of settled) {
    if (outcome.status === "fulfilled") {
      results.push(outcome.value);
    } else {
      const reason = outcome.reason;
      let msg: string;
      if (reason instanceof Error) {
        msg = reason.message || "Unknown error";
      } else if (typeof reason === "string" && reason.length > 0) {
        msg = reason;
      } else {
        msg = "Unknown error";
      }
      logger.warn("Partial operation failed", { error: msg });
      warnings.push(`Operation failed: ${msg}`);
    }
  }

  return { results, warnings };
}
