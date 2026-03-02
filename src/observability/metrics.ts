// src/observability/metrics.ts

import type { Logger } from "./logger.js";

export interface MetricsCollector {
  increment(counter: string, key?: string): void;
  getAll(): Record<string, unknown>;
  reset(): void;
  logSummary(logger: Logger): void;
}

// All categories use sub-keyed objects for flexible tracking
type MetricsState = {
  toolCalls: Record<string, number>;
  errors: Record<string, number>;
  fileReads: Record<string, number>;
  fileWrites: Record<string, number>;
  ontologySearches: Record<string, number>;
  parseOperations: Record<string, number>;
};

function emptyState(): MetricsState {
  return {
    toolCalls: {},
    errors: {},
    fileReads: {},
    fileWrites: {},
    ontologySearches: {},
    parseOperations: {},
  };
}

export function createMetricsCollector(): MetricsCollector {
  let state: MetricsState = emptyState();

  return {
    increment(counter: string, key?: string): void {
      const cat = (state as Record<string, Record<string, number>>)[counter];
      if (cat === undefined) return;
      const bucket = key ?? "__total";
      cat[bucket] = (cat[bucket] ?? 0) + 1;
    },

    getAll(): Record<string, unknown> {
      return {
        toolCalls: { ...state.toolCalls },
        errors: { ...state.errors },
        fileReads: { ...state.fileReads },
        fileWrites: { ...state.fileWrites },
        ontologySearches: { ...state.ontologySearches },
        parseOperations: { ...state.parseOperations },
      };
    },

    reset(): void {
      state = emptyState();
    },

    logSummary(logger: Logger): void {
      const all = this.getAll();
      logger.info(`Metrics summary: ${JSON.stringify(all)}`);
    },
  };
}
