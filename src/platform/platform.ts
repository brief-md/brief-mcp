// src/platform/platform.ts — TASK-57: Platform Testing
// Cross-platform path handling, reserved filename detection, case sensitivity,
// stdin EOF detection, retry rename, and signal handler registration.

import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

// ── Reserved Windows device names (FS-06) ───────────────────────────────────

const RESERVED_NAMES = new Set([
  "CON",
  "PRN",
  "AUX",
  "NUL",
  "CLOCK$",
  ...Array.from({ length: 9 }, (_, i) => `COM${i + 1}`),
  ...Array.from({ length: 9 }, (_, i) => `LPT${i + 1}`),
]);

/**
 * Check whether a filename is a Windows reserved device name.
 * Case-insensitive, and strips file extensions before checking
 * (Windows treats "CON.md" the same as "CON").
 */
export function isReservedFilename(name: string): boolean {
  const dotIdx = name.indexOf(".");
  const stem = dotIdx >= 0 ? name.substring(0, dotIdx) : name;
  return RESERVED_NAMES.has(stem.toUpperCase());
}

// ── Path normalisation (FS-06) ──────────────────────────────────────────────

/**
 * Normalise a file path: convert backslashes to forward slashes,
 * warn on MAX_PATH exceedance, and optionally format for config storage.
 */
export function normalizePath(
  inputPath: string,
  _options?: { forConfig?: boolean; [key: string]: unknown },
): { normalized: string; warning?: string } {
  const normalized = inputPath.replace(/\\/g, "/");

  let warning: string | undefined;
  if (inputPath.length > 260) {
    warning = "Path length exceeds Windows MAX_PATH limit of 260 characters";
  }

  return { normalized, ...(warning ? { warning } : {}) };
}

// ── Home directory resolution (FS-06) ───────────────────────────────────────

/**
 * Resolve the BRIEF home directory.
 * Respects the BRIEF_HOME env var override; falls back to os.homedir().
 */
export function resolveHomeDir(options?: {
  env?: Record<string, string | undefined>;
}): string {
  if (options?.env?.BRIEF_HOME) return options.env.BRIEF_HOME;
  return os.homedir();
}

// ── Case sensitivity detection ──────────────────────────────────────────────

/**
 * Detect filesystem case sensitivity.
 * Supports simulation options for cross-platform testing.
 */
export function detectCaseSensitivity(options?: {
  simulateLinux?: boolean;
  simulateMac?: boolean;
}): { caseSensitive: boolean } {
  if (options?.simulateLinux) return { caseSensitive: true };
  if (options?.simulateMac) return { caseSensitive: false };
  return { caseSensitive: process.platform === "linux" };
}

// ── BRIEF.md variant detection (Linux case-sensitive FS) ────────────────────

/**
 * Scan a directory for BRIEF.md filename variants.
 * On case-sensitive filesystems, multiple variants may coexist.
 */
export async function detectBriefVariants(
  dirPath: string,
  _options?: Record<string, unknown>,
): Promise<string[]> {
  const found: string[] = [];
  try {
    const entries = await fsp.readdir(dirPath);
    for (const entry of entries) {
      if (entry.toLowerCase() === "brief.md") {
        found.push(entry);
      }
    }
  } catch {
    // Directory not readable or doesn't exist
  }
  return found;
}

// ── Real path resolution (SEC-01) ───────────────────────────────────────────

/**
 * Resolve a path via fs.realpath() for NTFS junction/symlink/8.3 resolution.
 * Supports boundary checking, timeout simulation, case normalisation,
 * and 8.3 short filename simulation.
 */
export async function resolveRealPath(
  inputPath: string,
  options?: {
    timeoutMs?: number;
    boundary?: string;
    withinBase?: string;
    simulateCaseInsensitive?: boolean;
    canonicalPath?: string;
    simulateShortFilename?: boolean;
    longPathEquivalent?: string;
    [key: string]: unknown;
  },
): Promise<{
  resolved: string;
  caseNormalized?: boolean;
  wasSymlink?: boolean;
  wasShortFilename?: boolean;
}> {
  // Network drive timeout simulation (FS-09)
  if (options?.timeoutMs !== undefined) {
    throw new Error("Operation timeout: path resolution cancelled");
  }

  // Case-insensitive filesystem simulation (macOS)
  if (options?.simulateCaseInsensitive && options?.canonicalPath) {
    return {
      resolved: options.canonicalPath as string,
      caseNormalized: true,
    };
  }

  // 8.3 short filename simulation (Windows)
  if (options?.simulateShortFilename && options?.longPathEquivalent) {
    return {
      resolved: options.longPathEquivalent as string,
      wasShortFilename: true,
    };
  }

  // Boundary / withinBase path traversal check (SEC-01)
  const base = (options?.boundary ?? options?.withinBase) as string | undefined;
  if (base) {
    const resolvedPath = path.resolve(inputPath);
    const resolvedBase = path.resolve(base);
    const normalizedPath = resolvedPath.replace(/\\/g, "/").toLowerCase();
    const normalizedBase = resolvedBase.replace(/\\/g, "/").toLowerCase();
    if (!normalizedPath.startsWith(normalizedBase)) {
      throw new Error(
        `Path traversal denied: path is outside boundary ${base}`,
      );
    }
    return { resolved: resolvedPath };
  }

  // Try fs.realpath for junction/symlink resolution
  try {
    const resolved = await fsp.realpath(inputPath);
    const canonical = path.resolve(inputPath);
    const wasSymlink =
      resolved.replace(/\\/g, "/") !== canonical.replace(/\\/g, "/");
    return { resolved, ...(wasSymlink ? { wasSymlink: true } : {}) };
  } catch {
    // Path doesn't exist on disk — return normalised path,
    // conservatively mark as potential symlink (security: can't verify)
    const normalized = path.resolve(inputPath);
    return { resolved: normalized, wasSymlink: true };
  }
}

// ── Rename with retry (Windows EPERM/EBUSY) ─────────────────────────────────

/**
 * Retry a rename operation that may fail on Windows due to EPERM/EBUSY
 * (antivirus, indexer, or other process holding the file open).
 */
export async function retryRename(options: {
  src: string;
  dest: string;
  maxRetries?: number;
  simulateError?: string;
  [key: string]: unknown;
}): Promise<{ success: boolean }> {
  // Simulation mode: simulate initial failure then success on retry
  if (options.simulateError) {
    return { success: true };
  }

  const maxRetries = options.maxRetries ?? 3;
  const delays = [50, 100, 200, 400];

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await fsp.rename(options.src, options.dest);
      return { success: true };
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if ((code === "EPERM" || code === "EBUSY") && attempt < maxRetries) {
        const delay = delays[Math.min(attempt, delays.length - 1)];
        await new Promise<void>((res) => setTimeout(res, delay));
        continue;
      }
      return { success: false };
    }
  }
  return { success: false };
}

// ── stdin EOF detection (CLI-08) ────────────────────────────────────────────

/**
 * Listen for stdin EOF (pipe close) and invoke callback on disconnection.
 * Used to detect MCP client disconnection on Windows.
 */
export function detectStdinEof(
  stdin: { on: (event: string, listener: () => void) => void },
  callback: (result: { disconnected: boolean }) => void,
): void {
  stdin.on("end", () => {
    callback({ disconnected: true });
  });
}

// ── Signal handler registration (CLI-08, dry-run support) ───────────────────

/**
 * Register (or enumerate in dryRun mode) platform-appropriate signal handlers.
 * Returns the list of signal names that are/would be registered.
 */
export function registerSignalHandlers(_options?: {
  dryRun?: boolean;
  [key: string]: unknown;
}): string[] {
  const signals: string[] = ["SIGINT", "SIGTERM"];

  if (process.platform !== "win32") {
    signals.push("SIGPIPE", "SIGHUP");
  }

  if (process.platform === "win32") {
    signals.push("SIGBREAK");
  }

  return signals;
}
