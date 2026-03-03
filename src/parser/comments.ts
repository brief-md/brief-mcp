// src/parser/comments.ts — TASK-12 implementation

import type {
  BriefTag,
  ExceptionTag,
  OntologyTag,
  RefLinkTag,
  UnknownBriefTag,
} from "../types/parser.js";

export interface CommentParseResult {
  tags: BriefTag[];
  content: string;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Build a Set of line indices that fall inside fenced or indented code blocks.
 * O(n) single pass — used by both parseComments and isInsideCodeBlock.
 */
function buildCodeBlockSet(lines: string[]): Set<number> {
  const codeLines = new Set<number>();
  let inFenced = false;
  let fenceMarker = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimStart();

    if (!inFenced) {
      if (/^`{3,}/.test(trimmed)) {
        inFenced = true;
        fenceMarker = "`";
        codeLines.add(i); // fence opener line is part of the block
      } else if (/^~{3,}/.test(trimmed)) {
        inFenced = true;
        fenceMarker = "~";
        codeLines.add(i);
      } else if (
        /^ {4}/.test(line) &&
        (i === 0 || lines[i - 1].trim() === "")
      ) {
        // Indented code block: 4+ leading spaces preceded by blank line
        codeLines.add(i);
        let j = i + 1;
        while (j < lines.length && /^ {4}/.test(lines[j])) {
          codeLines.add(j);
          j++;
        }
      }
    } else {
      codeLines.add(i);
      const isClose =
        (fenceMarker === "`" && /^`{3,}/.test(trimmed)) ||
        (fenceMarker === "~" && /^~{3,}/.test(trimmed));
      if (isClose) {
        inFenced = false;
        fenceMarker = "";
      }
    }
  }

  return codeLines;
}

/**
 * Simple tokenizer that splits on spaces while respecting "quoted strings".
 */
function tokenizePayload(str: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  const n = str.length;

  while (i < n) {
    // skip spaces
    while (i < n && str[i] === " ") i++;
    if (i >= n) break;

    if (str[i] === '"') {
      // quoted token — collect until closing quote (or end of string)
      i++; // skip opening quote
      let tok = "";
      while (i < n && str[i] !== '"') {
        tok += str[i++];
      }
      if (i < n) i++; // skip closing quote
      tokens.push(tok);
    } else {
      // unquoted token — collect until space
      let tok = "";
      while (i < n && str[i] !== " ") {
        tok += str[i++];
      }
      tokens.push(tok);
    }
  }

  return tokens;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Determine whether the line at `lineIndex` falls inside a fenced or indented
 * code block, so that comment extraction can skip it.
 */
export function isInsideCodeBlock(lines: string[], lineIndex: number): boolean {
  return buildCodeBlockSet(lines).has(lineIndex);
}

/**
 * Extract a single BriefTag from a comment string (the raw HTML comment body,
 * with or without <!-- --> delimiters), or return null if not a recognised
 * brief: tag. The returned tag has associatedLine set to 0; the caller must
 * overwrite it with the real line number.
 */
export function extractBriefTag(comment: string): BriefTag | null {
  // Strip <!-- --> delimiters when present
  let body = comment;
  const stripped = body.trim();
  if (stripped.startsWith("<!--")) {
    body = stripped.slice(4);
    // strip trailing -->
    const closerIdx = body.lastIndexOf("-->");
    if (closerIdx !== -1) {
      body = body.slice(0, closerIdx);
    }
  }

  // Normalise internal whitespace
  body = body.replace(/\s+/g, " ").trim();

  if (!body.startsWith("brief:")) return null;

  const tokens = tokenizePayload(body);
  if (tokens.length === 0) return null;

  const tagType = tokens[0];

  if (tagType === "brief:ontology") {
    // brief:ontology {pack} {id} "{label}"
    if (tokens.length >= 4) {
      const tag: OntologyTag = {
        type: "ontology",
        pack: tokens[1],
        entryId: tokens[2],
        label: tokens[3],
        associatedLine: 0,
      };
      return tag;
    }
    // malformed — treat as unknown
    const tag: UnknownBriefTag = {
      type: "unknown",
      raw: body,
      associatedLine: 0,
    };
    return tag;
  }

  if (tagType === "brief:ref-link") {
    // brief:ref-link {pack} {id}
    if (tokens.length >= 3) {
      const tag: RefLinkTag = {
        type: "ref-link",
        pack: tokens[1],
        entryId: tokens[2],
        associatedLine: 0,
      };
      return tag;
    }
    const tag: UnknownBriefTag = {
      type: "unknown",
      raw: body,
      associatedLine: 0,
    };
    return tag;
  }

  if (tagType === "brief:has-exception") {
    // brief:has-exception "{title}" {date}
    if (tokens.length >= 3) {
      const tag: ExceptionTag = {
        type: "has-exception",
        title: tokens[1],
        date: tokens[2],
        associatedLine: 0,
      };
      return tag;
    }
    const tag: UnknownBriefTag = {
      type: "unknown",
      raw: body,
      associatedLine: 0,
    };
    return tag;
  }

  // Unknown brief: prefix type
  const tag: UnknownBriefTag = {
    type: "unknown",
    raw: body,
    associatedLine: 0,
  };
  return tag;
}

/**
 * Parse all HTML comments in a BRIEF.md file, extracting recognised brief:
 * tags and returning the cleaned content with recognised comments removed.
 *
 * Uses a character-by-character state machine (O(n), ReDoS-immune).
 * Malformed or unclosed comments are silently ignored.
 * Comments inside code blocks are skipped (PARSE-15, PARSE-20).
 */
export function parseComments(input: string): CommentParseResult {
  // Enforce size limit (SEC-17)
  if (Buffer.byteLength(input, "utf8") > MAX_FILE_SIZE) {
    throw new Error("Input exceeds maximum file size limit of 10 MB");
  }

  if (input.length === 0) {
    return { tags: [], content: "" };
  }

  const lines = input.split("\n");
  const codeBlockLines = buildCodeBlockSet(lines);

  // Pre-compute paragraph line numbers for tag association (1-indexed).
  // A paragraph line is non-empty, not inside a code block, and not a heading.
  const paraLineNums: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (codeBlockLines.has(i)) continue;
    const t = lines[i].trim();
    if (t.length > 0 && !t.startsWith("#")) {
      paraLineNums.push(i + 1); // 1-indexed line numbers
    }
  }

  /** Return the last paragraph line before the given line number. */
  function getAssociatedLine(commentLine: number): number {
    let assoc = 0;
    for (const pl of paraLineNums) {
      if (pl < commentLine) assoc = pl;
      else break;
    }
    return assoc;
  }

  // -------------------------------------------------------------------------
  // State-machine scanner
  // -------------------------------------------------------------------------
  type State =
    | "TEXT"
    | "OPEN_BANG"
    | "OPEN_DASH1"
    | "OPEN_DASH2"
    | "COMMENT_BODY"
    | "CLOSE_DASH1"
    | "CLOSE_DASH2";

  let state: State = "TEXT";
  let commentBody = "";
  let commentStartLine = 1; // 1-indexed
  let potentialStart = 0; // position of the '<' that started the candidate comment
  let lineNum = 1; // 1-indexed: first line is line 1

  const tags: BriefTag[] = [];
  const contentParts: string[] = [];
  let segStart = 0; // start of current non-removed content segment

  const n = input.length;

  for (let i = 0; i < n; i++) {
    const ch = input[i];
    if (ch === "\n") lineNum++;

    switch (state) {
      case "TEXT":
        if (ch === "<") {
          potentialStart = i;
          state = "OPEN_BANG";
        }
        break;

      case "OPEN_BANG":
        if (ch === "!") {
          state = "OPEN_DASH1";
        } else if (ch === "<") {
          // Restart: new '<' may begin a comment
          potentialStart = i;
          // stay in OPEN_BANG
        } else {
          state = "TEXT";
        }
        break;

      case "OPEN_DASH1":
        if (ch === "-") {
          state = "OPEN_DASH2";
        } else if (ch === "<") {
          potentialStart = i;
          state = "OPEN_BANG";
        } else {
          state = "TEXT";
        }
        break;

      case "OPEN_DASH2":
        if (ch === "-") {
          // Confirmed <!-- — enter comment body
          state = "COMMENT_BODY";
          commentBody = "";
          commentStartLine = lineNum;
        } else if (ch === "<") {
          potentialStart = i;
          state = "OPEN_BANG";
        } else {
          state = "TEXT";
        }
        break;

      case "COMMENT_BODY":
        if (ch === "-") {
          state = "CLOSE_DASH1";
        } else {
          commentBody += ch;
        }
        break;

      case "CLOSE_DASH1":
        if (ch === "-") {
          state = "CLOSE_DASH2";
        } else {
          // False alarm — the '-' was body content
          commentBody += "-";
          commentBody += ch;
          state = "COMMENT_BODY";
        }
        break;

      case "CLOSE_DASH2":
        if (ch === ">") {
          // Found --> — comment ends
          const commentEndPos = i + 1;

          if (!codeBlockLines.has(commentStartLine - 1)) {
            // codeBlockLines is 0-indexed
            // Normalise whitespace before payload parsing
            const normalizedBody = commentBody.replace(/\s+/g, " ").trim();
            const tag = extractBriefTag(normalizedBody);

            if (tag !== null) {
              const assocLine = getAssociatedLine(commentStartLine);
              const tagWithLine: BriefTag = Object.assign({}, tag, {
                associatedLine: assocLine,
              });

              // Only remove known structured brief: tags from content.
              // Unknown brief: types and non-brief comments stay in content.
              if (tagWithLine.type !== "unknown") {
                contentParts.push(input.slice(segStart, potentialStart));
                segStart = commentEndPos;
              }
              tags.push(tagWithLine);
            }
          }

          state = "TEXT";
          commentBody = "";
        } else if (ch === "-") {
          // Another dash: carry one '-' to body, remain watching for '-->'
          commentBody += "-";
          // stay in CLOSE_DASH2
        } else {
          // '--' was body content, not a closer
          commentBody += "--";
          commentBody += ch;
          state = "COMMENT_BODY";
        }
        break;
    }
  }

  // Unclosed comment at EOF: silently discard per PARSE-20 lenient rules.
  // Collect remaining content after last removed comment (or all content).
  contentParts.push(input.slice(segStart));

  return {
    tags,
    content: contentParts.join(""),
  };
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
