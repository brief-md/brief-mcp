// src/workspace/listing.ts — TASK-20: project listing & filtering

import * as fsp from "node:fs/promises";
import * as path from "node:path";
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
    const sf = filters.statusFilter.toLowerCase();
    result = result.filter((p) => {
      const rec = p as Record<string, unknown>;
      const status = ((rec.status as string) || "").toLowerCase();
      if (sf === "active") return ACTIVE_STATUSES.has(status);
      if (sf === "complete") return COMPLETE_STATUSES.has(status);
      return status === sf;
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
  for (let i = 0; i < roots.length; i++) {
    for (let j = 0; j < roots.length; j++) {
      if (i !== j) {
        const a = roots[i].endsWith("/") ? roots[i] : `${roots[i]}/`;
        if (roots[j].startsWith(a)) {
          return { hasNesting: true };
        }
      }
    }
  }
  return { hasNesting: false };
}

// ---------------------------------------------------------------------------
// Lightweight BRIEF.md metadata extraction (workspace-local, ARCH-04 compliant)
// ---------------------------------------------------------------------------

function extractFields(content: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const lines = content.split("\n");
  let inFrontmatter = false;

  for (let i = 0; i < Math.min(lines.length, 50); i++) {
    const line = lines[i];
    if (i === 0 && line.trim() === "---") {
      inFrontmatter = true;
      continue;
    }
    if (inFrontmatter && line.trim() === "---") {
      inFrontmatter = false;
      continue;
    }
    if (inFrontmatter) {
      const m = line.match(/^(\w[\w\s]*?):\s*(.+)$/);
      if (m) fields[m[1].trim()] = m[2].trim();
      continue;
    }
    if (/^#{1,3}\s/.test(line)) break;
    const bold = line.match(/^\*\*(\w[\w\s]*?):\*\*\s*(.+)$/);
    if (bold) {
      fields[bold[1].trim()] = bold[2].trim();
    }
  }
  return fields;
}

// ---------------------------------------------------------------------------
// scanRoot — discover projects in a single workspace root
// ---------------------------------------------------------------------------

/** Count H3 decision headings in a BRIEF.md content string. */
function countDecisions(content: string): number {
  const sectionMatch = content.match(/^##\s+Key\s+Decisions\b/im);
  if (!sectionMatch) return 0;
  const startIdx = sectionMatch.index! + sectionMatch[0].length;
  const rest = content.slice(startIdx);
  // Find next H2 boundary
  const nextH2 = rest.search(/^##\s/m);
  const sectionBody = nextH2 !== -1 ? rest.slice(0, nextH2) : rest;
  // Count H3 headings (full format) or list items with decision IDs (minimal format)
  const h3Count = (sectionBody.match(/^###\s/gm) || []).length;
  const listCount = (sectionBody.match(/^-\s+\*?\*?[A-Z]+-\d+/gm) || []).length;
  return Math.max(h3Count, listCount);
}

/** Build a project entry from a BRIEF.md file. */
function buildProjectEntry(
  content: string,
  fields: Record<string, string>,
  briefFilePath: string,
  dirPath: string,
  root: string,
  fallbackName: string,
): Record<string, unknown> {
  return {
    name: fields.Project || fields.project || fallbackName,
    type: fields.Type || fields.type || undefined,
    status: (fields.Status || fields.status || "").toLowerCase() || undefined,
    updated: fields.Updated || fields.updated || undefined,
    decisionCount: countDecisions(content),
    questionCount: Number(fields.Questions || fields.questions || "0") || 0,
    path: briefFilePath,
    dirPath,
    root,
    workspaceRoot: root,
  };
}

async function scanRoot(
  root: string,
  options?: { recursive?: boolean },
): Promise<{
  projects: unknown[];
  warning?: string;
}> {
  // Check if root exists on disk
  try {
    await fsp.access(root);
  } catch {
    // Root doesn't exist — return fallback with warning
    return {
      projects: [
        {
          name: path.basename(root) || root,
          type: undefined,
          status: undefined,
          updated: undefined,
          decisionCount: 0,
          questionCount: 0,
          path: root,
          dirPath: root,
          root,
          workspaceRoot: root,
        },
      ],
      warning: `Workspace root not found: ${root}`,
    };
  }

  const projects: unknown[] = [];

  // GP-3: Check if root itself has a BRIEF.md
  try {
    const rootFiles = await fsp.readdir(root);
    const rootBrief = rootFiles.find((f) => f.toLowerCase() === "brief.md");
    if (rootBrief) {
      const content = await fsp.readFile(path.join(root, rootBrief), "utf-8");
      const fields = extractFields(content);
      projects.push(
        buildProjectEntry(
          content,
          fields,
          path.join(root, rootBrief),
          root,
          root,
          path.basename(root) || root,
        ),
      );
    }
  } catch {
    // Non-fatal
  }

  // Scan subdirectories for BRIEF.md
  await scanDir(root, root, projects, options?.recursive ? 10 : 1);

  // If no BRIEF.md projects found at all, create a fallback entry
  if (projects.length === 0) {
    projects.push({
      name: path.basename(root) || root,
      type: undefined,
      status: undefined,
      updated: undefined,
      decisionCount: 0,
      questionCount: 0,
      path: root,
      dirPath: root,
      root,
      workspaceRoot: root,
    });
  }

  return { projects };
}

/** Recursively scan directories for BRIEF.md files up to maxDepth levels. */
async function scanDir(
  dir: string,
  root: string,
  projects: unknown[],
  maxDepth: number,
  currentDepth = 0,
): Promise<void> {
  if (currentDepth >= maxDepth) return;
  try {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      if (entry.name === "node_modules") continue;
      const dirPath = path.join(dir, entry.name);
      try {
        const files = await fsp.readdir(dirPath);
        const briefFile = files.find((f) => f.toLowerCase() === "brief.md");
        if (briefFile) {
          const content = await fsp.readFile(
            path.join(dirPath, briefFile),
            "utf-8",
          );
          const fields = extractFields(content);
          projects.push(
            buildProjectEntry(
              content,
              fields,
              path.join(dirPath, briefFile),
              dirPath,
              root,
              entry.name,
            ),
          );
        }
        // Recurse into subdirectory if recursive mode
        if (maxDepth > 1) {
          await scanDir(dirPath, root, projects, maxDepth, currentDepth + 1);
        }
      } catch {
        // Skip unreadable subdirectories
      }
    }
  } catch {
    // readdir failed
  }
}

// ---------------------------------------------------------------------------
// listProjects — scans workspace roots for BRIEF.md projects
// ---------------------------------------------------------------------------

export async function listProjects(params?: {
  workspaceRoots?: string[];
  statusFilter?: string;
  typeFilter?: string;
  recursive?: boolean;
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

  // Detect nested roots to avoid duplication (FS-11)
  const nested = detectNestedRoots(workspaceRoots);

  // Scan all roots concurrently using Promise.allSettled (ERR-11)
  const scanResults = await Promise.allSettled(
    workspaceRoots.map((root) =>
      scanRoot(root, { recursive: params?.recursive }),
    ),
  );

  for (let i = 0; i < scanResults.length; i++) {
    const outcome = scanResults[i];
    const root = workspaceRoots[i];

    if (outcome.status === "rejected") {
      warnings.push(`Workspace root not found: ${root}`);
      continue;
    }

    const { projects: rootProjects, warning } = outcome.value;

    if (warning) {
      warnings.push(warning);
    }

    // Skip adding a group if there are no projects and a warning was issued
    if (rootProjects.length === 0 && warning) {
      continue;
    }

    // Nested root dedup: filter out projects under deeper workspace roots
    const filteredProjects = rootProjects.filter((p) => {
      const pp = (p as Record<string, unknown>).path as string;
      if (seenPaths.has(pp)) return false;

      if (nested.hasNesting) {
        const isDeeperRoot = workspaceRoots.some((r) => {
          if (r === root) return false;
          const prefix = root.endsWith("/") ? root : `${root}/`;
          return r.startsWith(prefix) && pp.startsWith(r);
        });
        if (isDeeperRoot) return false;
      }

      seenPaths.add(pp);
      return true;
    });

    groups.push({
      name: root.split("/").pop() || root,
      root,
      projects: filteredProjects,
    });

    allProjects = allProjects.concat(filteredProjects);
  }

  // Apply filters if present
  if (statusFilter || typeFilter) {
    allProjects = applyFilters(allProjects, { statusFilter, typeFilter });
  }

  // Homoglyph detection (OQ-237, Pattern 13)
  if (simulateHomoglyphProjects) {
    const names = Array.isArray(simulateHomoglyphProjects)
      ? simulateHomoglyphProjects
      : allProjects.map((p) => (p as Record<string, unknown>).name as string);

    if (names.length > 1) {
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
