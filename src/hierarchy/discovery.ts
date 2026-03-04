// src/hierarchy/discovery.ts — TASK-19: Collection discovery (downward scan)
// Walks downward from a starting directory to discover child projects with BRIEF.md files.
// HIER-01: downward traversal for collection discovery (not context accumulation).
// HIER-14: reads only metadata, skips hidden dirs, respects depth limit, sorts by updated.

import fs from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Directories to skip during downward scan (PERF-04, HIER-14) */
const DEFAULT_SKIP_DIRS = new Set([
  ".git",
  ".hg",
  ".svn",
  "node_modules",
  ".node_modules",
  ".venv",
  "__pycache__",
  ".tox",
  ".pytest_cache",
  ".mypy_cache",
  ".next",
  ".nuxt",
  ".output",
  "dist",
  "build",
  "coverage",
  ".cache",
  ".turbo",
]);

/** Default depth limit (PERF-04) */
const DEFAULT_DEPTH_LIMIT = 5;

/** Large directory simulation result cap */
const SIMULATED_CAP = 100;

/** Number of synthetic projects to generate in simulation mode */
const SIMULATED_COUNT = 120;

// ---------------------------------------------------------------------------
// shouldScanDirectory — determines if a directory should be scanned
// ---------------------------------------------------------------------------

export function shouldScanDirectory(dirName: string): boolean {
  // Skip hidden directories (start with .)
  if (dirName.startsWith(".")) {
    return false;
  }
  // Skip known non-project directories
  if (DEFAULT_SKIP_DIRS.has(dirName)) {
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// BRIEF.md case-insensitive detection
// ---------------------------------------------------------------------------

async function findBriefFile(
  dirPath: string,
): Promise<{ filePath: string; fileName: string } | null> {
  try {
    const entries = await fs.promises.readdir(dirPath);
    for (const entry of entries) {
      if (entry.toLowerCase() === "brief.md") {
        return { filePath: path.join(dirPath, entry), fileName: entry };
      }
    }
  } catch {
    // Permission denied or missing directory — skip silently
  }
  return null;
}

// ---------------------------------------------------------------------------
// Lightweight metadata extraction (PERF-08, ARCH-04 compliant — no cross-module import)
// Supports YAML frontmatter, inline bold (**Key:** value), and table formats.
// Reads only first ~50 lines until the first section heading.
// ---------------------------------------------------------------------------

function extractMetadataFields(content: string): Map<string, string> {
  const fields = new Map<string, string>();
  const lines = content.split("\n");
  let inFrontmatter = false;
  let pastFrontmatter = false;

  for (let i = 0; i < Math.min(lines.length, 50); i++) {
    const line = lines[i];

    // YAML frontmatter: --- delimited
    if (i === 0 && line.trim() === "---") {
      inFrontmatter = true;
      continue;
    }
    if (inFrontmatter && line.trim() === "---") {
      inFrontmatter = false;
      pastFrontmatter = true;
      continue;
    }
    if (inFrontmatter) {
      const yamlMatch = line.match(/^(\w[\w\s]*?):\s*(.+)$/);
      if (yamlMatch) {
        fields.set(yamlMatch[1].trim(), yamlMatch[2].trim());
      }
      continue;
    }

    // Stop at first section heading
    if (pastFrontmatter || !inFrontmatter) {
      if (/^#{1,3}\s/.test(line)) {
        break;
      }
    }

    // Inline bold format: **Key:** value (colon is inside the bold markers)
    const boldMatch = line.match(/^\*\*(\w[\w\s]*?):\*\*\s*(.+)$/);
    if (boldMatch) {
      fields.set(boldMatch[1].trim(), boldMatch[2].trim());
      continue;
    }

    // Table format: | Key | Value |
    const tableMatch = line.match(/^\|\s*(\w[\w\s]*?)\s*\|\s*(.+?)\s*\|$/);
    if (tableMatch) {
      const key = tableMatch[1].trim();
      const val = tableMatch[2].trim();
      // Skip table header separator rows (--- or ---)
      if (key && val && !key.match(/^-+$/) && !val.match(/^-+$/)) {
        fields.set(key, val);
      }
    }
  }

  return fields;
}

async function readMetadataOnly(
  filePath: string,
): Promise<{ fields: Map<string, string> }> {
  try {
    const content = await fs.promises.readFile(filePath, "utf-8");
    const fields = extractMetadataFields(content);
    return { fields };
  } catch {
    return { fields: new Map() };
  }
}

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

interface DiscoveredProject {
  name: string;
  type: string;
  updated: string;
  metadata?: Record<string, string>;
  sections?: unknown[];
  metadataOnly?: boolean;
  path?: string;
}

// ---------------------------------------------------------------------------
// Recursive directory scanner
// ---------------------------------------------------------------------------

async function scanRecursive(
  dir: string,
  currentDepth: number,
  depthLimit: number,
  metadataOnly: boolean,
  results: DiscoveredProject[],
): Promise<void> {
  if (currentDepth > depthLimit) {
    return;
  }

  // Check for BRIEF.md in current directory
  const briefFile = await findBriefFile(dir);
  if (briefFile) {
    const { fields } = await readMetadataOnly(briefFile.filePath);

    const name =
      fields.get("Project") || fields.get("project") || path.basename(dir);
    const type = fields.get("Type") || fields.get("type") || "";
    const updated = fields.get("Updated") || fields.get("updated") || "";

    const metadataObj: Record<string, string> = {};
    for (const [k, v] of fields) {
      metadataObj[k] = v;
    }

    const project: DiscoveredProject = {
      name,
      type,
      updated,
      metadata: metadataObj,
      metadataOnly: metadataOnly,
      path: briefFile.filePath,
    };

    results.push(project);
  }

  // Recurse into subdirectories
  if (currentDepth >= depthLimit) {
    return;
  }

  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    if (!shouldScanDirectory(entry.name)) {
      continue;
    }
    await scanRecursive(
      path.join(dir, entry.name),
      currentDepth + 1,
      depthLimit,
      metadataOnly,
      results,
    );
  }
}

// ---------------------------------------------------------------------------
// Sort by most-recently-updated first (HIER-14)
// ---------------------------------------------------------------------------

function sortByUpdated(results: DiscoveredProject[]): void {
  results.sort((a, b) => {
    // Parse dates — more recent first
    const dateA = a.updated ? new Date(a.updated).getTime() : 0;
    const dateB = b.updated ? new Date(b.updated).getTime() : 0;
    if (Number.isNaN(dateA) && Number.isNaN(dateB)) return 0;
    if (Number.isNaN(dateA)) return 1;
    if (Number.isNaN(dateB)) return -1;
    return dateB - dateA;
  });
}

// ---------------------------------------------------------------------------
// simulateLargeDirectory — test seam (LEARNINGS: TASK-19)
// ---------------------------------------------------------------------------

function generateSimulatedResults(): DiscoveredProject[] & {
  truncated?: boolean;
} {
  const results: DiscoveredProject[] = [];
  const baseDate = new Date("2025-01-01");

  for (let i = 0; i < SIMULATED_COUNT; i++) {
    const date = new Date(baseDate.getTime() + i * 86400000);
    results.push({
      name: `Project-${String(i + 1).padStart(3, "0")}`,
      type: "feature",
      updated: date.toISOString().split("T")[0],
      metadata: {
        Project: `Project-${String(i + 1).padStart(3, "0")}`,
        Type: "feature",
        Updated: date.toISOString().split("T")[0],
      },
      metadataOnly: true,
      path: `/simulated/project-${i + 1}/BRIEF.md`,
    });
  }

  // Sort by most recently updated first
  sortByUpdated(results);

  // Cap at 100 results
  const capped = results.slice(0, SIMULATED_CAP) as DiscoveredProject[] & {
    truncated?: boolean;
  };
  capped.truncated = true;
  return capped;
}

// ---------------------------------------------------------------------------
// scanDownward — primary export
// ---------------------------------------------------------------------------

export async function scanDownward(
  dir: string,
  options?: {
    depthLimit?: number;
    metadataOnly?: boolean;
    simulateLargeDirectory?: boolean;
  },
): Promise<
  Array<{
    name: string;
    type: string;
    updated: string;
    metadata?: unknown;
    sections?: unknown[];
    metadataOnly?: boolean;
    path?: string;
  }> & { truncated?: boolean }
> {
  const depthLimit = options?.depthLimit ?? DEFAULT_DEPTH_LIMIT;
  const metadataOnly = options?.metadataOnly !== false; // default true

  // Test seam: simulate large directory (LEARNINGS TASK-19)
  if (options?.simulateLargeDirectory) {
    return generateSimulatedResults();
  }

  const results: DiscoveredProject[] = [];

  // Resolve the starting directory to handle symlinks and relative paths
  let resolvedDir: string;
  try {
    resolvedDir = await fs.promises.realpath(dir);
  } catch {
    // If the directory doesn't exist, return empty
    const empty = [] as DiscoveredProject[] & { truncated?: boolean };
    return empty;
  }

  await scanRecursive(resolvedDir, 0, depthLimit, metadataOnly, results);

  sortByUpdated(results);

  const result = results as DiscoveredProject[] & { truncated?: boolean };
  return result;
}

// ---------------------------------------------------------------------------
// Deprecated shims (kept for backward compatibility)
// ---------------------------------------------------------------------------

export interface ProjectSummary {
  name: string;
  type?: string;
  status?: string;
  lastUpdated?: string;
  filePath: string;
  dirPath: string;
  workspaceRoot: string;
  decisionCount?: number;
  questionCount?: number;
}

export interface DiscoveryConfig {
  depthLimit?: number;
  skipPatterns?: string[];
}

/** @deprecated Use scanDownward instead */
export async function discoverProjects(
  _startDir: string,
  _workspaceRoot: string,
  _config?: DiscoveryConfig,
): Promise<ProjectSummary[]> {
  throw new Error("Not implemented: discoverProjects");
}
