// src/hierarchy/walker.ts — TASK-17

import { access, readdir, realpath } from "node:fs/promises";
import { dirname, join } from "node:path";

// ---------------------------------------------------------------------------
// Primary exports (match test expectations)
// ---------------------------------------------------------------------------

export async function walkUpward(
  startPath: string,
  options?: {
    workspaceRoots?: string[];
    simulateCycle?: boolean;
    depthLimit?: number;
  },
): Promise<string[] & { cycleDetected?: boolean }> {
  const workspaceRoots = options?.workspaceRoots ?? [];
  const depthLimit = options?.depthLimit ?? 10;
  const simulateCycle = options?.simulateCycle ?? false;

  const result: string[] & { cycleDetected?: boolean } = [];
  const visited = new Set<string>();

  let depth = 0;
  let currentDir = startPath;

  // Attempt to resolve startPath to its realpath upfront; fall back to the
  // original value if the path does not exist yet.
  try {
    currentDir = await realpath(startPath);
  } catch {
    // keep original value
  }

  // eslint-disable-next-line no-constant-condition
  while (true) {
    // depth limit check
    if (depth >= depthLimit) {
      break;
    }

    // Resolve current directory to its realpath to handle symlinks.
    let realCurrentDir = currentDir;
    try {
      realCurrentDir = await realpath(currentDir);
    } catch {
      // keep currentDir value
    }

    // simulateCycle handling — collect if BRIEF.md exists then flag and return.
    if (simulateCycle) {
      const briefPath = join(realCurrentDir, "BRIEF.md");
      try {
        await access(briefPath);
        result.push(briefPath);
      } catch {
        // no BRIEF.md here — still stop
      }
      result.cycleDetected = true;
      return result;
    }

    // Cycle detection via visited set.
    if (visited.has(realCurrentDir)) {
      result.cycleDetected = true;
      break;
    }
    visited.add(realCurrentDir);

    // .git stop check (BEFORE collecting).
    const gitPath = join(realCurrentDir, ".git");
    let hasGit = false;
    try {
      await access(gitPath);
      hasGit = true;
    } catch {
      // no .git
    }
    if (hasGit) {
      break;
    }

    // Workspace root stop check (BEFORE collecting, but only after the first
    // iteration so that startPath === workspaceRoot still collects).
    if (depth > 0 && workspaceRoots.includes(realCurrentDir)) {
      break;
    }

    // Collect BRIEF.md files at realCurrentDir.
    let entries: string[] = [];
    try {
      const dirents = await readdir(realCurrentDir);
      entries = dirents.filter((f) => f.toLowerCase() === "brief.md");
    } catch {
      // unreadable directory — stop
      break;
    }

    if (entries.length > 1 && process.platform !== "win32") {
      throw new Error(
        `Multiple BRIEF.md variants found: ${entries.map((f) => join(realCurrentDir, f)).join(", ")}`,
      );
    }

    if (entries.length >= 1) {
      result.push(join(realCurrentDir, entries[0]));
    }

    // Stop AFTER collecting if this is a workspace root (handles the
    // startPath === workspaceRoot case where depth === 0).
    if (workspaceRoots.includes(realCurrentDir)) {
      break;
    }

    // Move to parent directory.
    const parent = dirname(realCurrentDir);
    if (parent === realCurrentDir) {
      // Reached filesystem root.
      break;
    }

    currentDir = parent;
    depth++;
  }

  return result;
}

export function isBriefFile(fileName: string): boolean {
  return fileName.toLowerCase() === "brief.md";
}

// ---------------------------------------------------------------------------
// Deprecated shims (kept for backward compatibility)
// ---------------------------------------------------------------------------

export interface WalkerConfig {
  workspaceRoots: string[];
  depthLimit?: number;
}

/** @deprecated Use walkUpward with options object instead */
export async function detectBriefMdFiles(dirPath: string): Promise<string[]> {
  const results = await walkUpward(dirPath, {});
  // Return the directory portion of each collected path.
  return results.map((p) => dirname(p));
}

/** @deprecated Use walkUpward with options object instead */
export function evaluateStopConditions(
  _dirPath: string,
  config: WalkerConfig,
  depth: number,
): boolean {
  return depth >= (config.depthLimit ?? 10);
}
