// src/server/startup-recovery.ts — TASK-50: Startup recovery

import type { Logger } from "../observability/logger.js";
import type { ServerStartupInfo } from "../types/server.js";
import {
  cleanupOrphanedTempFiles,
  detectMultiInstance,
  verifyGenericGuide,
} from "./signal-handling.js";

// ---------------------------------------------------------------------------
// runStartupRecovery — orchestrates all startup recovery tasks
// ---------------------------------------------------------------------------

export async function runStartupRecovery(logger: Logger): Promise<void> {
  const start = Date.now();

  // 1. Clean orphaned temp files from previous crash
  const cleanupResult = await cleanOrphanedTempFiles(logger);
  if (cleanupResult > 0) {
    logger.info("Cleaned orphaned temp files", { count: cleanupResult });
  }

  // 2. Verify generic guide integrity
  const guideResult = await verifyGenericGuide();
  if (guideResult.regenerated) {
    logger.warn("Generic guide was missing or corrupt, regenerated");
  }

  // 3. Check for multiple instances
  const multiInstance = await checkForMultipleInstances(logger);
  if (multiInstance) {
    logger.warn("Another brief-mcp instance may be running");
  }

  const duration = Date.now() - start;
  logger.info("Startup recovery completed", { durationMs: duration });
}

// ---------------------------------------------------------------------------
// cleanOrphanedTempFiles — scan and clean *.brief-tmp.* older than 60s
// ---------------------------------------------------------------------------

export async function cleanOrphanedTempFiles(logger: Logger): Promise<number> {
  const result = await cleanupOrphanedTempFiles();
  if (result.cleanedCount > 0) {
    logger.info("Orphaned temp files cleaned", {
      count: result.cleanedCount,
    });
  }
  return result.cleanedCount;
}

// ---------------------------------------------------------------------------
// checkForMultipleInstances — detect .brief-lock files
// ---------------------------------------------------------------------------

export async function checkForMultipleInstances(
  logger: Logger,
): Promise<boolean> {
  const result = detectMultiInstance();
  if (result.warning) {
    logger.warn(result.warning);
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// logStartupInfo — log version, transport, roots, counts, duration
// ---------------------------------------------------------------------------

export async function logStartupInfo(
  logger: Logger,
  info: ServerStartupInfo,
): Promise<void> {
  logger.info("Server started", {
    version: info.version,
    transport: info.transport,
    workspaceRoots: info.workspaceRoots,
    loadedPacks: info.loadedPacksCount,
    loadedGuides: info.loadedGuidesCount,
    startupDurationMs: info.startupDurationMs,
    isFirstRun: info.isFirstRun ?? false,
  });
}
