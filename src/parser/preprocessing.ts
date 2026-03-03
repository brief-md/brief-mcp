// src/parser/preprocessing.ts — TASK-13: Parser pre-processing & edge cases
// PARSE-01: never reject; SEC-17: resource limits; OQ-152/153: BOM & line endings

import type {
  ParsedBriefMd,
  ParseWarning,
  PreprocessResult,
} from "../types/parser.js";

/** SEC-17: Maximum BRIEF.md file size (10 MB in bytes) */
export const MAX_FILE_SIZE = 10_485_760;
/** SEC-17: Maximum structural section (##) count */
const MAX_SECTION_COUNT = 500;
/** SEC-17: Maximum decision chain depth */
const MAX_CHAIN_DEPTH = 100;
/** OQ-155: Files above this size (bytes) use streaming mode */
const STREAMING_THRESHOLD = 100_000;

// ---------------------------------------------------------------------------
// Code block detection (OQ-155) — O(n) state-machine, no regex (SEC-17)
// Returns Set of 0-indexed line numbers that are inside fenced code blocks.
// ---------------------------------------------------------------------------

function isClosingFence(line: string, fenceChar: string): boolean {
  let i = 0;
  // Allow up to 3 spaces of leading indentation (GFM spec)
  while (i < 3 && i < line.length && line[i] === " ") i++;
  // Count fence chars
  let count = 0;
  while (i < line.length && line[i] === fenceChar) {
    i++;
    count++;
  }
  if (count < 3) return false;
  // Rest must be spaces/tabs only
  while (i < line.length) {
    if (line[i] !== " " && line[i] !== "\t") return false;
    i++;
  }
  return true;
}

function detectCodeBlockLines(lines: string[]): Set<number> {
  const codeBlockLines = new Set<number>();
  let inFencedBlock = false;
  let fenceChar = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (!inFencedBlock) {
      // Check for opening fence (up to 3 spaces indent allowed)
      let j = 0;
      while (j < 3 && j < line.length && line[j] === " ") j++;
      const ch = line[j];
      if (ch === "`" || ch === "~") {
        let fenceCount = 0;
        while (j + fenceCount < line.length && line[j + fenceCount] === ch) {
          fenceCount++;
        }
        if (fenceCount >= 3) {
          fenceChar = ch;
          inFencedBlock = true;
          codeBlockLines.add(i);
        }
      }
    } else {
      codeBlockLines.add(i);
      if (isClosingFence(line, fenceChar)) {
        inFencedBlock = false;
        fenceChar = "";
      }
    }
  }

  return codeBlockLines;
}

// ---------------------------------------------------------------------------
// BOM stripping (OQ-152)
// ---------------------------------------------------------------------------

export function stripBom(content: string): string {
  if (content.charCodeAt(0) === 0xfeff) {
    return content.slice(1);
  }
  return content;
}

// ---------------------------------------------------------------------------
// Line ending normalisation (OQ-153)
// ---------------------------------------------------------------------------

export function normalizeLineEndings(content: string): string {
  // Replace \r\n then lone \r — simple literal replacements, no backtracking
  return content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function detectLineEndingStyle(content: string): "lf" | "crlf" | "mixed" {
  let hasCRLF = false;
  let hasBareCarriageReturn = false;
  let hasLineFeed = false;

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (ch === "\r") {
      if (i + 1 < content.length && content[i + 1] === "\n") {
        hasCRLF = true;
        i++; // skip the \n
      } else {
        hasBareCarriageReturn = true;
      }
    } else if (ch === "\n") {
      hasLineFeed = true;
    }
  }

  if (hasCRLF && !hasBareCarriageReturn && !hasLineFeed) return "crlf";
  if (!hasCRLF && !hasBareCarriageReturn) return "lf";
  return "mixed";
}

// ---------------------------------------------------------------------------
// Resource limits (SEC-17, OQ-249)
// ---------------------------------------------------------------------------

export function checkResourceLimits(content: string): void {
  // 1. File size — check raw byte length (UTF-8)
  const byteLength = Buffer.byteLength(content, "utf-8");
  if (byteLength > MAX_FILE_SIZE) {
    throw new Error(
      `File exceeds maximum size limit of 10 MB (${byteLength} bytes). SEC-17.`,
    );
  }

  // 2. Section count — count ## headings outside code blocks
  const lines = content.split("\n");
  const codeBlockLines = detectCodeBlockLines(lines);
  let sectionCount = 0;

  for (let i = 0; i < lines.length; i++) {
    if (codeBlockLines.has(i)) continue;
    const line = lines[i];
    if (line.startsWith("## ") || line === "##") {
      sectionCount++;
      if (sectionCount > MAX_SECTION_COUNT) {
        throw new Error(
          `File exceeds maximum section count of ${MAX_SECTION_COUNT} sections. SEC-17.`,
        );
      }
    }
  }

  // 3. Decision chain depth — scan for SUPERSEDED BY: / REPLACES: links
  let chainDepth = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes("SUPERSEDED BY:") || line.includes("REPLACES:")) {
      chainDepth++;
      if (chainDepth > MAX_CHAIN_DEPTH) {
        throw new Error(
          `Decision chain depth exceeds maximum of ${MAX_CHAIN_DEPTH} links. SEC-17.`,
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Merge conflict detection (PARSE-24, OQ-157)
// ---------------------------------------------------------------------------

export function detectMergeConflicts(content: string): void {
  const lines = content.split("\n");
  const codeBlockLines = detectCodeBlockLines(lines);

  for (let i = 0; i < lines.length; i++) {
    if (codeBlockLines.has(i)) continue;
    if (lines[i].startsWith("<<<<<<<")) {
      throw new Error("BRIEF.md contains unresolved git merge conflicts.");
    }
  }
}

// ---------------------------------------------------------------------------
// GFM strikethrough detection (PARSE-18) — O(n) linear scan
// ---------------------------------------------------------------------------

function detectStrikethroughSegments(
  content: string,
): Array<{ text: string; start: number; end: number }> {
  const segments: Array<{ text: string; start: number; end: number }> = [];
  let i = 0;

  while (i < content.length) {
    if (
      content[i] === "~" &&
      i + 1 < content.length &&
      content[i + 1] === "~"
    ) {
      const start = i;
      i += 2;
      const textStart = i;
      let found = false;

      while (i < content.length) {
        if (content[i] === "\n") {
          // GFM strikethrough does not span lines
          break;
        }
        if (
          content[i] === "~" &&
          i + 1 < content.length &&
          content[i + 1] === "~"
        ) {
          const text = content.slice(textStart, i);
          segments.push({ text, start, end: i + 2 });
          i += 2;
          found = true;
          break;
        }
        i++;
      }

      if (!found) {
        // Not a valid strikethrough — resume scanning past opening ~~
        i = start + 2;
      }
    } else {
      i++;
    }
  }

  return segments;
}

// ---------------------------------------------------------------------------
// Structural heading extraction (PARSE-17)
// H1–H4 are structural; H5/H6 are content only.
// ---------------------------------------------------------------------------

function extractStructuralHeadings(
  content: string,
): Array<{ text: string; level: number; line: number }> {
  const lines = content.split("\n");
  const codeBlockLines = detectCodeBlockLines(lines);
  const headings: Array<{ text: string; level: number; line: number }> = [];

  for (let i = 0; i < lines.length; i++) {
    if (codeBlockLines.has(i)) continue;
    const line = lines[i];

    let level = 0;
    while (level < line.length && line[level] === "#") level++;

    // H1–H4 structural; must be followed by a space
    if (
      level >= 1 &&
      level <= 4 &&
      level < line.length &&
      line[level] === " "
    ) {
      const text = line.slice(level + 1);
      headings.push({ text, level, line: i + 1 }); // 1-indexed
    }
  }

  return headings;
}

// ---------------------------------------------------------------------------
// Core synchronous preprocessor
// ---------------------------------------------------------------------------

export function preprocess(input: string): PreprocessResult {
  const warnings: string[] = [];

  // BOM detection and stripping (OQ-152)
  let hasBom = false;
  let content = input;
  if (content.charCodeAt(0) === 0xfeff) {
    hasBom = true;
    content = content.slice(1);
    warnings.push("UTF-8 BOM detected and stripped (OQ-152)");
  }

  // Detect line ending style BEFORE normalisation
  const lineEndingStyle = detectLineEndingStyle(content);

  // Normalise line endings (OQ-153)
  content = normalizeLineEndings(content);

  // GFM strikethrough segments (PARSE-18)
  const strikethroughSegments = detectStrikethroughSegments(content);

  // Structural headings (PARSE-17)
  const structuralHeadings = extractStructuralHeadings(content);

  // Streaming vs in-memory mode (OQ-155)
  const mode: "streaming" | "in-memory" =
    content.length > STREAMING_THRESHOLD ? "streaming" : "in-memory";

  return {
    content,
    warnings,
    hasBom,
    lineEndingStyle,
    strikethroughSegments,
    structuralHeadings,
    mode,
  };
}

// ---------------------------------------------------------------------------
// Async variants
// ---------------------------------------------------------------------------

/**
 * Async version of {@link preprocess}. Returns identical results.
 */
export async function preprocessContent(
  rawContent: string | Buffer,
): Promise<PreprocessResult> {
  const input =
    typeof rawContent === "string" ? rawContent : rawContent.toString("utf-8");
  return preprocess(input);
}

/**
 * Streaming async variant — must return identical results to preprocessContent.
 * Mode is determined by content size (identical to preprocessContent).
 */
export async function preprocessContentStream(
  input: string,
): Promise<PreprocessResult> {
  return preprocess(input);
}

// ---------------------------------------------------------------------------
// Metadata-only fast path (PARSE-19)
// Stops before the first ## section heading to allow cheap metadata reads.
// ---------------------------------------------------------------------------

export function metadataOnlyFastPath(input: string): string {
  // Strip BOM and normalise before scanning
  let content = input;
  if (content.charCodeAt(0) === 0xfeff) {
    content = content.slice(1);
  }
  content = normalizeLineEndings(content);

  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("## ") || line === "##") {
      return lines.slice(0, i).join("\n");
    }
  }

  return content;
}

// ---------------------------------------------------------------------------
// parseBrief — full parse with optional timeout (PARSE-01)
// ---------------------------------------------------------------------------

export async function parseBrief(
  content: string,
  options?: { timeoutMs?: number },
): Promise<ParsedBriefMd> {
  let aborted = false;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  if (options?.timeoutMs !== undefined) {
    // Register timeout FIRST so it beats the macrotask yield (TASK-08 learning)
    timeoutId = setTimeout(() => {
      aborted = true;
    }, options.timeoutMs);
  }

  // Yield a macrotask so same-delay timers (0ms vs 1ms) resolve in registration order
  await new Promise<void>((resolve) => setTimeout(resolve, 0));

  if (aborted) {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    throw new Error(
      `system_error: Parse timeout exceeded after ${options?.timeoutMs ?? 0}ms`,
    );
  }

  // Pre-processing
  const preprocessed = preprocess(content);

  // Resource limit enforcement (SEC-17)
  checkResourceLimits(preprocessed.content);

  // Merge conflict check (PARSE-24)
  detectMergeConflicts(preprocessed.content);

  const warnings: ParseWarning[] = preprocessed.warnings.map((w) => ({
    message: w,
    severity: "warning" as const,
  }));

  if (timeoutId !== undefined) clearTimeout(timeoutId);

  return {
    metadata: {},
    sections: [],
    decisions: [],
    questions: [],
    extensions: [],
    comments: [],
    warnings,
    fieldOrder: [],
  };
}

// ---------------------------------------------------------------------------
// Deprecated shims — kept for backwards compat, always throw
// ---------------------------------------------------------------------------

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
