// src/writer/exceptions.ts — stub for TASK-15b
// Replace with real implementation during build loop.

import type { WriterResult } from "../types/writer.js";

// ---------------------------------------------------------------------------
// Deprecated interfaces (kept for backward compatibility)
// ---------------------------------------------------------------------------

/** @deprecated */
export interface ExceptionWriteParams {
  readonly title: string;
  readonly exceptionTo: string;
  readonly why?: string;
  readonly when?: string;
  readonly alternativesConsidered?: string;
}

/** @deprecated */
export interface QuestionResolutionResult extends WriterResult {
  readonly resolved: boolean;
  readonly resolutionSummary: string;
  readonly suggestDecision: boolean;
  readonly wasKeepOpen?: boolean;
}

// ---------------------------------------------------------------------------
// New exports (matching test expectations)
// ---------------------------------------------------------------------------

/**
 * Add an exception to an existing decision.
 * Returns { content }.
 */
export async function addException(
  _inputContent: string,
  _params: { title: string; why: string; exceptionTo: string },
): Promise<{ content: string }> {
  throw new Error("Not implemented: addException");
}

/**
 * Add an intentional tension entry.
 * Returns { content }.
 */
export async function addIntentionalTension(
  _inputContent: string,
  _params: { itemA: string; itemB: string; reason?: string },
): Promise<{ content: string }> {
  throw new Error("Not implemented: addIntentionalTension");
}

/**
 * Amend an existing decision (update fields in-place).
 * Returns { content }.
 */
export async function amendDecision(
  _inputContent: string,
  _params: { title: string; why: string },
): Promise<{ content: string }> {
  throw new Error("Not implemented: amendDecision");
}

/**
 * Add bidirectional links between a resolved question and a decision.
 * Returns { content }.
 */
export async function addBidirectionalLink(
  _inputContent: string,
  _params: { questionText: string; decisionTitle: string },
): Promise<{ content: string }> {
  throw new Error("Not implemented: addBidirectionalLink");
}

/**
 * Resolve an open question, marking it as resolved.
 * Returns { content, wasKeepOpen?, suggestDecision?, resolutionSummary? }.
 */
export async function resolveQuestion(
  _inputContent: string,
  _params: { question: string; resolution: string },
): Promise<{
  content: string;
  wasKeepOpen?: boolean;
  suggestDecision?: boolean;
  resolutionSummary?: string;
}> {
  throw new Error("Not implemented: resolveQuestion");
}

// ---------------------------------------------------------------------------
// Deprecated shims (original stubs kept for backward compatibility)
// ---------------------------------------------------------------------------

/** @deprecated Use addException instead */
export async function writeException(
  _filePath: string,
  _params: ExceptionWriteParams,
): Promise<WriterResult> {
  throw new Error("Not implemented: writeException (deprecated)");
}

/** @deprecated Use addIntentionalTension instead */
export async function writeIntentionalTension(
  _filePath: string,
  _itemA: string,
  _itemB: string,
  _reason?: string,
): Promise<WriterResult> {
  throw new Error("Not implemented: writeIntentionalTension (deprecated)");
}

/** @deprecated Use addBidirectionalLink instead */
export async function writeBidirectionalLink(
  _filePath: string,
  _questionText: string,
  _decisionTitle: string,
): Promise<WriterResult> {
  throw new Error("Not implemented: writeBidirectionalLink (deprecated)");
}
