// src/context/read.ts — stub for TASK-24
// Replace with real implementation during build loop.

import type { ContextReadResult } from "../types/context.js";
import type { Decision, Question } from "../types/decisions.js";

export interface GetContextOptions {
  sections?: string[];
  includeSuperseded?: boolean;
  contextDepth?: number;
  scope?: string;
  sizeLimitBytes?: number;
}

export interface GetConstraintsResult {
  constraints: string[];
  rejectedAlternatives: string[];
  filePath: string;
  warnings?: string[];
}

export interface GetDecisionsResult {
  activeDecisions: Decision[];
  decisionHistory?: Decision[];
  filePath: string;
  isTruncated?: boolean;
}

export interface GetQuestionsResult {
  toResolve: Question[];
  toKeepOpen: Question[];
  resolved?: Question[];
  filePath: string;
}

export async function getContext(
  _projectPath: string,
  _options?: GetContextOptions,
): Promise<ContextReadResult> {
  throw new Error("Not implemented: getContext");
}

export async function getConstraints(
  _projectPath: string,
  _scope?: string,
): Promise<GetConstraintsResult> {
  throw new Error("Not implemented: getConstraints");
}

export async function getDecisions(
  _projectPath: string,
  _options?: { includeSuperseded?: boolean; scope?: string },
): Promise<GetDecisionsResult> {
  throw new Error("Not implemented: getDecisions");
}

export async function getQuestions(
  _projectPath: string,
  _options?: { category?: string; scope?: string },
): Promise<GetQuestionsResult> {
  throw new Error("Not implemented: getQuestions");
}
