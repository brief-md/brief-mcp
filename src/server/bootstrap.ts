// src/server/bootstrap.ts — stub for TASK-08
// Replace with real implementation during build loop.

import type { BriefConfig } from "../types/config.js";

export interface ServerInstance {
  readonly start: () => Promise<void>;
  readonly stop: () => Promise<void>;
}

export function createServer(_config: BriefConfig): ServerInstance {
  throw new Error("Not implemented: createServer");
}

export async function registerAllTools(_server: unknown): Promise<void> {
  throw new Error("Not implemented: registerAllTools");
}

export function createRateLimiter(_config: BriefConfig): {
  checkRead: () => boolean;
  checkWrite: () => boolean;
} {
  throw new Error("Not implemented: createRateLimiter");
}
