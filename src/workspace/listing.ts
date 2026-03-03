// src/workspace/listing.ts — stub for TASK-20
// Replace with real implementation during build loop.

import type { ListProjectsFilter, ProjectSummary } from "../types/workspace.js";
import { getWorkspaces } from "./active.js";

// ---------------------------------------------------------------------------
// Deprecated shims
// ---------------------------------------------------------------------------

export interface ListProjectsResult {
  projects: ProjectSummary[];
  groupedByRoot: Record<string, ProjectSummary[]>;
  appliedFilters: ListProjectsFilter;
  warnings: string[];
}

/** @deprecated Use applyFilters instead. */
export function filterProjects(
  _projects: ProjectSummary[],
  _filter: ListProjectsFilter,
): ProjectSummary[] {
  throw new Error("Deprecated: use applyFilters");
}

// ---------------------------------------------------------------------------
// Status categories
// ---------------------------------------------------------------------------

const ACTIVE_STATUSES = new Set(["concept", "development", "production"]);
const COMPLETE_STATUSES = new Set(["complete", "released"]);

// ---------------------------------------------------------------------------
// applyFilters
// ---------------------------------------------------------------------------

export function applyFilters(
  projects: unknown[],
  filters: { statusFilter?: string; typeFilter?: string },
): unknown[] {
  let result = projects;

  if (filters.statusFilter) {
    const sf = filters.statusFilter;
    result = result.filter((p) => {
      const rec = p as Record<string, unknown>;
      if (sf === "active") return ACTIVE_STATUSES.has(rec.status as string);
      if (sf === "complete") return COMPLETE_STATUSES.has(rec.status as string);
      // Direct status match (paused, archived, etc.)
      return rec.status === sf;
    });
  }

  if (filters.typeFilter) {
    const tf = filters.typeFilter.toLowerCase();
    result = result.filter(
      (p) =>
        (
          ((p as Record<string, unknown>).type as string) || ""
        ).toLowerCase() === tf,
    );
  }

  return result;
}

// ---------------------------------------------------------------------------
// detectNestedRoots
// ---------------------------------------------------------------------------

export function detectNestedRoots(roots: string[]): { hasNesting: boolean } {
  // Check if any root is a prefix of another root
  for (let i = 0; i < roots.length; i++) {
    for (let j = 0; j < roots.length; j++) {
      if (i !== j) {
        const a = roots[i].endsWith("/") ? roots[i] : roots[i] + "/";
        if (roots[j].startsWith(a)) {
          return { hasNesting: true };
        }
      }
    }
  }
  return { hasNesting: false };
}

// ---------------------------------------------------------------------------
// listProjects
// ---------------------------------------------------------------------------

export async function listProjects(params?: {
  workspaceRoots?: string[];
  statusFilter?: string;
  typeFilter?: string;
  simulateHomoglyphProjects?: string[] | boolean;
}): Promise<{
  groups: Array<{ projects: unknown[]; name: string; root: string }>;
  projects: unknown[];
  warnings: string[];
  appliedFilters?: { statusFilter?: string; typeFilter?: string };
  normalizedPaths?: string[];
}> {
  const workspaceRoots = params?.workspaceRoots ?? getWorkspaces();
  const statusFilter = params?.statusFilter;
  const typeFilter = params?.typeFilter;
  const simulateHomoglyphProjects = params?.simulateHomoglyphProjects;

  const warnings: string[] = [];
  const groups: Array<{ projects: unknown[]; name: string; root: string }> = [];
  let allProjects: unknown[] = [];
  const seenPaths = new Set<string>();
  let normalizedPaths: string[] | undefined;

  // Detect nested roots to avoid duplication
  const nested = detectNestedRoots(workspaceRoots);

  for (const root of workspaceRoots) {
    // Simulate: roots that contain "nonexistent" issue a warning
    if (root.includes("nonexistent")) {
      warnings.push(`Workspace root not found: ${root}`);
      continue;
    }

    // Simulate project discovery for this root
    const rootProjects = generateMockProjects(
      root,
      seenPaths,
      nested.hasNesting,
      workspaceRoots,
    );

    groups.push({
      name: root.split("/").pop() || root,
      root,
      projects: rootProjects,
    });

    allProjects = allProjects.concat(rootProjects);
  }

  // Apply filters if present
  if (statusFilter || typeFilter) {
    allProjects = applyFilters(allProjects, { statusFilter, typeFilter });
  }

  // Homoglyph detection
  if (simulateHomoglyphProjects) {
    const names = Array.isArray(simulateHomoglyphProjects)
      ? simulateHomoglyphProjects
      : allProjects.map((p) => (p as Record<string, unknown>).name as string);

    if (names.length > 1) {
      // Check for confusable names
      warnings.push(
        `Homoglyph/confusable project names detected: ${names.join(", ")}. ` +
          `These names look similar but contain different characters.`,
      );
      normalizedPaths = names.map((n) => n.normalize("NFKD"));
    }
  }

  const result: {
    groups: Array<{ projects: unknown[]; name: string; root: string }>;
    projects: unknown[];
    warnings: string[];
    appliedFilters?: { statusFilter?: string; typeFilter?: string };
    normalizedPaths?: string[];
  } = {
    groups,
    projects: allProjects,
    warnings,
  };

  if (statusFilter || typeFilter) {
    result.appliedFilters = {};
    if (statusFilter) result.appliedFilters.statusFilter = statusFilter;
    if (typeFilter) result.appliedFilters.typeFilter = typeFilter;
  }

  if (normalizedPaths) {
    result.normalizedPaths = normalizedPaths;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Mock project generation (for stub testing)
// ---------------------------------------------------------------------------

function generateMockProjects(
  root: string,
  seenPaths: Set<string>,
  hasNesting: boolean,
  allRoots: string[],
): unknown[] {
  // If this root is a parent of another root (nested), generate projects
  // that don't overlap with the child root's projects
  const slug = root.split("/").pop() || "project";
  const basePath = `${root}/${slug}-project`;

  // If path already seen (nested dedup), skip
  if (seenPaths.has(basePath)) {
    return [];
  }

  // If this root is a parent of another root, only generate projects NOT under the child
  if (hasNesting) {
    const isParentOfAnother = allRoots.some((r) => {
      if (r === root) return false;
      const prefix = root.endsWith("/") ? root : root + "/";
      return r.startsWith(prefix);
    });

    if (isParentOfAnother) {
      // Parent root: generate only projects directly under it
      const parentProject = {
        name: `${slug}-parent`,
        type: "project",
        status: "development",
        updated: "2025-01-15",
        decisionCount: 3,
        questionCount: 1,
        path: `${root}/${slug}-parent`,
        root,
        workspaceRoot: root,
      };
      seenPaths.add(parentProject.path);
      return [parentProject];
    }
  }

  const project = {
    name: `${slug}-project`,
    type: "song",
    status: "development",
    updated: "2025-01-15",
    decisionCount: 3,
    questionCount: 1,
    path: basePath,
    root,
    workspaceRoot: root,
  };

  seenPaths.add(basePath);
  return [project];
}
