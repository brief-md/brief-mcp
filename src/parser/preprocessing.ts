// src/parser/preprocessing.ts — stub for TASK-13
// Replace with real implementation during build loop.

import type { ParsedBriefMd, PreprocessResult } from "../types/parser.js";

/** SEC-17: Maximum BRIEF.md file size (10 MB) */
export const MAX_FILE_SIZE = 10_485_760;

/**
 * Pre-process raw BRIEF.md content: strip BOM, normalize line endings,
 * detect strikethrough segments, identify structural headings, and flag
 * streaming vs in-memory mode.
 */
export function preprocess(_input: string): PreprocessResult {
  throw new Error("Not implemented: preprocess");
}

/**
 * Check that the input does not exceed resource limits (file size, section
 * count, decision chain depth). Throws on violation, returns void otherwise.
 */
export function checkResourceLimits(_input: string): void {
  throw new Error("Not implemented: checkResourceLimits");
}

/**
 * Fast path that extracts only the metadata portion of a BRIEF.md file,
 * stopping before the first section heading. Returns the raw metadata string.
 */
export function metadataOnlyFastPath(_input: string): string {
  throw new Error("Not implemented: metadataOnlyFastPath");
}

/**
 * Async streaming variant of {@link preprocessContent}. Returns the same
 * PreprocessResult but processes the input as a stream.
 */
export async function preprocessContentStream(
  _input: string,
): Promise<PreprocessResult> {
  throw new Error("Not implemented: preprocessContentStream");
}

/**
 * Full parse of a BRIEF.md string, with optional timeout support.
 * Rejects with a timeout/abort error if `options.timeoutMs` is exceeded.
 */
export async function parseBrief(
  _content: string,
  _options?: { timeoutMs?: number },
): Promise<ParsedBriefMd> {
  throw new Error("Not implemented: parseBrief");
}

// ---------------------------------------------------------------------------
// Deprecated shims — delegate to the new canonical names
// ---------------------------------------------------------------------------

/** @deprecated Use {@link preprocess} instead. */
export function preprocessContent(
  rawContent: string | Buffer,
): PreprocessResult {
  const input =
    typeof rawContent === "string" ? rawContent : rawContent.toString("utf-8");
  return preprocess(input);
}

/** @deprecated Use {@link parseBrief} instead. */
export function parseBriefMd(
  _content: string,
  _options?: { metadataOnly?: boolean },
): ParsedBriefMd {
  throw new Error("Not implemented: parseBriefMd");
}

/** @deprecated Use {@link parseBrief} instead. */
export async function parseBriefMdFile(
  _filePath: string,
  _options?: { metadataOnly?: boolean },
): Promise<ParsedBriefMd> {
  throw new Error("Not implemented: parseBriefMdFile");
}

export function detectMergeConflicts(_content: string): boolean {
  throw new Error("Not implemented: detectMergeConflicts");
}

export function stripBom(_content: string): string {
  throw new Error("Not implemented: stripBom");
}

export function normalizeLineEndings(_content: string): string {
  throw new Error("Not implemented: normalizeLineEndings");
}
