// src/writer/decisions.ts — TASK-15a: Writer — Decision Writing & Supersession

import type { DecisionWriteParams, WriterResult } from "../types/writer.js";

// ─── Zero-Width Unicode ─────────────────────────────────────────────────────

const ZERO_WIDTH_RE = /\u200B|\u200C|\u200D|\uFEFF|\u2060/g;

// ─── normalizeTitleForMatch (DEC-13, OQ-238) ────────────────────────────────

/**
 * Normalize a decision title for fuzzy matching:
 * strips zero-width Unicode, markdown formatting (~~, **, *), heading markers (#),
 * and (superseded) label; then trims and lowercases.
 */
export function normalizeTitleForMatch(title: string): string {
  return title
    .replace(ZERO_WIDTH_RE, "")
    .replace(/[*~#]/g, "")
    .replace(/\s*\(superseded\)\s*/gi, "")
    .trim()
    .toLowerCase();
}

// ─── validateDecisionFields (MCP-03, OQ-162) ────────────────────────────────

/**
 * Validate decision fields. Throws on invalid input.
 * - title: required, 1-500 chars (whitespace-stripped)
 * - when: optional, must be YYYY-MM-DD
 * - why: optional, max 5000 chars
 * - alternatives: optional, each element max 500 chars
 */
export function validateDecisionFields(options: {
  title: string;
  when?: string;
  why?: string;
  alternatives?: string[];
}): void {
  const trimmedTitle = options.title.trim();
  if (trimmedTitle.length > 500) {
    throw new Error(
      `Decision title exceeds the 500 character limit. Got ${trimmedTitle.length} characters.`,
    );
  }
  if (options.when !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(options.when)) {
    throw new Error(
      `Decision date format must be YYYY-MM-DD. Got: "${options.when}"`,
    );
  }
  if (options.why !== undefined && options.why.length > 5000) {
    throw new Error(
      `Decision why exceeds the 5000 character length limit. Got ${options.why.length} characters.`,
    );
  }
  if (options.alternatives !== undefined) {
    for (const alt of options.alternatives) {
      if (alt.length > 500) {
        throw new Error(
          `Each alternatives considered entry must be 500 characters or less. Got ${alt.length} characters.`,
        );
      }
    }
  }
}

// ─── detectCircularChain (DEC-15) ───────────────────────────────────────────

/**
 * Detect circular supersession chains among decisions.
 * Returns { hasCycle, involvedTitles }.
 */
export function detectCircularChain(
  decisions: Array<{ title: string; supersededBy?: string }>,
): { hasCycle: boolean; involvedTitles: string[] } {
  const normToOrig = new Map<string, string>();
  const normToNext = new Map<string, string>();

  for (const d of decisions) {
    const normTitle = normalizeTitleForMatch(d.title);
    if (!normToOrig.has(normTitle)) {
      normToOrig.set(normTitle, d.title);
    }
    if (d.supersededBy !== undefined) {
      normToNext.set(normTitle, normalizeTitleForMatch(d.supersededBy));
    }
  }

  const globalVisited = new Set<string>();

  for (const startNorm of normToOrig.keys()) {
    if (globalVisited.has(startNorm)) continue;

    const path: string[] = [];
    const pathSet = new Set<string>();
    let current: string | undefined = startNorm;

    while (current !== undefined && !globalVisited.has(current)) {
      if (pathSet.has(current)) {
        const cycleIdx = path.indexOf(current);
        const cyclePart = cycleIdx >= 0 ? path.slice(cycleIdx) : path;
        const involvedTitles = cyclePart.map((n) => normToOrig.get(n) ?? n);
        return { hasCycle: true, involvedTitles };
      }
      pathSet.add(current);
      path.push(current);
      current = normToNext.get(current);
    }

    for (const n of path) globalVisited.add(n);
  }

  return { hasCycle: false, involvedTitles: [] };
}

// ─── Internal Types ─────────────────────────────────────────────────────────

interface DecisionEntry {
  rawHeadingText: string;
  normalizedTitle: string;
  isSuperseded: boolean;
  supersededBy?: string;
  headingLineStart: number;
  bodyStart: number;
  bodyEnd: number;
  body: string;
}

interface SectionInfo {
  headingStart: number;
  bodyStart: number;
  bodyEnd: number;
  headingLine: string;
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

function findKeyDecisionsSection(content: string): SectionInfo | undefined {
  const h2Re = /^## (.+?)[ \t]*$/gm;
  let target: { index: number; headingLen: number; text: string } | undefined;
  let nextH2Start = content.length;

  for (let m = h2Re.exec(content); m !== null; m = h2Re.exec(content)) {
    const text = m[1]
      .replace(/\s*\{[^}]*\}$/, "")
      .trim()
      .toLowerCase();
    if (target === undefined) {
      if (text === "key decisions" || text === "decisions") {
        target = {
          index: m.index,
          headingLen: m[0].length,
          text: m[1].replace(/\s*\{[^}]*\}$/, "").trim(),
        };
      }
    } else {
      nextH2Start = m.index;
      break;
    }
  }

  if (target === undefined) return undefined;

  const bodyStart = Math.min(
    target.index + target.headingLen + 1,
    content.length,
  );
  return {
    headingStart: target.index,
    bodyStart,
    bodyEnd: nextH2Start,
    headingLine: `## ${target.text}`,
  };
}

function parseDecisionEntries(
  content: string,
  sectionBodyStart: number,
  sectionBodyEnd: number,
): DecisionEntry[] {
  const entries: DecisionEntry[] = [];
  const h3Re = /^### (.+?)[ \t]*$/gm;
  h3Re.lastIndex = sectionBodyStart;

  const headings: Array<{ index: number; rawLen: number; rawText: string }> =
    [];

  for (
    let m = h3Re.exec(content);
    m !== null && m.index < sectionBodyEnd;
    m = h3Re.exec(content)
  ) {
    const rawText = m[1].replace(/\s*\{[^}]*\}$/, "").trim();
    headings.push({ index: m.index, rawLen: m[0].length, rawText });
  }

  for (let i = 0; i < headings.length; i++) {
    const curr = headings[i];
    const next = headings[i + 1];
    const bodyStart = Math.min(curr.index + curr.rawLen + 1, content.length);
    const bodyEnd = next !== undefined ? next.index : sectionBodyEnd;
    const body = content.slice(bodyStart, bodyEnd);

    const isSuperseded =
      /~~/.test(curr.rawText) || /\(superseded\)/i.test(curr.rawText);

    // Extract SUPERSEDED BY, stripping trailing "(YYYY-MM-DD)" date
    const supMatch = /^SUPERSEDED BY:\s*(.+)$/im.exec(body);
    const supersededByRaw = supMatch !== null ? supMatch[1].trim() : undefined;
    const supersededBy =
      supersededByRaw !== undefined
        ? supersededByRaw.replace(/\s*\(\d{4}-\d{2}-\d{2}\)\s*$/, "").trim()
        : undefined;

    entries.push({
      rawHeadingText: curr.rawText,
      normalizedTitle: normalizeTitleForMatch(curr.rawText),
      isSuperseded,
      supersededBy,
      headingLineStart: curr.index,
      bodyStart,
      bodyEnd,
      body,
    });
  }

  return entries;
}

function formatDecisionBlock(options: {
  title: string;
  why: string;
  when: string;
  alternatives?: string[];
  replaces?: string;
}): string {
  const lines: string[] = [
    `### ${options.title}`,
    `WHAT: ${options.title}`,
    `WHY: ${options.why}`,
    `WHEN: ${options.when}`,
  ];
  if (options.alternatives !== undefined && options.alternatives.length > 0) {
    lines.push(`ALTERNATIVES CONSIDERED: ${options.alternatives.join(", ")}`);
  }
  if (options.replaces !== undefined) {
    lines.push(`REPLACES: ${options.replaces}`);
  }
  return lines.join("\n");
}

function applyTimestamp(content: string, date: string): string {
  return content.replace(/^(\*\*Updated:\*\*[ \t]*)(.*)$/m, `$1${date}`);
}

function finalizeContent(
  content: string,
  originalLineEnding: "CRLF" | "LF",
): string {
  let result = `${content.replace(/[\r\n]+$/, "")}\n`;
  if (originalLineEnding === "CRLF") {
    result = result.replace(/\n/g, "\r\n");
  }
  return result;
}

function appendToSection(
  normalized: string,
  section: SectionInfo,
  block: string,
): string {
  const existingBody = normalized.slice(section.bodyStart, section.bodyEnd);
  const trimmedBody = existingBody.trimEnd();
  const insertAt = section.bodyStart + trimmedBody.length;
  const beforeInsert = normalized.slice(0, insertAt);
  const afterSection = normalized.slice(section.bodyEnd).replace(/^\n+/, "");
  const separator = trimmedBody ? "\n\n" : "\n";
  const trailingSep = afterSection ? "\n\n" : "\n";
  return beforeInsert + separator + block + trailingSep + afterSection;
}

// ─── addDecision (DEC-05) ───────────────────────────────────────────────────

/**
 * Add a new decision to the Key Decisions section.
 * Returns { content, warnings }.
 */
export async function addDecision(
  inputContent: string,
  params: {
    title: string;
    why: string;
    when?: string;
    alternatives?: string[];
  },
): Promise<{ content: string; warnings: string[] }> {
  validateDecisionFields({
    title: params.title,
    when: params.when,
    why: params.why,
    alternatives: params.alternatives,
  });

  const warnings: string[] = [];
  const today = new Date().toISOString().slice(0, 10);
  const date = params.when ?? today;

  const le = /\r\n/.test(inputContent) ? "CRLF" : "LF";
  const normalized = inputContent.replace(/\r\n/g, "\n");

  const section = findKeyDecisionsSection(normalized);

  if (section !== undefined) {
    const entries = parseDecisionEntries(
      normalized,
      section.bodyStart,
      section.bodyEnd,
    );
    const normNew = normalizeTitleForMatch(params.title);
    const dup = entries.find(
      (e) => !e.isSuperseded && e.normalizedTitle === normNew,
    );
    if (dup !== undefined) {
      warnings.push(
        `Warning: duplicate active decision title "${dup.rawHeadingText}" already exists.`,
      );
    }
  }

  const block = formatDecisionBlock({
    title: params.title,
    why: params.why,
    when: date,
    alternatives: params.alternatives,
  });

  let result: string;

  if (section !== undefined) {
    result = appendToSection(normalized, section, block);
  } else {
    const trimmed = normalized.replace(/\n+$/, "");
    result = `${trimmed}\n\n## Key Decisions\n\n${block}\n`;
  }

  result = applyTimestamp(result, today);
  result = finalizeContent(result, le);

  return { content: result, warnings };
}

// ─── supersedeDecision (DEC-01, DEC-11, DEC-13, DEC-14, WRITE-13) ───────────

/**
 * Supersede an existing decision with a new one.
 * Old decision: strikethrough + (superseded) + SUPERSEDED BY field.
 * New decision: REPLACES field.
 * Returns { content }.
 */
export async function supersedeDecision(
  inputContent: string,
  params: {
    title: string;
    why: string;
    replaces: string;
    sourceFile?: string;
  },
): Promise<{ content: string }> {
  if (params.sourceFile !== undefined) {
    throw new Error(
      `Decision not found: supersession is single-file scope only. Cannot reference decisions from "${params.sourceFile}".`,
    );
  }

  const le = /\r\n/.test(inputContent) ? "CRLF" : "LF";
  let normalized = inputContent.replace(/\r\n/g, "\n");
  const today = new Date().toISOString().slice(0, 10);

  const section = findKeyDecisionsSection(normalized);
  if (section === undefined) {
    throw new Error(
      `Decision not found: no Key Decisions section in this file. Supersession is single-file scope only.`,
    );
  }

  const entries = parseDecisionEntries(
    normalized,
    section.bodyStart,
    section.bodyEnd,
  );

  const normTarget = normalizeTitleForMatch(params.replaces);
  const matches = entries.filter(
    (e) =>
      e.normalizedTitle === normTarget ||
      e.normalizedTitle.includes(normTarget) ||
      normTarget.includes(e.normalizedTitle),
  );

  if (matches.length === 0) {
    throw new Error(
      `Decision not found: no match for "${params.replaces}" in this file. Supersession is single-file scope only.`,
    );
  }

  if (matches.length > 1) {
    const matchList = matches.map((m) => `"${m.rawHeadingText}"`).join(", ");
    throw new Error(
      `Multiple decisions match "${params.replaces}": ${matchList}. Disambiguation required.`,
    );
  }

  const target = matches[0];

  if (target.isSuperseded) {
    // Traverse chain to find current active head (DEC-11)
    let headTitle = target.supersededBy ?? params.replaces;
    let iterations = 0;
    while (iterations < 100) {
      const normHead = normalizeTitleForMatch(headTitle);
      const headEntry = entries.find((e) => e.normalizedTitle === normHead);
      if (headEntry === undefined || !headEntry.isSuperseded) break;
      headTitle = headEntry.supersededBy ?? headTitle;
      iterations++;
    }
    throw new Error(
      `Decision "${params.replaces}" is already superseded by "${headTitle}". Supersede the current active decision instead.`,
    );
  }

  // Build clean old title (strip any existing markdown from heading)
  const cleanOldTitle = target.rawHeadingText
    .replace(/~~([^~]*)~~/g, "$1")
    .replace(/\s*\(superseded\)\s*/gi, "")
    .trim();

  // New heading: strikethrough + (superseded) label (DEC-01, WRITE-13)
  const newOldHeading = `### ~~${cleanOldTitle}~~ (superseded)`;

  // Add SUPERSEDED BY field, preserving body structure (WRITE-13)
  const trailingMatch = target.body.match(/\n+$/);
  const trailingNewlines = trailingMatch !== null ? trailingMatch[0] : "\n";
  const bodyWithoutTrailing = target.body.slice(
    0,
    target.body.length - trailingNewlines.length,
  );
  const supersededByLine = `SUPERSEDED BY: ${params.title} (${today})`;
  const newOldBody = bodyWithoutTrailing
    ? `${bodyWithoutTrailing}\n${supersededByLine}${trailingNewlines}`
    : `${supersededByLine}\n`;

  const oldDecisionBlock = `${newOldHeading}\n${newOldBody}`;

  // Replace old decision in content
  const beforeOld = normalized.slice(0, target.headingLineStart);
  const afterOld = normalized.slice(target.bodyEnd);
  normalized = beforeOld + oldDecisionBlock + afterOld;

  // Re-find section boundaries after modification
  const sectionAfterEdit = findKeyDecisionsSection(normalized);
  const sectionForAppend: SectionInfo = sectionAfterEdit ?? {
    headingStart: 0,
    bodyStart: 0,
    bodyEnd: normalized.length,
    headingLine: "## Key Decisions",
  };

  // Append new decision with REPLACES field (DEC-01)
  // Use minimal format: heading + rationale paragraph + REPLACES
  const newBlockLines: string[] = [`### ${params.title}`];
  if (params.why.trim()) {
    newBlockLines.push(params.why);
  }
  newBlockLines.push(`REPLACES: ${cleanOldTitle}`);
  const newBlock = newBlockLines.join("\n");

  normalized = appendToSection(normalized, sectionForAppend, newBlock);

  // Update Updated timestamp
  normalized = applyTimestamp(normalized, today);
  normalized = finalizeContent(normalized, le);

  return { content: normalized };
}

// ─── Deprecated Shims ──────────────────────────────────────────────────────

/** @deprecated Use addDecision instead */
export async function writeNewDecision(
  _filePath: string,
  _params: DecisionWriteParams,
  _options?: { force?: boolean },
): Promise<WriterResult> {
  throw new Error("Not implemented: writeNewDecision (deprecated)");
}

/** @deprecated Use supersedeDecision instead */
export async function writeDecisionSupersession(
  _filePath: string,
  _newDecision: DecisionWriteParams,
  _replacesTitle: string,
): Promise<WriterResult> {
  throw new Error("Not implemented: writeDecisionSupersession (deprecated)");
}

/** @deprecated Use normalizeTitleForMatch instead */
export function normalizeDecisionTitle(_title: string): string {
  throw new Error("Not implemented: normalizeDecisionTitle (deprecated)");
}
