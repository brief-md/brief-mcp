// src/types/workspace.ts

export type ProjectStatus =
  | "concept"
  | "development"
  | "production"
  | "paused"
  | "complete"
  | "released"
  | "archived";

export interface ProjectSummary {
  readonly name: string;
  readonly type?: string;
  readonly status?: ProjectStatus;
  readonly lastUpdated?: string;
  readonly filePath: string;
  readonly dirPath: string;
  readonly workspaceRoot: string;
  readonly decisionCount?: number;
  readonly questionCount?: number;
}

export interface ListProjectsFilter {
  readonly statusFilter?: "active" | "paused" | "complete" | "archived";
  readonly typeFilter?: string;
}

export interface ActiveProjectInfo {
  readonly projectPath: string;
  readonly briefFilePath: string;
  readonly projectName: string;
  readonly projectType?: string;
  readonly lastAccessed: number;
}

export interface SubProjectInfo {
  readonly name: string;
  readonly type?: string;
  readonly path: string;
  readonly filePath: string;
  readonly relativeDepth: number;
}
