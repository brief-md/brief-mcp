// src/writer/core.ts — stub for TASK-14
// Replace with real implementation during build loop.

import type { ParsedBriefMd } from "../types/parser.js";
import type { WriteOperation, WriterResult } from "../types/writer.js";

// ---------------------------------------------------------------------------
// New exports (matching test expectations)
// ---------------------------------------------------------------------------

/**
 * Write new content into a specific section of a BRIEF.md content string.
 * Returns { content, warnings }.
 */
export async function writeSection(
  _content: string,
  _sectionName: string,
  _newContent: string,
  _options?: { simulateCrash?: boolean; filePath?: string },
): Promise<{ content: string; warnings: string[] }> {
  throw new Error("Not implemented: writeSection");
}

/**
 * Create a new BRIEF.md file content string from project metadata.
 * Returns the full file content as a string.
 */
export async function createNewFile(_params: {
  project: string;
  type: string;
  sectionContent?: Record<string, string>;
}): Promise<string> {
  throw new Error("Not implemented: createNewFile");
}

/**
 * Detect whether content uses CRLF or LF line endings.
 * Returns "CRLF" or "LF" (uppercase).
 */
export function detectLineEnding(_content: string): "CRLF" | "LF" {
  throw new Error("Not implemented: detectLineEnding");
}

/**
 * Ensure content ends with exactly one trailing newline.
 */
export function ensureTrailingNewline(_content: string): string {
  throw new Error("Not implemented: ensureTrailingNewline");
}

/**
 * Read a specific section from a BRIEF.md file on disk.
 * Returns { content }.
 */
export async function readBriefSection(
  _filePath: string,
  _sectionName: string,
): Promise<{ content: string }> {
  throw new Error("Not implemented: readBriefSection");
}

/**
 * Write a specific section to a BRIEF.md file on disk.
 * Returns { success }.
 */
export async function writeBriefSection(
  _filePath: string,
  _sectionName: string,
  _content: string,
): Promise<{ success: boolean }> {
  throw new Error("Not implemented: writeBriefSection");
}

// ---------------------------------------------------------------------------
// Deprecated shims (original stubs kept for backward compatibility)
// ---------------------------------------------------------------------------

/** @deprecated Use createNewFile instead */
export async function createBriefMd(
  _filePath: string,
  _metadata: Record<string, unknown>,
  _initialSections?: Record<string, string>,
): Promise<WriterResult> {
  throw new Error("Not implemented: createBriefMd (deprecated)");
}

/** @deprecated Use writeSection instead */
export async function applyWriteOperation(
  _filePath: string,
  _operation: WriteOperation,
  _options?: { force?: boolean },
): Promise<WriterResult> {
  throw new Error("Not implemented: applyWriteOperation (deprecated)");
}

/** @deprecated Use writeSection instead */
export function reassembleFile(
  _original: ParsedBriefMd,
  _rawContent: string,
  _operation: WriteOperation,
): string {
  throw new Error("Not implemented: reassembleFile (deprecated)");
}

/** @deprecated Use detectLineEnding instead */
export function detectLineEndingStyle(_content: string): "lf" | "crlf" {
  throw new Error("Not implemented: detectLineEndingStyle (deprecated)");
}
