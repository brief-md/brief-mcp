// src/hierarchy/discovery.ts — stub for TASK-19
// Replace with real implementation during build loop.

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

export async function discoverProjects(
  _startDir: string,
  _workspaceRoot: string,
  _config?: DiscoveryConfig,
): Promise<ProjectSummary[]> {
  throw new Error("Not implemented: discoverProjects");
}
