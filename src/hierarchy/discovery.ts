// src/hierarchy/discovery.ts — stub for TASK-19
// Replace with real implementation during build loop.

// ---------------------------------------------------------------------------
// Primary exports (match test expectations)
// ---------------------------------------------------------------------------

export async function scanDownward(
  _dir: string,
  _options?: {
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
  throw new Error("Not implemented: scanDownward");
}

export function shouldScanDirectory(_dirName: string): boolean {
  throw new Error("Not implemented: shouldScanDirectory");
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
