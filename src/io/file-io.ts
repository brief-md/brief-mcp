// src/io/file-io.ts — stub for TASK-07
// Replace with real implementation during build loop.

import type {
  AtomicWriteOptions,
  LockHandle,
  MtimeCheckResult,
  OrphanedTempFile,
  WriteResult,
} from "../types/io.js";

export async function atomicWriteFile(
  _targetPath: string,
  _content: string,
  _options?: AtomicWriteOptions,
): Promise<WriteResult> {
  throw new Error("Not implemented: atomicWriteFile");
}

export async function acquireLock(
  _filePath: string,
  _timeout?: number,
): Promise<LockHandle> {
  throw new Error("Not implemented: acquireLock");
}

export async function checkMtime(
  _filePath: string,
  _expectedMtime: number,
  _force?: boolean,
): Promise<MtimeCheckResult> {
  throw new Error("Not implemented: checkMtime");
}

export async function checkWritability(_filePath: string): Promise<void> {
  throw new Error("Not implemented: checkWritability");
}

export async function scanOrphanedTempFiles(
  _roots: string[],
): Promise<OrphanedTempFile[]> {
  throw new Error("Not implemented: scanOrphanedTempFiles");
}

export async function cleanOrphanedTempFiles(
  _orphans: OrphanedTempFile[],
): Promise<number> {
  throw new Error("Not implemented: cleanOrphanedTempFiles");
}

export async function renameWithRetry(
  _sourcePath: string,
  _targetPath: string,
): Promise<void> {
  throw new Error("Not implemented: renameWithRetry");
}
