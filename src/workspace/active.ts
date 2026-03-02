// src/workspace/active.ts — stub for TASK-21
// Replace with real implementation during build loop.

import type { ActiveProjectInfo } from "../types/workspace.js";

export interface ActiveProjectState {
  projectPath: string | null;
  scopePath: string | null;
}

export function getActiveProject(): ActiveProjectState {
  throw new Error("Not implemented: getActiveProject");
}

export function setActiveProject(
  _projectPath: string,
  _scopePath?: string,
): void {
  throw new Error("Not implemented: setActiveProject");
}

export function clearActiveProject(): void {
  throw new Error("Not implemented: clearActiveProject");
}

export async function requireActiveProject(): Promise<ActiveProjectInfo> {
  throw new Error("Not implemented: requireActiveProject");
}

export async function setActiveProjectByName(
  _nameOrPath: string,
  _workspaceRoots: string[],
): Promise<ActiveProjectInfo> {
  throw new Error("Not implemented: setActiveProjectByName");
}
