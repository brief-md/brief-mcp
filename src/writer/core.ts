// src/writer/core.ts — TASK-14: Writer — Core Write Engine

import { acquireLock, atomicWriteFile, readFileSafe } from "../io/file-io.js";
import type { ParsedBriefMd } from "../types/parser.js";
import type { WriteOperation, WriterResult } from "../types/writer.js";

// ─── Section Alias Map (WRITE-01) ────────────────────────────────────────────

const SECTION_ALIASES = new Map<string, string>([
  ["background & context", "Background & Context"],
  ["background and context", "Background & Context"],
  ["background", "Background & Context"],
  ["context", "Background & Context"],
  ["decisions", "Decisions"],
  ["decision", "Decisions"],
  ["open questions", "Open Questions"],
  ["open question", "Open Questions"],
  ["questions", "Open Questions"],
  ["question", "Open Questions"],
  ["constraints", "Constraints"],
  ["constraint", "Constraints"],
  ["references", "References"],
  ["reference", "References"],
  ["session notes", "Session Notes"],
  ["session note", "Session Notes"],
  ["notes", "Session Notes"],
]);

// ─── Internal Types ───────────────────────────────────────────────────────────

interface SectionBounds {
  headingStart: number; // char offset of first char of heading line (LF-normalised)
  bodyStart: number; // char offset after the heading's trailing \n
  bodyEnd: number; // exclusive end: next heading's headingStart or content.length
  headingText: string; // heading text (attributes stripped, trimmed)
  level: number; // number of leading # chars
}

// ─── Internal Helpers ─────────────────────────────────────────────────────────

function toTitleCase(str: string): string {
  return str.replace(/\b\w/g, (c) => c.toUpperCase());
}

function resolveCanonicalName(name: string, existingText?: string): string {
  const lower = name.toLowerCase().trim();
  const fromAlias = SECTION_ALIASES.get(lower);
  if (fromAlias !== undefined) return fromAlias;
  // Apply title-case as canonical fallback for unknown section names
  return toTitleCase(existingText ?? name);
}

/** Parse section boundaries from LF-normalised content. */
function findSections(content: string): SectionBounds[] {
  const headingRegex = /^(#{1,3}) (.+?)[ \t]*$/gm;
  const matches: Array<{
    index: number;
    rawLen: number;
    level: number;
    text: string;
  }> = [];

  for (
    let m = headingRegex.exec(content);
    m !== null;
    m = headingRegex.exec(content)
  ) {
    // Strip heading attributes like {.class} and trim
    const rawText = (m[2] ?? "").replace(/\s*\{[^}]*\}$/, "").trim();
    matches.push({
      index: m.index,
      rawLen: m[0].length,
      level: m[1].length,
      text: rawText,
    });
  }

  const result: SectionBounds[] = [];
  for (let i = 0; i < matches.length; i++) {
    const curr = matches[i];
    const next = matches[i + 1];
    const headingLineEnd = curr.index + curr.rawLen;
    // Body starts after the \n that follows the heading line
    const bodyStart =
      headingLineEnd < content.length ? headingLineEnd + 1 : headingLineEnd;
    const bodyEnd = next !== undefined ? next.index : content.length;
    result.push({
      headingStart: curr.index,
      bodyStart,
      bodyEnd,
      headingText: curr.text,
      level: curr.level,
    });
  }
  return result;
}

function findMatchingSection(
  sections: SectionBounds[],
  sectionName: string,
): SectionBounds | undefined {
  const nameLower = sectionName.toLowerCase().trim();
  const nameCanonical = resolveCanonicalName(sectionName).toLowerCase();

  for (const section of sections) {
    // Direct case-insensitive match
    if (section.headingText.toLowerCase() === nameLower) return section;
    // Canonical resolution match (handles aliases)
    const sectionCanonical = resolveCanonicalName(
      section.headingText,
    ).toLowerCase();
    if (sectionCanonical === nameCanonical) return section;
  }
  return undefined;
}

function updateTimestamp(content: string, date: string): string {
  return content.replace(/^(\*\*Updated:\*\*[ \t]*)(.*)$/m, `$1${date}`);
}

/**
 * Format the body block for a section being written.
 * Returns '\n\n{trimmedContent}\n' for non-empty, '\n' for empty.
 * The leading \n terminates the heading line; the second \n is the blank line.
 */
function formatSectionBody(newContent: string): string {
  const trimmed = newContent.trimEnd();
  if (!trimmed) return "\n";
  return "\n\n" + trimmed + "\n";
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Detect whether content uses CRLF or LF line endings.
 * Returns "CRLF" or "LF" (uppercase).
 */
export function detectLineEnding(content: string): "CRLF" | "LF" {
  const crlfCount = (content.match(/\r\n/g) ?? []).length;
  if (crlfCount === 0) return "LF";
  const totalLf = (content.match(/\n/g) ?? []).length;
  const loneLf = totalLf - crlfCount;
  return crlfCount > loneLf ? "CRLF" : "LF";
}

/**
 * Ensure content ends with exactly one trailing newline.
 * Collapses multiple trailing newline characters to a single \n.
 */
export function ensureTrailingNewline(content: string): string {
  return content.replace(/[\r\n]+$/, "") + "\n";
}

/**
 * Write new content into a specific section of a BRIEF.md content string.
 * Byte-for-byte preservation of untouched sections. Updates **Updated:** timestamp.
 * Returns { content, warnings }.
 */
export async function writeSection(
  input: string,
  sectionName: string,
  newContent: string,
  options?: { simulateCrash?: boolean; filePath?: string },
): Promise<{ content: string; warnings: string[] }> {
  const warnings: string[] = [];

  // Detect line ending style for round-trip restoration (WRITE-06)
  const le = detectLineEnding(input);

  // Normalise to LF for all string operations
  const normalized = input.replace(/\r\n/g, "\n");

  // Find sections and locate the target
  const sections = findSections(normalized);
  const target = findMatchingSection(sections, sectionName);

  let result: string;

  if (target !== undefined) {
    // Modify existing section — preserve all surrounding content verbatim (WRITE-02)
    const canonicalHeading = resolveCanonicalName(
      sectionName,
      target.headingText,
    );
    const headingLine = "#".repeat(target.level) + " " + canonicalHeading;
    const before = normalized.slice(0, target.headingStart);
    const after = normalized.slice(target.bodyEnd);
    const bodyContent = formatSectionBody(newContent);
    result = before + headingLine + bodyContent + after;
  } else {
    // Section not found — append as new section at end
    const canonicalHeading = resolveCanonicalName(sectionName);
    const headingLine = "## " + canonicalHeading;
    const trimmed = normalized.replace(/\n+$/, "");
    const bodyContent = formatSectionBody(newContent);
    result = trimmed + "\n\n" + headingLine + bodyContent;
  }

  // Update **Updated:** timestamp (WRITE-03)
  const today = new Date().toISOString().slice(0, 10);
  result = updateTimestamp(result, today);

  // Ensure exactly one trailing newline
  result = ensureTrailingNewline(result);

  // Restore original line ending style (WRITE-06)
  if (le === "CRLF") {
    result = result.replace(/\n/g, "\r\n");
  }

  // Content structure warning (WRITE-19)
  if (/^# /m.test(newContent)) {
    warnings.push(
      "Content contains top-level heading(s) which may affect document structure.",
    );
  }

  // Atomic file write when filePath provided, unless simulating a crash (WRITE-04)
  if (options?.filePath !== undefined && !options.simulateCrash) {
    await atomicWriteFile(options.filePath, result);
  }

  return { content: result, warnings };
}

/**
 * Create a new BRIEF.md file content string from project metadata.
 * Metadata in canonical order: Project, Type, Extensions, Status, Created, Updated, Ontologies, Version.
 * Returns the full file content as a string (always LF line endings).
 */
export async function createNewFile(params: {
  project: string;
  type: string;
  sectionContent?: Record<string, string>;
}): Promise<string> {
  const today = new Date().toISOString().slice(0, 10);

  // Metadata in canonical order (WRITE-11)
  const metaLines = [
    `**Project:** ${params.project}`,
    `**Type:** ${params.type}`,
    `**Extensions:**`,
    `**Status:** active`,
    `**Created:** ${today}`,
    `**Updated:** ${today}`,
    `**Ontologies:**`,
    `**Version:** 1`,
    "",
  ];

  let content = metaLines.join("\n");

  if (params.sectionContent) {
    for (const [sectionName, body] of Object.entries(params.sectionContent)) {
      const canonical = resolveCanonicalName(sectionName);
      const bodyContent = formatSectionBody(body);
      content += "\n## " + canonical + bodyContent;
    }
  }

  // New files always use LF (WRITE-06)
  return ensureTrailingNewline(content);
}

/**
 * Read a specific section from a BRIEF.md file on disk.
 * Returns { content } with the section body text (trimmed).
 */
export async function readBriefSection(
  filePath: string,
  sectionName: string,
): Promise<{ content: string }> {
  const raw = await readFileSafe(filePath);
  const normalized = raw.replace(/\r\n/g, "\n");
  const sections = findSections(normalized);
  const target = findMatchingSection(sections, sectionName);
  if (!target) return { content: "" };
  const body = normalized.slice(target.bodyStart, target.bodyEnd);
  // Strip only structural leading/trailing newlines, not content whitespace
  return { content: body.replace(/^\n+/, "").replace(/\n+$/, "") };
}

/**
 * Write a specific section to a BRIEF.md file on disk.
 * Creates the file if it does not exist.
 * Returns { success, content? }.
 */
export async function writeBriefSection(
  filePath: string,
  sectionName: string,
  content: string,
): Promise<{ success: boolean; content?: string }> {
  let lock: (() => void) | undefined;
  try {
    lock = await acquireLock(filePath);

    let raw: string;
    try {
      raw = await readFileSafe(filePath);
    } catch {
      // File does not exist — bootstrap with minimal BRIEF.md structure
      raw = await createNewFile({ project: "", type: "" });
    }

    const result = await writeSection(raw, sectionName, content);
    await atomicWriteFile(filePath, result.content);
    return { success: true, content: result.content };
  } catch {
    return { success: false };
  } finally {
    lock?.();
  }
}

// ─── Deprecated Shims ─────────────────────────────────────────────────────────

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
export function detectLineEndingStyle(content: string): "lf" | "crlf" {
  return detectLineEnding(content).toLowerCase() as "lf" | "crlf";
}
