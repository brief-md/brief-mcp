// src/server/startup-recovery.ts — stub for TASK-50
// Replace with real implementation during build loop.

import type { Logger } from "../observability/logger.js";

export async function runStartupRecovery(_logger: Logger): Promise<void> {
  throw new Error("Not implemented: runStartupRecovery");
}

export async function cleanOrphanedTempFiles(_logger: Logger): Promise<number> {
  throw new Error("Not implemented: cleanOrphanedTempFiles");
}

export async function verifyGenericGuide(_logger: Logger): Promise<void> {
  throw new Error("Not implemented: verifyGenericGuide");
}

export async function checkForMultipleInstances(
  _logger: Logger,
): Promise<boolean> {
  throw new Error("Not implemented: checkForMultipleInstances");
}

export async function logStartupInfo(
  _logger: Logger,
  _info: import("../types/server.js").ServerStartupInfo,
): Promise<void> {
  throw new Error("Not implemented: logStartupInfo");
}
