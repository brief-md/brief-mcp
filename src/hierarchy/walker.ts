// src/hierarchy/walker.ts — TASK-17: upward traversal engine

import fs from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Check if a filename matches the BRIEF.md pattern (case-insensitive).
 * Only filenames whose lowercased form equals "brief.md" are recognized.
 * HIER-11: project-brief.md, README.md, etc. are never considered.
 */
export function isBriefFile(fileName: string): boolean {
  return fileName.toLowerCase() === "brief.md";
}

/**
 * Resolve a path to its real (canonical) path, falling back to path.resolve
 * on permission or ENOENT errors. Required for Windows short-form vs long-form
 * path comparisons (e.g., ADMINI~1 vs Administrator).
 */
async function safeRealpath(p: string): Promise<string> {
  try {
    return await fs.promises.realpath(p);
  } catch {
    return path.resolve(p);
  }
}

/**
 * Scan a directory for BRIEF.md variants.
 * - Returns null if no match.
 * - Returns the full path if exactly one match.
 * - Throws (HIER-12) if multiple case-variant matches are found.
 */
async function findBriefInDir(dirPath: string): Promise<string | null> {
  let entries: string[];
  try {
    entries = await fs.promises.readdir(dirPath);
  } catch {
    return null;
  }

  const matches = entries.filter(isBriefFile);

  if (matches.length === 0) {
    return null;
  }

  if (matches.length === 1) {
    return path.join(dirPath, matches[0]);
  }

  // HIER-12: Multiple case-variant matches — hard error
  const matchPaths = matches.map((m) => path.join(dirPath, m));
  throw new Error(
    `HIER-12: Multiple BRIEF.md variants found in "${dirPath}": ${matchPaths.join(", ")}`,
  );
}

/**
 * Check whether a directory immediately contains a named entry.
 */
async function directoryContains(
  dirPath: string,
  name: string,
): Promise<boolean> {
  try {
    const entries = await fs.promises.readdir(dirPath);
    return entries.includes(name);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Primary export
// ---------------------------------------------------------------------------

/**
 * Walk upward from startDir, collecting BRIEF.md paths in bottom-to-top order.
 *
 * Stop conditions (evaluated in priority order at each level):
 *   (a) Configured workspace root:
 *       - depth=0 (startDir IS root): include its BRIEF.md, then stop.
 *       - depth>0: stop WITHOUT including.
 *   (b) Depth limit reached (default 10): stop.
 *   (c) Directory contains a .git folder: stop WITHOUT including.
 *   (d) Filesystem root: stop.
 *
 * Cycle detection: resolves each directory to its real path and maintains
 * a visited set. If a directory is seen twice, logs a warning and stops
 * (no error). simulateCycle triggers this path for testing.
 */
export async function walkUpward(
  startDir: string,
  options?: {
    workspaceRoots?: string[];
    simulateCycle?: boolean;
    depthLimit?: number;
  },
): Promise<string[] & { cycleDetected?: boolean }> {
  const workspaceRoots = options?.workspaceRoots ?? [];
  const depthLimit = options?.depthLimit ?? 10;
  const simulateCycle = options?.simulateCycle ?? false;

  // Resolve workspace roots via realpath to normalize Windows short-form paths
  const realWorkspaceRoots = await Promise.all(
    workspaceRoots.map(safeRealpath),
  );

  // Resolve startDir to its canonical real path
  let currentDir = await safeRealpath(startDir);

  const visited = new Set<string>();
  const result: string[] = [];
  let depth = 0;
  let cycleDetected = false;

  while (true) {
    // Cycle detection via visited set (real-path-normalized)
    if (visited.has(currentDir)) {
      process.stderr.write(
        `[WARN] hierarchy walker: circular symlink detected at "${currentDir}"\n`,
      );
      cycleDetected = true;
      break;
    }

    // simulateCycle: artificially trigger cycle detection on second iteration
    if (simulateCycle && depth > 0) {
      process.stderr.write(
        `[WARN] hierarchy walker: circular symlink detected (simulated) at "${currentDir}"\n`,
      );
      cycleDetected = true;
      break;
    }

    visited.add(currentDir);

    // (a) Workspace root check — highest priority stop condition
    if (realWorkspaceRoots.includes(currentDir)) {
      if (depth === 0) {
        // startDir IS the workspace root: include its BRIEF.md, then stop
        const briefPath = await findBriefInDir(currentDir);
        if (briefPath !== null) {
          result.push(briefPath);
        }
      }
      // depth > 0: reached workspace root during traversal — stop WITHOUT including
      break;
    }

    // (b) Depth limit check
    if (depth >= depthLimit) {
      break;
    }

    // (c) .git directory presence — stop WITHOUT including BRIEF.md
    const hasGit = await directoryContains(currentDir, ".git");
    if (hasGit) {
      break;
    }

    // (d) Filesystem root check (dirname of root equals itself)
    const parentDir = path.dirname(currentDir);
    const isFilesystemRoot = parentDir === currentDir;
    if (isFilesystemRoot) {
      break;
    }

    // Find BRIEF.md in current directory (throws on HIER-12 conflict)
    const briefPath = await findBriefInDir(currentDir);
    if (briefPath !== null) {
      result.push(briefPath);
    }

    // Traverse upward — resolve symlinks in parent path
    currentDir = await safeRealpath(parentDir);
    depth++;
  }

  const output = result as string[] & { cycleDetected?: boolean };
  if (cycleDetected) {
    output.cycleDetected = true;
  }
  return output;
}

// ---------------------------------------------------------------------------
// Deprecated shims (kept for backward compatibility)
// ---------------------------------------------------------------------------

export interface WalkerConfig {
  workspaceRoots: string[];
  depthLimit?: number;
}

/**
 * @deprecated Use walkUpward with options object instead.
 * Returns all BRIEF.md-matching file paths in a single directory.
 */
export async function detectBriefMdFiles(dirPath: string): Promise<string[]> {
  let entries: string[];
  try {
    entries = await fs.promises.readdir(dirPath);
  } catch {
    return [];
  }
  return entries.filter(isBriefFile).map((f) => path.join(dirPath, f));
}

/**
 * @deprecated Use walkUpward with options object instead.
 */
export function evaluateStopConditions(
  _dirPath: string,
  _config: WalkerConfig,
  _depth: number,
): boolean {
  return false;
}
