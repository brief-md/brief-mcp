// src/hierarchy/walker.ts — stub for TASK-17
// Replace with real implementation during build loop.

import type { HierarchyLevel } from "../types/hierarchy.js";

export interface WalkerConfig {
  workspaceRoots: string[];
  depthLimit?: number;
}

export async function walkUpward(
  _startDir: string,
  _config: WalkerConfig,
): Promise<HierarchyLevel[]> {
  throw new Error("Not implemented: walkUpward");
}

export async function detectBriefMdFiles(_dirPath: string): Promise<string[]> {
  throw new Error("Not implemented: detectBriefMdFiles");
}

export function evaluateStopConditions(
  _dirPath: string,
  _config: WalkerConfig,
  _depth: number,
): boolean {
  throw new Error("Not implemented: evaluateStopConditions");
}
