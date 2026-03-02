// src/writer/exceptions.ts — stub for TASK-15b
// Replace with real implementation during build loop.

import type { WriterResult } from "../types/writer.js";

export interface ExceptionWriteParams {
  readonly title: string;
  readonly exceptionTo: string;
  readonly why?: string;
  readonly when?: string;
  readonly alternativesConsidered?: string;
}

export interface QuestionResolutionResult extends WriterResult {
  readonly resolved: boolean;
  readonly resolutionSummary: string;
  readonly suggestDecision: boolean;
  readonly wasKeepOpen?: boolean;
}

export async function writeException(
  _filePath: string,
  _params: ExceptionWriteParams,
): Promise<WriterResult> {
  throw new Error("Not implemented: writeException");
}

export async function resolveQuestion(
  _filePath: string,
  _questionText: string,
  _options?: { decision?: string },
): Promise<QuestionResolutionResult> {
  throw new Error("Not implemented: resolveQuestion");
}

export async function writeIntentionalTension(
  _filePath: string,
  _itemA: string,
  _itemB: string,
  _reason?: string,
): Promise<WriterResult> {
  throw new Error("Not implemented: writeIntentionalTension");
}

export async function writeBidirectionalLink(
  _filePath: string,
  _questionText: string,
  _decisionTitle: string,
): Promise<WriterResult> {
  throw new Error("Not implemented: writeBidirectionalLink");
}
