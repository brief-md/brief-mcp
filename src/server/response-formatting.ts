// src/server/response-formatting.ts — stub for TASK-46
// Replace with real implementation during build loop.

import type {
  ErrorResponse,
  SuggestionsForAi,
  ToolResponse,
} from "../types/responses.js";

export function formatToolResponse(
  _content: string,
  _metadata?: Record<string, unknown>,
): ToolResponse {
  throw new Error("Not implemented: formatToolResponse");
}

export function formatErrorResponse(_error: ErrorResponse): ToolResponse {
  throw new Error("Not implemented: formatErrorResponse");
}

export function buildSuggestionsForAi(
  _scenario: SuggestionsForAi["scenario"],
): SuggestionsForAi {
  throw new Error("Not implemented: buildSuggestionsForAi");
}

export function applyResponseSizeLimit(
  _response: ToolResponse,
  _limitBytes?: number,
): ToolResponse {
  throw new Error("Not implemented: applyResponseSizeLimit");
}

export function ensureAbsolutePaths(
  _data: Record<string, unknown>,
): Record<string, unknown> {
  throw new Error("Not implemented: ensureAbsolutePaths");
}

export function separateDecisionsByStatus(_decisions: unknown[]): {
  activeDecisions: unknown[];
  decisionHistory: unknown[];
} {
  throw new Error("Not implemented: separateDecisionsByStatus");
}
