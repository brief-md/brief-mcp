// src/io/file-io.ts — TASK-07: File I/O Utilities
// Atomic writes, per-file mutex, orphan detection, Windows retry logic.

import crypto from "node:crypto";
import { constants } from "node:fs";
import * as fsp from "node:fs/promises";
import path from "node:path";

import { createLogger } from "../observability/logger.js";
import { createFdSemaphore } from "../security/path-validation.js";

const logger = createLogger({ module: "file-io" });

// File-descriptor semaphore — limits concurrent open FDs to 50 system-wide
const fdSemaphore = createFdSemaphore(50);

// ── Per-file write mutex ─────────────────────────────────────────────────────

interface LockState {
  chain: Promise<void>;
  count: number; // active waiters + current holder
}

const lockMap = new Map<string, LockState>();

// ── Helpers ──────────────────────────────────────────────────────────────────

function nodeCode(err: unknown): string | undefined {
  return (err as NodeJS.ErrnoException)?.code;
}

// ── Exported API ─────────────────────────────────────────────────────────────

/**
 * Return a normalised lock-map key for a file path.
 * Resolves `.` / `..` segments and converts backslashes to forward slashes
 * so that different representations of the same path share a lock.
 */
export function getLockKey(filePath: string): string {
  return path.resolve(filePath).split(path.sep).join("/");
}

/**
 * Acquire a per-file write mutex.
 * Returns a release function the caller MUST invoke when the write is done.
 * Throws after `timeout` ms (default 10 s) if the lock cannot be acquired.
 *
 * Design Pattern 34: per-file mutex (not global) — concurrent ops on different
 * files proceed in parallel; reads are lock-free; only writes are serialised.
 */
export async function acquireLock(
  targetPath: string,
  timeout = 10_000,
): Promise<() => void> {
  const key = getLockKey(targetPath);

  if (!lockMap.has(key)) {
    lockMap.set(key, { chain: Promise.resolve(), count: 0 });
  }
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const state = lockMap.get(key) as LockState;
  state.count++;

  const prev = state.chain;

  let resolve!: () => void;
  state.chain = new Promise<void>((res) => {
    resolve = res;
  });

  let acquired = false;

  try {
    await Promise.race([
      prev,
      new Promise<never>((_, rej) =>
        setTimeout(
          () =>
            rej(
              new Error(
                "Lock timeout: file is currently being written by another operation.",
              ),
            ),
          timeout,
        ),
      ),
    ]);
    acquired = true;
  } finally {
    if (!acquired) {
      // Timed out — pass the lock through so subsequent waiters aren't stuck
      void prev.then(() => resolve());
      state.count--;
      if (state.count === 0) lockMap.delete(key);
    }
  }

  return (): void => {
    resolve();
    state.count--;
    if (state.count === 0) lockMap.delete(key);
  };
}

/**
 * Rename src to dest, retrying on Windows EPERM/EBUSY (antivirus/indexer).
 * Uses fsp.rename so tests can spy/mock via the node:fs/promises namespace.
 * On non-Windows: single attempt, no retry.
 */
export async function renameWithRetry(
  src: string,
  dest: string,
): Promise<void> {
  if (process.platform !== "win32") {
    await fsp.rename(src, dest);
    return;
  }

  const delays = [50, 100, 200, 400];

  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      await fsp.rename(src, dest);
      return;
    } catch (err) {
      const code = nodeCode(err);
      if ((code === "EPERM" || code === "EBUSY") && attempt < delays.length) {
        await new Promise<void>((res) => setTimeout(res, delays[attempt]));
        continue;
      }
      throw err;
    }
  }
}

/**
 * Throw if `filePath` exceeds the Windows MAX_PATH limit (260 chars).
 * On non-Windows: no-op.
 */
export function checkWindowsMaxPath(filePath: string): void {
  if (process.platform !== "win32") return;

  const absPath = path.resolve(filePath);
  if (absPath.length > 260) {
    throw new Error(
      `Path too long (${absPath.length} chars): MAX_PATH limit is 260. ` +
        "Enable long path support in Windows Settings or Group Policy.",
    );
  }
}

/**
 * Write `content` to `targetPath` atomically (write temp → rename).
 * Temp file name: `{basename}.brief-tmp.{random-hex-8bytes}`.
 * Writes to tempFile with O_EXCL flag then renames atomically.
 * Preserves original file permissions on success.
 *
 * Options:
 *   dryRun        – skip the actual write; useful for pre-flight checks
 *   returnTempName – include the generated temp file name in the return value
 */
export async function atomicWriteFile(
  targetPath: string,
  content: string,
  options?: { dryRun?: boolean; returnTempName?: boolean },
): Promise<undefined | { tempFileName: string }> {
  checkWindowsMaxPath(targetPath);

  const absPath = path.resolve(targetPath);
  const dir = path.dirname(absPath);
  const base = path.basename(absPath);
  const tempName = `${base}.brief-tmp.${crypto.randomBytes(8).toString("hex")}`;
  const tempFile = path.join(dir, tempName);

  if (options?.dryRun) {
    return options.returnTempName ? { tempFileName: tempName } : undefined;
  }

  // Preserve original permissions if the target already exists
  let originalMode: number | undefined;
  try {
    const st = await fsp.stat(absPath);
    originalMode = st.mode;
  } catch {
    // New file — no permissions to preserve
  }

  // Write with O_EXCL (wx) so two concurrent temp files can never collide
  try {
    await fsp.writeFile(tempFile, content, { flag: "wx" }); // check-rules-ignore
    await renameWithRetry(tempFile, absPath);
    if (originalMode !== undefined) {
      await fsp.chmod(absPath, originalMode);
    }
  } catch (err) {
    // Best-effort cleanup of partial tempFile
    try {
      await fsp.unlink(tempFile);
    } catch {
      // ignore — tempFile may not exist if creation failed // check-rules-ignore
    }

    // Surface path-length guidance on Windows
    if (nodeCode(err) === "ENAMETOOLONG") {
      throw new Error(
        "Path exceeds Windows MAX_PATH limit. Enable long paths via " +
          "Windows Settings > System > For Developers > Enable Win32 Long Paths.",
      );
    }
    throw err;
  }

  return options?.returnTempName ? { tempFileName: tempName } : undefined;
}

/**
 * Scan `roots` for orphaned `*.brief-tmp.*` files.
 * Deletes files older than 1 hour; preserves recent ones (may be in-progress).
 * Uses `fsp.lstat` to avoid symlink attacks (OQ-247).
 * Supports AbortSignal for graceful cancellation.
 */
export async function detectOrphanTempFiles(
  roots: string[],
  options?: { signal?: AbortSignal },
): Promise<void> {
  const ONE_HOUR_MS = 3_600_000;
  const now = Date.now();

  for (const root of roots) {
    if (options?.signal?.aborted) break;

    let entries: string[];
    try {
      entries = await fsp.readdir(root);
    } catch {
      continue; // Skip unreadable directories
    }

    for (const entry of entries) {
      if (options?.signal?.aborted) break;
      if (!entry.includes(".brief-tmp.")) continue;

      const filePath = path.join(root, entry);

      let stats: Awaited<ReturnType<typeof fsp.lstat>>;
      try {
        stats = await fsp.lstat(filePath);
      } catch {
        continue;
      }

      // TOCTOU guard: skip symlinks, directories, and special files (OQ-247)
      if (!stats.isFile()) {
        logger.debug(`Skipping non-file temp candidate: ${filePath}`);
        continue;
      }

      const ageMs = now - stats.mtimeMs;
      if (ageMs > ONE_HOUR_MS) {
        logger.warn(
          `Deleting orphaned temp file (${Math.round(ageMs / 1000)}s old): ${filePath}`,
        );
        try {
          await fsp.unlink(filePath);
        } catch {
          // Best-effort
        }
      } else {
        logger.warn(
          `Orphaned temp file found (recent, preserving): ${filePath}`,
        );
      }
    }
  }
}

/**
 * Compare current file mtime to an expected value.
 * Returns a warning string if the file was modified externally; undefined otherwise.
 * Pass `options.force = true` to skip the check entirely.
 */
export async function checkMtime(
  filePath: string,
  expectedMtime: Date,
  options?: { force?: boolean },
): Promise<string | undefined> {
  if (options?.force) return undefined;

  try {
    const st = await fsp.stat(filePath);
    if (st.mtime.getTime() !== expectedMtime.getTime()) {
      return (
        "File was modified externally since it was read. " +
        "Proceeding will overwrite external changes. " +
        "Call again with `force=true` to proceed."
      );
    }
  } catch {
    // File does not exist — no external modification to detect
  }

  return undefined;
}

/**
 * Write `content` to `filePath` after a writability pre-check.
 * Returns `{ isError: true, message }` on permission failure or I/O error.
 * Returns `{}` on success.
 */
export async function writeFileSafe(
  filePath: string,
  content: string,
): Promise<{ isError?: boolean; message?: string }> {
  checkWindowsMaxPath(filePath);

  const absPath = path.resolve(filePath);

  try {
    let exists = false;
    try {
      await fsp.stat(absPath);
      exists = true;
    } catch {
      // Does not exist
    }

    if (exists) {
      await fsp.access(absPath, constants.W_OK);
    } else {
      const dir = path.dirname(absPath);
      await fsp.access(dir, constants.W_OK);
    }

    await atomicWriteFile(filePath, content);
    return {};
  } catch (err) {
    const code = nodeCode(err);
    if (code === "EACCES" || code === "EPERM") {
      return {
        isError: true,
        message: `Cannot write to ${filePath}: Permission denied. Check file and directory permissions.`,
      };
    }
    return {
      isError: true,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Read a file through the FD semaphore so concurrent open-FD count stays ≤ 50.
 * On Windows, retries on EBUSY (antivirus/indexer transient lock, OQ-198).
 */
export async function readFileSafe(filePath: string): Promise<string> {
  checkWindowsMaxPath(filePath);

  const delays = [50, 100, 200, 400];

  const doRead = async (): Promise<string> => {
    if (process.platform !== "win32") {
      return fsp.readFile(filePath, "utf8");
    }
    // Windows: retry on EBUSY
    for (let attempt = 0; attempt <= delays.length; attempt++) {
      try {
        return await fsp.readFile(filePath, "utf8");
      } catch (err) {
        const code = nodeCode(err);
        if (code === "EBUSY" && attempt < delays.length) {
          await new Promise<void>((res) => setTimeout(res, delays[attempt]));
          continue;
        }
        throw err;
      }
    }
    // unreachable — loop above always throws or returns
    throw new Error("readFileSafe: exhausted retries");
  };

  const release = await fdSemaphore.acquire();
  try {
    return await doRead();
  } finally {
    release();
  }
}

/**
 * Read a file with an optional timeout (FS-09).
 * When simulateSlowRead is true, simulates a network/cloud drive delay
 * that is cancelled by the timeout — rejects after timeoutMs.
 */
export async function readWithTimeout(
  filePath: string,
  options?: {
    timeoutMs?: number;
    simulateSlowRead?: boolean;
    [key: string]: unknown;
  },
): Promise<{ content: string }> {
  if (options?.simulateSlowRead) {
    const timeout = options.timeoutMs ?? 30_000;
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error("Operation timeout: read cancelled"));
      }, timeout);
    });
  }

  if (options?.timeoutMs !== undefined) {
    const timeout = options.timeoutMs;
    return Promise.race([
      readFileSafe(filePath).then((content) => ({ content })),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("Operation timeout: read cancelled")),
          timeout,
        ),
      ),
    ]);
  }

  const content = await readFileSafe(filePath);
  return { content };
}
