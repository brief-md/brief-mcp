// src/parser/preprocessing.ts — stub for TASK-13
// Replace with real implementation during build loop.

import type { ParsedBriefMd, PreprocessResult } from "../types/parser.js";

/** SEC-17: Maximum BRIEF.md file size (10 MB) */
export const MAX_FILE_SIZE = 10_485_760;

export function preprocessContent(
  _rawContent: string | Buffer,
): PreprocessResult {
  throw new Error("Not implemented: preprocessContent");
}

export function parseBriefMd(
  _content: string,
  _options?: { metadataOnly?: boolean },
): ParsedBriefMd {
  throw new Error("Not implemented: parseBriefMd");
}

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
