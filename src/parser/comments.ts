// src/parser/comments.ts — stub for TASK-12
// Replace with real implementation during build loop.

import type { BriefTag } from "../types/parser.js";

export interface CommentParseResult {
  tags: BriefTag[];
  content: string;
}

/**
 * Parse all HTML comments in a BRIEF.md file, extracting recognised brief: tags
 * and returning the cleaned content with recognised comments removed.
 */
export function parseComments(_input: string): CommentParseResult {
  throw new Error("Not implemented: parseComments");
}

/**
 * Determine whether the line at `lineIndex` falls inside a fenced or indented
 * code block, so that comment extraction can skip it.
 */
export function isInsideCodeBlock(
  _lines: string[],
  _lineIndex: number,
): boolean {
  throw new Error("Not implemented: isInsideCodeBlock");
}

/**
 * Extract a single BriefTag from a raw HTML comment body string, or return null
 * if the comment is not a recognised brief: tag.
 */
export function extractBriefTag(_comment: string): BriefTag | null {
  throw new Error("Not implemented: extractBriefTag");
}

// ---------------------------------------------------------------------------
// Deprecated shims — delegate to the new canonical names
// ---------------------------------------------------------------------------

/** @deprecated Use {@link parseComments} instead. */
export function extractBriefComments(rawContent: string): CommentParseResult {
  return parseComments(rawContent);
}

/** @deprecated Use {@link extractBriefTag} instead. */
export function parseOntologyTag(
  commentBody: string,
  _lineNumber: number,
): import("../types/parser.js").OntologyTag | null {
  const tag = extractBriefTag(commentBody);
  return tag && tag.type === "ontology" ? tag : null;
}

/** @deprecated Use {@link extractBriefTag} instead. */
export function parseRefLinkTag(
  commentBody: string,
  _lineNumber: number,
): import("../types/parser.js").RefLinkTag | null {
  const tag = extractBriefTag(commentBody);
  return tag && tag.type === "ref-link" ? tag : null;
}

/** @deprecated Use {@link extractBriefTag} instead. */
export function parseExceptionTag(
  commentBody: string,
  _lineNumber: number,
): import("../types/parser.js").ExceptionTag | null {
  const tag = extractBriefTag(commentBody);
  return tag && tag.type === "has-exception" ? tag : null;
}
