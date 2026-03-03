// src/writer/decisions.ts — stub for TASK-15a
// Replace with real implementation during build loop.

import type { DecisionWriteParams, WriterResult } from "../types/writer.js";

// ---------------------------------------------------------------------------
// New exports (matching test expectations)
// ---------------------------------------------------------------------------

/**
 * Add a new decision to the Key Decisions section.
 * Returns { content, warnings }.
 */
export async function addDecision(
  _inputContent: string,
  _params: {
    title: string;
    why: string;
    when?: string;
    alternatives?: string[];
  },
): Promise<{ content: string; warnings: string[] }> {
  throw new Error("Not implemented: addDecision");
}

/**
 * Supersede an existing decision with a new one.
 * Returns { content }.
 */
export async function supersedeDecision(
  _inputContent: string,
  _params: {
    title: string;
    why: string;
    replaces: string;
    sourceFile?: string;
  },
): Promise<{ content: string }> {
  throw new Error("Not implemented: supersedeDecision");
}

/**
 * Validate decision fields (title, why, when).
 * Throws on invalid input.
 */
export function validateDecisionFields(_params: {
  title: string;
  why?: string;
  when?: string;
}): void {
  throw new Error("Not implemented: validateDecisionFields");
}

/**
 * Detect circular supersession chains among decisions.
 * Returns { hasCycle, involvedTitles }.
 */
export function detectCircularChain(
  _decisions: Array<{ title: string; supersededBy?: string }>,
): { hasCycle: boolean; involvedTitles: string[] } {
  throw new Error("Not implemented: detectCircularChain");
}

/**
 * Normalize a decision title for matching (strips markdown formatting, zero-width chars, etc.).
 */
export function normalizeTitleForMatch(_title: string): string {
  throw new Error("Not implemented: normalizeTitleForMatch");
}

// ---------------------------------------------------------------------------
// Deprecated shims (original stubs kept for backward compatibility)
// ---------------------------------------------------------------------------

/** @deprecated Use addDecision instead */
export async function writeNewDecision(
  _filePath: string,
  _params: DecisionWriteParams,
  _options?: { force?: boolean },
): Promise<WriterResult> {
  throw new Error("Not implemented: writeNewDecision (deprecated)");
}

/** @deprecated Use supersedeDecision instead */
export async function writeDecisionSupersession(
  _filePath: string,
  _newDecision: DecisionWriteParams,
  _replacesTitle: string,
): Promise<WriterResult> {
  throw new Error("Not implemented: writeDecisionSupersession (deprecated)");
}

/** @deprecated Use normalizeTitleForMatch instead */
export function normalizeDecisionTitle(_title: string): string {
  throw new Error("Not implemented: normalizeDecisionTitle (deprecated)");
}
