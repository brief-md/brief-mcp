// src/security/path-validation.ts

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createLogger } from "../observability/index.js";
import type {
  SecurityErrorType,
  SecurityLimitCheck,
} from "../types/security.js";

const logger = createLogger({ module: "security" });

// Security limits (SEC-17)
const MAX_FILE_SIZE = 10_485_760; // 10 MB
const MAX_SECTION_COUNT = 500;
const MAX_CHAIN_DEPTH = 100;

// Windows reserved filenames (case-insensitive)
const WINDOWS_RESERVED_RE = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;

// Internal error class — carries a type property for test assertions
class SecurityError extends Error {
  readonly type: SecurityErrorType;

  constructor(type: SecurityErrorType, message: string) {
    super(message);
    this.name = "SecurityError";
    this.type = type;
  }
}

function throwSecurityError(type: SecurityErrorType, message: string): never {
  throw new SecurityError(type, message);
}

// ---------------------------------------------------------------------------
// Path normalization helpers
// ---------------------------------------------------------------------------

/** Return the path with all separators replaced by forward slashes (storage). */
export function toStoragePath(p: string): string {
  return p.replaceAll("\\", "/");
}

/** Return the path using the current platform's native separator. */
export function toNativePath(p: string): string {
  return p.replaceAll("/", path.sep);
}

// ---------------------------------------------------------------------------
// Path validation (SEC-01)
// ---------------------------------------------------------------------------

/**
 * Resolve `inputPath` to its canonical absolute form via `fs.realpath()`,
 * then verify it is contained within one of `allowedRoots` or `~/.brief/`.
 * Throws `SecurityError("security_error", …)` if the path escapes all roots.
 */
export async function validatePath(
  inputPath: string,
  allowedRoots: string[],
): Promise<string> {
  const absPath = path.resolve(inputPath);

  let resolvedPath: string;

  if (fs.existsSync(absPath)) {
    // Path exists — resolve symlinks / NTFS junctions / 8.3 names in full
    resolvedPath = await fs.promises.realpath(absPath);
  } else {
    // Non-existent write target — realpath the parent, then append filename
    const parentDir = path.dirname(absPath);
    const fileName = path.basename(absPath);

    if (fs.existsSync(parentDir)) {
      const realParent = await fs.promises.realpath(parentDir);
      resolvedPath = path.join(realParent, fileName);
    } else {
      // Parent also missing — use the raw resolved path for boundary check
      resolvedPath = absPath;
    }
  }

  const normalized = path.normalize(resolvedPath);

  logger.debug(`validatePath: "${inputPath}" → "${normalized}"`);

  // Always allow paths inside ~/.brief/
  const briefHome = path.normalize(path.join(os.homedir(), ".brief"));
  if (normalized === briefHome || normalized.startsWith(briefHome + path.sep)) {
    return normalized;
  }

  // Check each allowed workspace root
  for (const root of allowedRoots) {
    const normalizedRoot = path.normalize(path.resolve(root));
    if (
      normalized === normalizedRoot ||
      normalized.startsWith(normalizedRoot + path.sep)
    ) {
      return normalized;
    }
  }

  throwSecurityError(
    "security_error",
    `Security violation: path "${inputPath}" (resolved: "${normalized}") is outside all allowed workspace roots`,
  );
}

// ---------------------------------------------------------------------------
// Resource limits (SEC-17)
// ---------------------------------------------------------------------------

/**
 * Check resource limits.  Throws `SecurityError("security_limit_exceeded", …)`
 * if any supplied value exceeds its cap.
 */
export function checkSecurityLimits(options: SecurityLimitCheck): void {
  const { fileSize, sectionCount, chainDepth } = options;

  if (fileSize !== undefined && fileSize > MAX_FILE_SIZE) {
    throwSecurityError(
      "security_limit_exceeded",
      `fileSize ${fileSize} exceeds limit of ${MAX_FILE_SIZE}`,
    );
  }

  if (sectionCount !== undefined && sectionCount > MAX_SECTION_COUNT) {
    throwSecurityError(
      "security_limit_exceeded",
      `sectionCount ${sectionCount} exceeds limit of ${MAX_SECTION_COUNT}`,
    );
  }

  if (chainDepth !== undefined && chainDepth > MAX_CHAIN_DEPTH) {
    throwSecurityError(
      "security_limit_exceeded",
      `chainDepth ${chainDepth} exceeds limit of ${MAX_CHAIN_DEPTH}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Slug generation
// ---------------------------------------------------------------------------

/**
 * Convert an arbitrary project name to a lowercase-hyphenated filesystem slug.
 * - NFKD normalise + strip combining marks
 * - Replace whitespace / underscores with hyphens
 * - Remove all remaining non-alphanumeric/hyphen characters
 * - Collapse consecutive hyphens, trim edges
 * - Append "-project" to Windows reserved names
 * - Return "unnamed-project" for empty results
 */
export function slugify(name: string): string {
  let slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!slug) {
    return "unnamed-project";
  }

  if (WINDOWS_RESERVED_RE.test(slug)) {
    slug = `${slug}-project`;
  }

  return slug;
}

// ---------------------------------------------------------------------------
// Filesystem permissions (SEC-05)
// ---------------------------------------------------------------------------

/**
 * Set restrictive file system permissions on Unix.
 * Files → 0o600, directories → 0o700.  Windows: no-op.
 */
export async function setFilePermissions(
  filePath: string,
  type: "file" | "dir",
): Promise<void> {
  if (os.platform() === "win32") {
    return;
  }
  const mode = type === "dir" ? 0o700 : 0o600;
  await fs.promises.chmod(filePath, mode);
}

// ---------------------------------------------------------------------------
// File-descriptor semaphore
// ---------------------------------------------------------------------------

/**
 * Create an async semaphore that caps concurrent file-descriptor usage.
 * `acquire()` resolves with a release function.  Callers MUST call release
 * when done.
 */
export function createFdSemaphore(capacity: number): {
  acquire: () => Promise<() => void>;
} {
  let held = 0;
  const waiters: Array<() => void> = [];

  return {
    acquire(): Promise<() => void> {
      return new Promise<() => void>((resolve) => {
        const tryAcquire = (): void => {
          if (held < capacity) {
            held++;
            resolve((): void => {
              held--;
              const next = waiters.shift();
              if (next !== undefined) next();
            });
          } else {
            waiters.push(tryAcquire);
          }
        };
        tryAcquire();
      });
    },
  };
}

// ---------------------------------------------------------------------------
// EMFILE retry helper
// ---------------------------------------------------------------------------

/**
 * Run `fn`, retrying on EMFILE errors up to `options.maxRetries` times,
 * waiting `options.delay` ms between attempts.
 */
export async function withEmfileRetry<T>(
  fn: () => Promise<T>,
  options: { maxRetries: number; delay: number },
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const nodeErr = err as NodeJS.ErrnoException;
      if (nodeErr.code === "EMFILE" && attempt < options.maxRetries) {
        lastError = err;
        await new Promise<void>((resolve) =>
          setTimeout(resolve, options.delay),
        );
      } else {
        throw err;
      }
    }
  }

  // Should not be reachable — TypeScript needs the explicit throw
  throw lastError;
}
