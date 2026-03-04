// src/hierarchy/walker.ts — stub for TASK-17
// Replace with real implementation during build loop.

// ---------------------------------------------------------------------------
// Primary exports (match test expectations)
// ---------------------------------------------------------------------------

export async function walkUpward(
  _startPath: string,
  _options?: {
    workspaceRoots?: string[];
    simulateCycle?: boolean;
    depthLimit?: number;
  },
): Promise<string[] & { cycleDetected?: boolean }> {
  throw new Error("Not implemented: walkUpward");
}

export function isBriefFile(_fileName: string): boolean {
  throw new Error("Not implemented: isBriefFile");
}

// ---------------------------------------------------------------------------
// Deprecated shims (kept for backward compatibility)
// ---------------------------------------------------------------------------

export interface WalkerConfig {
  workspaceRoots: string[];
  depthLimit?: number;
}

/** @deprecated Use walkUpward with options object instead */
export async function detectBriefMdFiles(_dirPath: string): Promise<string[]> {
  throw new Error("Not implemented: detectBriefMdFiles");
}

/** @deprecated Use walkUpward with options object instead */
export function evaluateStopConditions(
  _dirPath: string,
  _config: WalkerConfig,
  _depth: number,
): boolean {
  throw new Error("Not implemented: evaluateStopConditions");
}
