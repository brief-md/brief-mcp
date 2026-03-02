// src/parser/decisions.ts — stub for TASK-11
// Replace with real implementation during build loop.

import type { Decision, Question } from "../types/decisions.js";
import type { Section } from "../types/parser.js";

export function extractDecisions(_decisionsSection: Section): Decision[] {
  throw new Error("Not implemented: extractDecisions");
}

export function extractQuestions(_questionsSection: Section): Question[] {
  throw new Error("Not implemented: extractQuestions");
}

export function detectSupersededStatus(
  _heading: string,
  _body: string,
): boolean {
  throw new Error("Not implemented: detectSupersededStatus");
}

export function parseDecisionFormat(
  _body: string,
): import("../types/decisions.js").DecisionFormat {
  throw new Error("Not implemented: parseDecisionFormat");
}
