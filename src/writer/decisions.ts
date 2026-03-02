// src/writer/decisions.ts — stub for TASK-15a
// Replace with real implementation during build loop.

import type { DecisionWriteParams, WriterResult } from "../types/writer.js";

export async function writeNewDecision(
  _filePath: string,
  _params: DecisionWriteParams,
  _options?: { force?: boolean },
): Promise<WriterResult> {
  throw new Error("Not implemented: writeNewDecision");
}

export async function writeDecisionSupersession(
  _filePath: string,
  _newDecision: DecisionWriteParams,
  _replacesTitle: string,
): Promise<WriterResult> {
  throw new Error("Not implemented: writeDecisionSupersession");
}

export async function amendDecision(
  _filePath: string,
  _targetTitle: string,
  _fields: Partial<DecisionWriteParams>,
): Promise<WriterResult> {
  throw new Error("Not implemented: amendDecision");
}

export function normalizeDecisionTitle(_title: string): string {
  throw new Error("Not implemented: normalizeDecisionTitle");
}

export function detectCircularChain(
  _startTitle: string,
  _decisions: import("../types/decisions.js").Decision[],
): boolean {
  throw new Error("Not implemented: detectCircularChain");
}
