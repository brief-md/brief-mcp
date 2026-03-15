// src/types/decisions.ts

export type DecisionStatus = "active" | "superseded" | "exception";
export type DecisionFormat = "minimal" | "full";

export interface Decision {
  readonly id: string;
  readonly text: string;
  readonly rationale?: string;
  readonly status: DecisionStatus;
  readonly format: DecisionFormat;
  readonly what?: string;
  readonly why?: string;
  readonly when?: string;
  readonly alternativesConsidered?: string[];
  readonly replaces?: string;
  readonly amends?: string;
  readonly exceptionTo?: string;
  readonly supersededBy?: string;
  readonly resolvedFrom?: string;
  readonly sourceLine?: number;
}

export type QuestionCategory = "to-resolve" | "to-keep-open" | "resolved";

export interface Question {
  readonly text: string;
  readonly checked: boolean;
  readonly category: QuestionCategory;
  readonly options?: string[];
  readonly impact?: string;
  readonly priority?: "high" | "medium" | "low";
}

export interface IntentionalTension {
  readonly between: string[];
  readonly description: string;
  readonly tradeoff?: string;
}

export interface ExternalToolSession {
  readonly tool: string;
  readonly capturedAt: string;
  readonly decisions?: Array<{ title: string; why: string }>;
  readonly summary?: string;
  readonly breadcrumb?: string;
}

let _decisionSeq = 0;

// Factory that creates a minimal Decision from text + status
export function parseDecision(input: {
  text: string;
  status: DecisionStatus;
  rationale?: string;
}): Decision {
  _decisionSeq += 1;
  return {
    id: `d-${_decisionSeq}`,
    text: input.text,
    status: input.status,
    format: "minimal",
    rationale: input.rationale,
  };
}
