// src/workspace/listing.ts — stub for TASK-20
// Replace with real implementation during build loop.

import type { ListProjectsFilter, ProjectSummary } from "../types/workspace.js";

export interface ListProjectsResult {
  projects: ProjectSummary[];
  groupedByRoot: Record<string, ProjectSummary[]>;
  appliedFilters: ListProjectsFilter;
  warnings: string[];
}

export async function listProjects(
  _workspaceRoots: string[],
  _filter?: ListProjectsFilter,
): Promise<ListProjectsResult> {
  throw new Error("Not implemented: listProjects");
}

export function filterProjects(
  _projects: ProjectSummary[],
  _filter: ListProjectsFilter,
): ProjectSummary[] {
  throw new Error("Not implemented: filterProjects");
}

export function detectNestedRoots(_roots: string[]): Map<string, string> {
  throw new Error("Not implemented: detectNestedRoots");
}
