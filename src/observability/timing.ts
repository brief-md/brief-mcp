// src/observability/timing.ts — stub for TASK-03
// Replace with real implementation during build loop.

import type { Logger } from "./logger.js";

export interface TimerHandle {
  readonly startMs: number;
  readonly label: string;
}

export function startTimer(_label: string): TimerHandle {
  throw new Error("Not implemented: startTimer");
}

export function stopTimer(_handle: TimerHandle): number {
  throw new Error("Not implemented: stopTimer");
}

export async function withTiming<T>(
  _label: string,
  _logger: Logger,
  _fn: () => Promise<T>,
): Promise<T> {
  throw new Error("Not implemented: withTiming");
}
