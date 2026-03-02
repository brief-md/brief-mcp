// src/context/write-decisions.ts — stub for TASK-26
// Replace with real implementation during build loop.

import type { Decision } from "../types/decisions.js";

export interface AddDecisionParams {
  title: string;
  why?: string;
  alternatives?: string[];
  date?: string;
  replaces?: string;
  exceptionTo?: string;
  amend?: string;
}

export interface AddDecisionResult {
  decision: Decision;
  filePath: string;
  changesSummary: string;
  warnings?: string[];
  conflictsDetected?: Array<{ description: string }>;
}

export async function handleAddDecision(
  _projectPath: string,
  _params: AddDecisionParams,
): Promise<AddDecisionResult> {
  throw new Error("Not implemented: handleAddDecision");
}
