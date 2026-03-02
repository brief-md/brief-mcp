// src/workspace/reentry.ts — stub for TASK-23
// Replace with real implementation during build loop.

import type { SubProjectInfo } from "../types/workspace.js";

export interface ReentrySummary {
  projectName: string;
  projectType?: string;
  status?: string;
  lastUpdated?: string;
  timeSinceUpdate?: string;
  activeDecisionCount: number;
  supersededDecisionCount: number;
  openQuestionsCount: number;
  keepOpenCount: number;
  tensionsCount: number;
  subProjects: SubProjectInfo[];
  ontologyTagSummary?: Record<string, number>;
  conflictsCount: number;
  positiveState?: boolean;
  externalSessionPrompt?: string;
}

export async function generateReentrySummary(
  _projectPath: string,
  _options?: { includeHistory?: boolean },
): Promise<ReentrySummary> {
  throw new Error("Not implemented: generateReentrySummary");
}

export function formatTimeSinceUpdate(_lastUpdated: string): string {
  throw new Error("Not implemented: formatTimeSinceUpdate");
}
