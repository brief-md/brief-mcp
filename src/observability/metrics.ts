// src/observability/metrics.ts — stub for TASK-03
// Replace with real implementation during build loop.

import type { Logger } from "./logger.js";

export interface MetricsCollector {
  increment(counter: string, key?: string): void;
  getAll(): Record<string, unknown>;
  reset(): void;
  logSummary(logger: Logger): void;
}

export function createMetricsCollector(): MetricsCollector {
  throw new Error("Not implemented: createMetricsCollector");
}
