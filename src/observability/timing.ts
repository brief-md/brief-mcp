// src/observability/timing.ts

import type { Logger } from "./logger.js";

export interface TimerHandle {
  readonly startMs: number;
  readonly label: string;
}

export function startTimer(label: string): TimerHandle {
  return { startMs: Date.now(), label };
}

export function stopTimer(handle: TimerHandle): number {
  return Date.now() - handle.startMs;
}

export async function withTiming<T>(
  label: string,
  logger: Logger,
  fn: () => Promise<T>,
): Promise<T> {
  const handle = startTimer(label);
  try {
    const result = await fn();
    const ms = stopTimer(handle);
    logger.debug(`${label} completed in ${ms}ms`);
    return result;
  } catch (e) {
    const ms = stopTimer(handle);
    logger.debug(`${label} failed in ${ms}ms`);
    throw e;
  }
}
