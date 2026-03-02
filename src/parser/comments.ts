// src/parser/comments.ts — stub for TASK-12
// Replace with real implementation during build loop.

import type { BriefTag } from "../types/parser.js";

export interface CommentParseResult {
  tags: BriefTag[];
  contentWithoutRecognizedComments: string;
}

export function extractBriefComments(_rawContent: string): CommentParseResult {
  throw new Error("Not implemented: extractBriefComments");
}

export function parseOntologyTag(
  _commentBody: string,
  _lineNumber: number,
): import("../types/parser.js").OntologyTag | null {
  throw new Error("Not implemented: parseOntologyTag");
}

export function parseRefLinkTag(
  _commentBody: string,
  _lineNumber: number,
): import("../types/parser.js").RefLinkTag | null {
  throw new Error("Not implemented: parseRefLinkTag");
}

export function parseExceptionTag(
  _commentBody: string,
  _lineNumber: number,
): import("../types/parser.js").ExceptionTag | null {
  throw new Error("Not implemented: parseExceptionTag");
}
