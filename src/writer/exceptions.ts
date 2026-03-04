// src/writer/exceptions.ts — TASK-15b: Writer — Exceptions, Amendments & Question Resolution

import type { WriterResult } from "../types/writer.js";
import { normalizeTitleForMatch } from "./decisions.js";

// ---------------------------------------------------------------------------
// Deprecated interfaces (kept for backward compatibility)
// ---------------------------------------------------------------------------

/** @deprecated */
export interface ExceptionWriteParams {
  readonly title: string;
  readonly exceptionTo: string;
  readonly why?: string;
  readonly when?: string;
  readonly alternativesConsidered?: string;
}

/** @deprecated */
export interface QuestionResolutionResult extends WriterResult {
  readonly resolved: boolean;
  readonly resolutionSummary: string;
  readonly suggestDecision: boolean;
  readonly wasKeepOpen?: boolean;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function detectLineEnding(content: string): "CRLF" | "LF" {
  return /\r\n/.test(content) ? "CRLF" : "LF";
}

function normalize(content: string): string {
  return content.replace(/\r\n/g, "\n");
}

function finalize(content: string, le: "CRLF" | "LF"): string {
  let result = `${content.replace(/[\r\n]+$/, "")}\n`;
  if (le === "CRLF") {
    result = result.replace(/\n/g, "\r\n");
  }
  return result;
}

function applyTimestamp(content: string, date: string): string {
  return content.replace(/^(\*\*Updated:\*\*[ \t]*)(.*)$/m, `$1${date}`);
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) => {
    const row = new Array<number>(n + 1).fill(0);
    row[0] = i;
    return row;
  });
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[m][n];
}

// ---------------------------------------------------------------------------
// Section & Decision helpers
// ---------------------------------------------------------------------------

interface SectionInfo {
  headingStart: number;
  bodyStart: number;
  bodyEnd: number;
  headingLine: string;
  headingText: string;
}

interface DecisionEntry {
  rawHeadingText: string;
  normalizedTitle: string;
  isSuperseded: boolean;
  headingLineStart: number;
  bodyStart: number;
  bodyEnd: number;
  body: string;
}

// ---------------------------------------------------------------------------
// Full section alias table — mirrors PARSE-03 (ALIAS_MAP + LANG_MAP) in sections.ts.
// WRITE-14: write tools must use identical section resolution logic as the parser.
// Cannot import from parser (ARCH-04), so we duplicate the alias table here.
// ---------------------------------------------------------------------------

/** Maps lowercase alias → canonical section name (identical to parser PARSE-03). */
const SECTION_ALIAS_MAP = new Map<string, string>([
  // Canonical forms (resolve to themselves)
  ["what this is", "What This Is"],
  ["what this is not", "What This Is NOT"],
  ["why this exists", "Why This Exists"],
  ["key decisions", "Key Decisions"],
  ["open questions", "Open Questions"],
  // English built-in aliases (ALIAS_MAP)
  ["what it is", "What This Is"],
  ["description", "What This Is"],
  ["about", "What This Is"],
  ["overview", "What This Is"],
  ["what it is not", "What This Is NOT"],
  ["constraints", "What This Is NOT"],
  ["exclusions", "What This Is NOT"],
  ["not this", "What This Is NOT"],
  ["motivation", "Why This Exists"],
  ["purpose", "Why This Exists"],
  ["reason", "Why This Exists"],
  ["intent", "Why This Exists"],
  ["goal", "Why This Exists"],
  ["decisions", "Key Decisions"],
  ["decisions made", "Key Decisions"],
  ["design decisions", "Key Decisions"],
  ["questions", "Open Questions"],
  ["unresolved", "Open Questions"],
  // German (LANG_MAP)
  ["was das ist", "What This Is"],
  ["was das nicht ist", "What This Is NOT"],
  ["warum es das gibt", "Why This Exists"],
  ["wichtige entscheidungen", "Key Decisions"],
  ["offene fragen", "Open Questions"],
  // French
  ["qu'est-ce que c'est", "What This Is"],
  ["ce que ce n'est pas", "What This Is NOT"],
  ["pourquoi cela existe", "Why This Exists"],
  ["décisions clés", "Key Decisions"],
  ["questions ouvertes", "Open Questions"],
  // Spanish
  ["qué es esto", "What This Is"],
  ["qué no es esto", "What This Is NOT"],
  ["por qué existe", "Why This Exists"],
  ["decisiones clave", "Key Decisions"],
  ["preguntas abiertas", "Open Questions"],
  // Portuguese
  ["o que é isso", "What This Is"],
  ["o que não é", "What This Is NOT"],
  ["por que existe", "Why This Exists"],
  ["decisões principais", "Key Decisions"],
  ["perguntas abertas", "Open Questions"],
  // Japanese
  ["これは何か", "What This Is"],
  ["これでないもの", "What This Is NOT"],
  ["なぜ存在するか", "Why This Exists"],
  ["主要な決定", "Key Decisions"],
  ["未解決の質問", "Open Questions"],
  // Chinese
  ["这是什么", "What This Is"],
  ["这不是什么", "What This Is NOT"],
  ["为何存在", "Why This Exists"],
  ["关键决策", "Key Decisions"],
  ["未解决的问题", "Open Questions"],
  // Korean
  ["이것은 무엇인가", "What This Is"],
  ["이것이 아닌 것", "What This Is NOT"],
  ["왜 존재하는가", "Why This Exists"],
  ["핵심 결정", "Key Decisions"],
  ["미해결 질문", "Open Questions"],
  // Arabic
  ["ما هذا", "What This Is"],
  ["ما ليس هذا", "What This Is NOT"],
  ["لماذا يوجد", "Why This Exists"],
  ["القرارات الرئيسية", "Key Decisions"],
  ["أسئلة مفتوحة", "Open Questions"],
  // Russian
  ["что это такое", "What This Is"],
  ["что это не такое", "What This Is NOT"],
  ["зачем это существует", "Why This Exists"],
  ["ключевые решения", "Key Decisions"],
  ["открытые вопросы", "Open Questions"],
]);

/**
 * Resolve a section alias to its canonical name using the parser's alias table (PARSE-03).
 * Returns the canonical name, or the original alias if not found.
 */
function resolveSectionAlias(alias: string): string {
  const t = alias.toLowerCase().trim();
  return SECTION_ALIAS_MAP.get(t) ?? alias;
}

/**
 * Find a section by alias using PARSE-03 resolution.
 * Resolves both the query alias AND each heading to their canonical forms,
 * so "decisions" matches "## Design Decisions" (both → "Key Decisions").
 */
function findSectionByAlias(
  content: string,
  alias: string,
): SectionInfo | undefined {
  const canonical = resolveSectionAlias(alias).toLowerCase().trim();
  const aliasLower = alias.toLowerCase().trim();
  // Check if the alias ITSELF is decision-like or question-like (even if not in map)
  const isDecisionAlias =
    canonical === "key decisions" || isKeyDecisionsLike(alias);
  const isQuestionAlias =
    canonical === "open questions" || isOpenQuestionsLike(alias);
  return findSectionByPredicate(content, (text) => {
    const t = text.toLowerCase().trim();
    // Direct match with canonical or alias
    if (t === canonical || t === aliasLower) return true;
    // Check if this heading resolves to the same canonical form
    const headingCanonical = resolveSectionAlias(text).toLowerCase().trim();
    if (headingCanonical === canonical) return true;
    // Lenient fallback: if alias looks like decisions/questions, match any heading that does too
    if (isDecisionAlias && isKeyDecisionsLike(text)) return true;
    if (isQuestionAlias && isOpenQuestionsLike(text)) return true;
    return false;
  });
}

/** True if heading looks like Key Decisions (WRITE-14: identical alias matching to parser PARSE-03). */
function isKeyDecisionsLike(text: string): boolean {
  const t = text.toLowerCase().trim();
  const canonical = SECTION_ALIAS_MAP.get(t);
  return (
    canonical === "Key Decisions" ||
    t.includes("decision") ||
    t.includes("choice") ||
    t === "adrs" ||
    t === "adr"
  );
}

/** True if heading looks like Open Questions (main section heading). */
function isOpenQuestionsLike(text: string): boolean {
  const t = text.toLowerCase().trim();
  return (
    t.includes("question") ||
    t.includes("open issue") ||
    t.includes("unresolved") ||
    t.includes("pending")
  );
}

/**
 * True if heading is a SUBSECTION of Open Questions (To Resolve, To Keep Open, Resolved, etc.)
 * These sections are included in the "Open Questions cluster" even when they are H2 level.
 */
function isOQSubsectionHeading(text: string): boolean {
  const t = text.toLowerCase().trim();
  return (
    t.includes("resolve") || t.includes("keep open") || t.includes("keep-open")
  );
}

/**
 * Find the first section (H1 or H2) matching a predicate.
 * Supports both `# Section` and `## Section` heading styles (parser uses #{1,3}).
 */
function findSectionByPredicate(
  content: string,
  predicate: (text: string) => boolean,
): SectionInfo | undefined {
  const headingRe = /^(#{1,2}) (.+?)[ \t]*$/gm;
  let target:
    | { index: number; headingLen: number; text: string; level: number }
    | undefined;
  let nextStart = content.length;

  for (
    let m = headingRe.exec(content);
    m !== null;
    m = headingRe.exec(content)
  ) {
    const raw = m[2].replace(/\s*\{[^}]*\}$/, "").trim();
    const level = m[1].length;
    if (target === undefined) {
      if (predicate(raw)) {
        target = { index: m.index, headingLen: m[0].length, text: raw, level };
      }
    } else {
      // Next heading at same or higher level ends the section
      if (level <= target.level) {
        nextStart = m.index;
        break;
      }
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
    bodyEnd: nextStart,
    headingLine: `## ${target.text}`,
    headingText: target.text,
  };
}

function findKeyDecisionsSection(content: string): SectionInfo | undefined {
  return findSectionByPredicate(content, isKeyDecisionsLike);
}

/**
 * Find the parent H1/H2 section containing an H3 decision matching the given title.
 * Used as fallback when no Key Decisions section exists (WRITE-14).
 */
function findParentSection(
  content: string,
  decisionTitle: string,
): SectionInfo | undefined {
  const normSearch = normalizeTitleForMatch(decisionTitle);
  const headingRe = /^(#{1,3}) (.+?)[ \t]*$/gm;
  const allHeadings: Array<{
    index: number;
    len: number;
    level: number;
    text: string;
  }> = [];
  for (
    let m = headingRe.exec(content);
    m !== null;
    m = headingRe.exec(content)
  ) {
    allHeadings.push({
      index: m.index,
      len: m[0].length,
      level: m[1].length,
      text: m[2].replace(/\s*\{[^}]*\}$/, "").trim(),
    });
  }

  // Find the H3 heading that matches the decision title
  for (let i = 0; i < allHeadings.length; i++) {
    const h = allHeadings[i];
    if (h.level !== 3) continue;
    const normHeading = normalizeTitleForMatch(h.text);
    if (
      normHeading !== normSearch &&
      !normHeading.includes(normSearch) &&
      !normSearch.includes(normHeading)
    )
      continue;

    // Walk backwards to find the parent H1/H2
    for (let j = i - 1; j >= 0; j--) {
      if (allHeadings[j].level <= 2) {
        const parent = allHeadings[j];
        const bodyStart = Math.min(
          parent.index + parent.len + 1,
          content.length,
        );
        // Find end: next heading at same or higher level
        let bodyEnd = content.length;
        for (let k = j + 1; k < allHeadings.length; k++) {
          if (allHeadings[k].level <= parent.level) {
            bodyEnd = allHeadings[k].index;
            break;
          }
        }
        return {
          headingStart: parent.index,
          bodyStart,
          bodyEnd,
          headingLine: `${"#".repeat(parent.level)} ${parent.text}`,
          headingText: parent.text,
        };
      }
    }
  }
  return undefined;
}

/**
 * Find the Open Questions region, extending bodyEnd to include adjacent H2 subsections
 * like "## To Resolve", "## To Keep Open", "## Resolved".
 * This handles BRIEF.md files where subsections are H2 instead of H3.
 */
function findOpenQuestionsRegion(content: string): SectionInfo | undefined {
  // Collect all H2 headings with positions
  const h2Re = /^## (.+?)[ \t]*$/gm;
  const sections: Array<{ index: number; len: number; rawText: string }> = [];
  for (let m = h2Re.exec(content); m !== null; m = h2Re.exec(content)) {
    const raw = m[1].replace(/\s*\{[^}]*\}$/, "").trim();
    sections.push({ index: m.index, len: m[0].length, rawText: raw });
  }

  const oqIdx = sections.findIndex((s) => isOpenQuestionsLike(s.rawText));
  if (oqIdx < 0) return undefined;

  const oq = sections[oqIdx];
  const bodyStart = Math.min(oq.index + oq.len + 1, content.length);

  // Extend bodyEnd to include adjacent H2 OQ subsections (To Resolve, To Keep Open, Resolved)
  let bodyEnd = content.length;
  for (let i = oqIdx + 1; i < sections.length; i++) {
    const t = sections[i].rawText.toLowerCase();
    if (isOQSubsectionHeading(t)) {
      // This H2 section is part of the OQ cluster — include it
    } else {
      bodyEnd = sections[i].index;
      break;
    }
  }

  return {
    headingStart: oq.index,
    bodyStart,
    bodyEnd,
    headingLine: `## ${oq.rawText}`,
    headingText: oq.rawText,
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

    entries.push({
      rawHeadingText: curr.rawText,
      normalizedTitle: normalizeTitleForMatch(curr.rawText),
      isSuperseded,
      headingLineStart: curr.index,
      bodyStart,
      bodyEnd,
      body,
    });
  }

  return entries;
}

function findDecisionsByTitle(
  entries: DecisionEntry[],
  title: string,
): DecisionEntry[] {
  const normSearch = normalizeTitleForMatch(title);
  const exact = entries.filter(
    (e) => !e.isSuperseded && e.normalizedTitle === normSearch,
  );
  if (exact.length > 0) return exact;
  return entries.filter(
    (e) =>
      !e.isSuperseded &&
      (e.normalizedTitle.includes(normSearch) ||
        normSearch.includes(e.normalizedTitle)),
  );
}

function findSubsections(
  content: string,
  sectionBodyStart: number,
  sectionBodyEnd: number,
): Array<{
  headingText: string;
  headingStart: number;
  bodyStart: number;
  bodyEnd: number;
}> {
  const h3Re = /^### (.+?)[ \t]*$/gm;
  h3Re.lastIndex = sectionBodyStart;
  const headings: Array<{ index: number; rawLen: number; text: string }> = [];
  for (
    let m = h3Re.exec(content);
    m !== null && m.index < sectionBodyEnd;
    m = h3Re.exec(content)
  ) {
    headings.push({
      index: m.index,
      rawLen: m[0].length,
      text: m[1].replace(/\s*\{[^}]*\}$/, "").trim(),
    });
  }
  return headings.map((h, i) => {
    const bodyStart = Math.min(h.index + h.rawLen + 1, content.length);
    const bodyEnd =
      i + 1 < headings.length ? headings[i + 1].index : sectionBodyEnd;
    return { headingText: h.text, headingStart: h.index, bodyStart, bodyEnd };
  });
}

// ---------------------------------------------------------------------------
// Question scanning helpers
// ---------------------------------------------------------------------------

interface QuestionItem {
  text: string;
  normalized: string;
  wasKeepOpen: boolean;
  block: string;
  itemStart: number;
  itemEnd: number;
  isPlainItem: boolean;
  hasOptionsOrImpact: boolean;
}

/**
 * Scan the entire Open Questions region line by line, tracking H2/H3 subsection context.
 * This handles structures where subsections are at H2 OR H3 level.
 * BUG-004 fix: plain `- text` items in To Keep Open; broad block collection.
 */
function scanAllQuestions(
  content: string,
  openQSection: SectionInfo,
): QuestionItem[] {
  const results: QuestionItem[] = [];
  const regionContent = content.slice(
    openQSection.bodyStart,
    openQSection.bodyEnd,
  );
  const lines = regionContent.split("\n");

  const lineStarts: number[] = [];
  let pos = 0;
  for (const line of lines) {
    lineStarts.push(pos);
    pos += line.length + 1;
  }

  // Track context as we scan through H2/H3 headings
  let inResolved = false;
  let isToKeepOpen = false;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Detect H2 or H3 subsection heading to update context
    const h2Match = /^## (.+?)[ \t]*$/.exec(line);
    const h3Match = /^### (.+?)[ \t]*$/.exec(line);
    const headingMatch = h2Match ?? h3Match;

    if (headingMatch !== null) {
      const rawText = headingMatch[1].replace(/\s*\{[^}]*\}$/, "").trim();
      const t = rawText.toLowerCase();
      inResolved = t.includes("resolved") && !t.includes("to resolve");
      // "to keep open" or headings containing "keep"/"open" (but not "to resolve")
      isToKeepOpen =
        (t.includes("keep") ||
          (t.includes("open") && !t.includes("resolve"))) &&
        !inResolved;
      i++;
      continue;
    }

    // Skip items in Resolved subsection
    if (inResolved) {
      i++;
      continue;
    }

    // Match unchecked checkbox items
    const checkboxMatch = /^- \[ \] (.+)$/.exec(line);
    // Match plain list items (BUG-004: only in To Keep Open context)
    const plainMatch = isToKeepOpen ? /^- (?!\[)(.+)$/.exec(line) : null;

    let questionText: string | null = null;
    let isPlainItem = false;

    if (checkboxMatch !== null) {
      questionText = checkboxMatch[1].trim();
    } else if (plainMatch !== null) {
      questionText = plainMatch[1].trim();
      isPlainItem = true;
    }

    if (questionText !== null) {
      // Collect block until next question item, heading, or end.
      // BUG-004 fix: do NOT stop at non-indented continuation lines so we capture
      // same-level Options/Impact fields.
      let j = i + 1;
      while (j < lines.length) {
        const nextLine = lines[j];
        // Stop at any heading (H2 or H3)
        if (/^#{2,} /.test(nextLine)) break;
        // Stop at next checkbox item (checked or unchecked)
        if (/^- \[[ x]\]/.test(nextLine)) break;
        // Stop at next plain item in keep-open context
        if (
          isToKeepOpen &&
          /^- (?!\[)/.test(nextLine) &&
          nextLine.trim() !== ""
        )
          break;
        j++;
      }

      const blockStart = lineStarts[i];
      const blockEnd =
        j < lineStarts.length ? lineStarts[j] : regionContent.length;
      const block = regionContent.slice(blockStart, blockEnd);

      // BUG-004 fix: detect Options/Impact anywhere in the block (not just indented)
      const hasOptionsOrImpact =
        /Options:/i.test(block) || /Impact:/i.test(block);

      results.push({
        text: questionText,
        normalized: questionText.toLowerCase().trim(),
        wasKeepOpen: isToKeepOpen,
        block,
        itemStart: openQSection.bodyStart + blockStart,
        itemEnd: openQSection.bodyStart + blockEnd,
        isPlainItem,
        hasOptionsOrImpact,
      });

      i = j;
    } else {
      i++;
    }
  }

  return results;
}

/**
 * Match a question using cascading strategy: exact → substring → fuzzy (Levenshtein ≤ 3).
 * Returns null for no match at all (graceful), throws for ambiguous/close-fuzzy cases. (OQ-215)
 */
function matchQuestion(
  questions: QuestionItem[],
  questionText: string,
): QuestionItem | null {
  const normSearch = questionText.toLowerCase().trim();

  const exact = questions.filter((q) => q.normalized === normSearch);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) {
    const list = exact.map((q) => `"${q.text}"`).join(", ");
    throw new Error(
      `Multiple questions match "${questionText}": ${list}. Disambiguation required.`,
    );
  }

  const substring = questions.filter(
    (q) =>
      q.normalized.includes(normSearch) || normSearch.includes(q.normalized),
  );
  if (substring.length === 1) return substring[0];
  if (substring.length > 1) {
    const list = substring.map((q) => `"${q.text}"`).join(", ");
    throw new Error(
      `Multiple questions match "${questionText}": ${list}. Disambiguation required.`,
    );
  }

  // Fuzzy match (Levenshtein ≤ 3) — throw with suggestion (OQ-215)
  const fuzzy = questions.filter(
    (q) => levenshtein(q.normalized, normSearch) <= 3,
  );
  if (fuzzy.length > 0) {
    const suggestions = fuzzy.map((q) => `"${q.text}"`).join(", ");
    throw new Error(
      `Question not found: "${questionText}". Did you mean: ${suggestions}?`,
    );
  }

  // No match at all — return null for graceful handling (property test: "never throws")
  return null;
}

/**
 * Convert a question block's first line to the resolved (checked) form.
 */
function buildResolvedBlock(block: string, isPlainItem: boolean): string {
  const firstNewline = block.indexOf("\n");
  const firstLine = firstNewline >= 0 ? block.slice(0, firstNewline) : block;
  const rest = firstNewline >= 0 ? block.slice(firstNewline) : "";

  let newFirstLine: string;
  if (isPlainItem) {
    newFirstLine = firstLine.replace(/^- (?!\[)/, "- [x] ");
  } else {
    newFirstLine = firstLine.replace(/^- \[ \] /, "- [x] ");
  }

  return newFirstLine + rest;
}

/**
 * Check if the OQ region uses H2-level subsections.
 * Used to determine whether to create "## Resolved" or "### Resolved".
 */
function regionUsesH2Subsections(
  content: string,
  regionBodyStart: number,
  regionBodyEnd: number,
): boolean {
  const h2Re = /^## (.+?)[ \t]*$/gm;
  h2Re.lastIndex = regionBodyStart;
  const m = h2Re.exec(content);
  return m !== null && m.index < regionBodyEnd;
}

/**
 * Insert a resolved block into the Resolved subsection (creating it if absent).
 * Handles both H2 ("## Resolved") and H3 ("### Resolved") subsection styles.
 */
function insertIntoResolved(
  content: string,
  openQSection: SectionInfo,
  block: string,
): string {
  const { bodyStart, bodyEnd } = openQSection;

  // Look for existing "Resolved" subsection at H3 level (### Resolved)
  const h3Re = /^### Resolved[ \t]*$/gm;
  h3Re.lastIndex = bodyStart;
  const h3Match = h3Re.exec(content);

  if (h3Match !== null && h3Match.index < bodyEnd) {
    // Find body of this H3 subsection
    const subBodyStart = Math.min(
      h3Match.index + h3Match[0].length + 1,
      content.length,
    );
    // Find end: next ### or ## heading, or bodyEnd
    const endRe = /^#{2,} /gm;
    endRe.lastIndex = subBodyStart;
    const endMatch = endRe.exec(content);
    const subBodyEnd =
      endMatch !== null && endMatch.index < bodyEnd ? endMatch.index : bodyEnd;

    const existingBody = content.slice(subBodyStart, subBodyEnd);
    const trimmedBody = existingBody.trimEnd();
    const insertAt = subBodyStart + trimmedBody.length;
    const after = content.slice(subBodyEnd).replace(/^\n+/, "");
    const separator = trimmedBody ? "\n\n" : "\n";
    const trailingSep = after ? "\n\n" : "\n";
    return content.slice(0, insertAt) + separator + block + trailingSep + after;
  }

  // Look for existing "Resolved" subsection at H2 level (## Resolved)
  const h2Re = /^## Resolved[ \t]*$/gm;
  h2Re.lastIndex = bodyStart;
  const h2Match = h2Re.exec(content);

  if (h2Match !== null && h2Match.index < bodyEnd) {
    const subBodyStart = Math.min(
      h2Match.index + h2Match[0].length + 1,
      content.length,
    );
    // Find end: next ## heading, or bodyEnd
    const endRe2 = /^## /gm;
    endRe2.lastIndex = subBodyStart;
    const endMatch2 = endRe2.exec(content);
    const subBodyEnd =
      endMatch2 !== null && endMatch2.index < bodyEnd
        ? endMatch2.index
        : bodyEnd;

    const existingBody = content.slice(subBodyStart, subBodyEnd);
    const trimmedBody = existingBody.trimEnd();
    const insertAt = subBodyStart + trimmedBody.length;
    const after = content.slice(subBodyEnd).replace(/^\n+/, "");
    const separator = trimmedBody ? "\n\n" : "\n";
    const trailingSep = after ? "\n\n" : "\n";
    return content.slice(0, insertAt) + separator + block + trailingSep + after;
  }

  // No Resolved subsection found — create one at end of OQ region
  const openQBody = content.slice(bodyStart, bodyEnd);
  const trimmedBody = openQBody.trimEnd();
  const insertAt = bodyStart + trimmedBody.length;
  const after = content.slice(bodyEnd).replace(/^\n+/, "");
  const separator = trimmedBody ? "\n\n" : "\n";
  const trailingSep = after ? "\n\n" : "\n";

  // Determine heading level based on existing subsection style
  const headingLevel = regionUsesH2Subsections(content, bodyStart, bodyEnd)
    ? "##"
    : "###";
  const newSubsection = `${headingLevel} Resolved\n\n${block}`;

  return (
    content.slice(0, insertAt) + separator + newSubsection + trailingSep + after
  );
}

// ---------------------------------------------------------------------------
// Exported functions
// ---------------------------------------------------------------------------

/**
 * Add an exception to an existing decision.
 * Annotates original with HTML comment; new decision gets EXCEPTION TO field.
 * Both remain active (DEC-02, DEC-12).
 * @param options.section - Optional alias for the section containing the target decision (WRITE-14).
 *   When provided, uses parser-compatible alias resolution (PARSE-03) to locate the section.
 *   When omitted, defaults to searching for the Key Decisions section.
 */
export async function addException(
  inputContent: string,
  options: {
    title: string;
    why: string;
    exceptionTo: string;
    section?: string;
  },
): Promise<{ content: string; annotationAdded?: boolean }> {
  const le = detectLineEnding(inputContent);
  let normalized = normalize(inputContent);
  const today = new Date().toISOString().slice(0, 10);

  // Locate target section: use provided alias (WRITE-14) or default to Key Decisions.
  // WRITE-14: If no explicit Key Decisions section exists, fall back to searching
  // ALL sections for H3 decision entries (parser-lenient resolution).
  let section =
    options.section !== undefined
      ? findSectionByAlias(normalized, options.section)
      : findKeyDecisionsSection(normalized);

  // Search range: specific section if found, otherwise entire document (WRITE-14)
  const searchStart = section !== undefined ? section.bodyStart : 0;
  const searchEnd = section !== undefined ? section.bodyEnd : normalized.length;

  const entries = parseDecisionEntries(normalized, searchStart, searchEnd);
  const matches = findDecisionsByTitle(entries, options.exceptionTo);

  let annotationAdded = false;

  if (matches.length > 0) {
    const target = matches[0];

    // Annotate original: insert HTML comment as first line of its body (DEC-02)
    const comment = `<!-- brief:has-exception "${options.title}" ${today} -->`;
    normalized = `${normalized.slice(0, target.bodyStart)}${comment}\n${normalized.slice(target.bodyStart)}`;
    annotationAdded = true;

    // Re-find section after annotation (positions shifted)
    section =
      options.section !== undefined
        ? findSectionByAlias(normalized, options.section)
        : findKeyDecisionsSection(normalized);
  }

  // Build new exception decision block
  const cleanOrigTitle =
    matches.length > 0
      ? matches[0].rawHeadingText
          .replace(/~~([^~]*)~~/g, "$1")
          .replace(/\s*\(superseded\)\s*/gi, "")
          .trim()
      : options.exceptionTo;

  const newBlock = [
    `### ${options.title}`,
    `EXCEPTION TO: ${cleanOrigTitle}`,
    `WHY: ${options.why}`,
    `WHEN: ${today}`,
  ].join("\n");

  if (section !== undefined) {
    const existingBody = normalized.slice(section.bodyStart, section.bodyEnd);
    const trimmedBody = existingBody.trimEnd();
    const insertAt = section.bodyStart + trimmedBody.length;
    const afterSection = normalized.slice(section.bodyEnd).replace(/^\n+/, "");
    const separator = trimmedBody ? "\n\n" : "\n";
    const trailingSep = afterSection ? "\n\n" : "\n";
    normalized =
      normalized.slice(0, insertAt) +
      separator +
      newBlock +
      trailingSep +
      afterSection;
  } else if (matches.length > 0) {
    // No named section but found a decision — find its parent section (WRITE-14)
    const parentSection = findParentSection(normalized, options.exceptionTo);
    if (parentSection !== undefined) {
      const existingBody = normalized.slice(
        parentSection.bodyStart,
        parentSection.bodyEnd,
      );
      const trimmedBody = existingBody.trimEnd();
      const insertAt = parentSection.bodyStart + trimmedBody.length;
      const afterSection = normalized
        .slice(parentSection.bodyEnd)
        .replace(/^\n+/, "");
      const separator = trimmedBody ? "\n\n" : "\n";
      const trailingSep = afterSection ? "\n\n" : "\n";
      normalized =
        normalized.slice(0, insertAt) +
        separator +
        newBlock +
        trailingSep +
        afterSection;
    } else {
      const trimmed = normalized.replace(/\n+$/, "");
      normalized = `${trimmed}\n\n## Key Decisions\n\n${newBlock}\n`;
    }
  } else {
    // No matching decision and no Key Decisions section — create one (WRITE-14)
    const trimmed = normalized.replace(/\n+$/, "");
    normalized = `${trimmed}\n\n## Key Decisions\n\n${newBlock}\n`;
  }

  normalized = applyTimestamp(normalized, today);
  normalized = finalize(normalized, le);

  return { content: normalized, annotationAdded };
}

/**
 * Amend an existing decision's WHY field in-place.
 * WHEN date is not changed; Updated timestamp is refreshed. (DEC-07)
 */
export async function amendDecision(
  inputContent: string,
  options: { title: string; why: string },
): Promise<{ content: string; whenDatePreserved?: boolean }> {
  const le = detectLineEnding(inputContent);
  let normalized = normalize(inputContent);

  const section = findKeyDecisionsSection(normalized);
  if (section === undefined) {
    throw new Error(
      "Decision not found: no Key Decisions section in this file.",
    );
  }

  const entries = parseDecisionEntries(
    normalized,
    section.bodyStart,
    section.bodyEnd,
  );
  const matches = findDecisionsByTitle(entries, options.title);

  if (matches.length === 0) {
    throw new Error(
      `Decision not found: no match for "${options.title}" in this file.`,
    );
  }
  if (matches.length > 1) {
    const matchList = matches.map((m) => `"${m.rawHeadingText}"`).join(", ");
    throw new Error(
      `Multiple decisions match "${options.title}": ${matchList}. Disambiguation required.`,
    );
  }

  const target = matches[0];
  let newBody: string;

  if (/^WHY:/m.test(target.body)) {
    newBody = target.body.replace(/^WHY: .*/m, `WHY: ${options.why}`);
  } else if (/^WHAT:/m.test(target.body)) {
    newBody = target.body.replace(
      /(^WHAT: [^\n]*)/m,
      `$1\nWHY: ${options.why}`,
    );
  } else {
    newBody = `WHY: ${options.why}\n${target.body}`;
  }

  normalized =
    normalized.slice(0, target.bodyStart) +
    newBody +
    normalized.slice(target.bodyEnd);

  const today = new Date().toISOString().slice(0, 10);
  normalized = applyTimestamp(normalized, today);
  normalized = finalize(normalized, le);

  return { content: normalized, whenDatePreserved: true };
}

/**
 * Resolve an open question: mark checkbox [x], move to Resolved sub-section.
 * Returns resolutionSummary and suggestDecision flag. (DEC-06, OQ-215)
 */
export async function resolveQuestion(
  inputContent: string,
  params: { question: string; resolution: string },
): Promise<{
  content: string;
  wasKeepOpen?: boolean;
  suggestDecision?: boolean;
  resolutionSummary?: string;
}> {
  const le = detectLineEnding(inputContent);
  const normalized = normalize(inputContent);

  const openQSection = findOpenQuestionsRegion(normalized);
  if (openQSection === undefined) {
    throw new Error("Open Questions section not found.");
  }

  const questions = scanAllQuestions(normalized, openQSection);
  const matched = matchQuestion(questions, params.question);

  // Graceful return when no match at all (property test: "never throws")
  if (matched === null) {
    return {
      content: normalized,
      wasKeepOpen: false,
      suggestDecision: false,
      resolutionSummary: `Question not resolved: "${params.question}" not found.`,
    };
  }

  // Build resolved block (mark checkbox)
  const resolvedBlock = `${buildResolvedBlock(matched.block, matched.isPlainItem).trimEnd()}\n`;

  // Remove original question block from content
  const withoutQuestion =
    normalized.slice(0, matched.itemStart) + normalized.slice(matched.itemEnd);

  // Re-find Open Questions region after removal
  const openQSectionAfter = findOpenQuestionsRegion(withoutQuestion);
  if (openQSectionAfter === undefined) {
    throw new Error("Open Questions section not found after removal.");
  }

  // Insert into Resolved subsection (create if absent)
  let finalContent = insertIntoResolved(
    withoutQuestion,
    openQSectionAfter,
    resolvedBlock,
  );

  const today = new Date().toISOString().slice(0, 10);
  finalContent = applyTimestamp(finalContent, today);
  finalContent = finalize(finalContent, le);

  const resolutionSummary = `Resolved: "${matched.text}" — ${params.resolution}`;

  return {
    content: finalContent,
    wasKeepOpen: matched.wasKeepOpen,
    suggestDecision: matched.hasOptionsOrImpact,
    resolutionSummary,
  };
}

/**
 * Add bidirectional links between a resolved question and a decision.
 * Decision gets RESOLVED FROM; question gets DECIDED AS. (DEC-08)
 */
export async function addBidirectionalLink(
  inputContent: string,
  options: { questionText: string; decisionTitle: string },
): Promise<{ content: string }> {
  const le = detectLineEnding(inputContent);
  let normalized = normalize(inputContent);

  // 1. Find the decision and add RESOLVED FROM field
  const keyDecSection = findKeyDecisionsSection(normalized);
  if (keyDecSection === undefined) {
    throw new Error(
      "Decision not found: no Key Decisions section in this file.",
    );
  }

  const entries = parseDecisionEntries(
    normalized,
    keyDecSection.bodyStart,
    keyDecSection.bodyEnd,
  );
  const decMatches = findDecisionsByTitle(entries, options.decisionTitle);

  if (decMatches.length === 0) {
    throw new Error(
      `Decision not found: no match for "${options.decisionTitle}" in this file.`,
    );
  }

  const decTarget = decMatches[0];
  const resolvedFromLine = `RESOLVED FROM: ${options.questionText}`;
  const decBodyTrimmed = decTarget.body.trimEnd();
  const newDecBody = `${decBodyTrimmed}\n${resolvedFromLine}\n`;

  normalized =
    normalized.slice(0, decTarget.bodyStart) +
    newDecBody +
    normalized.slice(decTarget.bodyEnd);

  // 2. Find the question in Open Questions and add DECIDED AS
  const openQSec = findOpenQuestionsRegion(normalized);
  if (openQSec === undefined) {
    throw new Error("Open Questions section not found.");
  }

  const normQText = options.questionText.toLowerCase().trim();
  const regionContent = normalized.slice(openQSec.bodyStart, openQSec.bodyEnd);
  const lines = regionContent.split("\n");
  const lineStarts: number[] = [];
  let offset = 0;
  for (const line of lines) {
    lineStarts.push(offset);
    offset += line.length + 1;
  }

  let questionLineEnd = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const cbChecked = /^- \[x\] (.+)$/.exec(line);
    const cbUnchecked = /^- \[ \] (.+)$/.exec(line);
    const plain = /^- (?!\[)(.+)$/.exec(line);

    let text: string | null = null;
    if (cbChecked !== null) text = cbChecked[1].trim();
    else if (cbUnchecked !== null) text = cbUnchecked[1].trim();
    else if (plain !== null) text = plain[1].trim();

    if (text !== null && text.toLowerCase().trim() === normQText) {
      const nextLineStart =
        i + 1 < lineStarts.length ? lineStarts[i + 1] : regionContent.length;
      questionLineEnd = openQSec.bodyStart + nextLineStart;
      break;
    }
  }

  if (questionLineEnd < 0) {
    throw new Error(`Question not found: "${options.questionText}"`);
  }

  // Insert DECIDED AS after the question line
  const decidedAsLine = `  DECIDED AS: ${options.decisionTitle}\n`;
  normalized =
    normalized.slice(0, questionLineEnd) +
    decidedAsLine +
    normalized.slice(questionLineEnd);

  const today = new Date().toISOString().slice(0, 10);
  normalized = applyTimestamp(normalized, today);
  normalized = finalize(normalized, le);

  return { content: normalized };
}

/**
 * Add an intentional tension entry to the Key Decisions section.
 * Creates Intentional Tensions subsection if absent.
 */
export async function addIntentionalTension(
  inputContent: string,
  options: { itemA: string; itemB: string; reason?: string },
): Promise<{ content: string }> {
  const le = detectLineEnding(inputContent);
  let normalized = normalize(inputContent);
  const today = new Date().toISOString().slice(0, 10);

  let entry = `- [${options.itemA}] vs. [${options.itemB}]: intentional`;
  if (options.reason !== undefined && options.reason.trim() !== "") {
    entry += ` — ${options.reason}`;
  }

  const keyDecSection = findKeyDecisionsSection(normalized);

  if (keyDecSection !== undefined) {
    const subs = findSubsections(
      normalized,
      keyDecSection.bodyStart,
      keyDecSection.bodyEnd,
    );
    const tensionSub = subs.find((s) =>
      s.headingText.toLowerCase().includes("intentional tension"),
    );

    if (tensionSub !== undefined) {
      const existingBody = normalized.slice(
        tensionSub.bodyStart,
        tensionSub.bodyEnd,
      );
      const trimmedBody = existingBody.trimEnd();
      const insertAt = tensionSub.bodyStart + trimmedBody.length;
      const after = normalized.slice(tensionSub.bodyEnd);
      const separator = trimmedBody ? "\n" : "";
      normalized = `${normalized.slice(0, insertAt)}${separator}\n${entry}\n${after}`;
    } else {
      const existingBody = normalized.slice(
        keyDecSection.bodyStart,
        keyDecSection.bodyEnd,
      );
      const trimmedBody = existingBody.trimEnd();
      const insertAt = keyDecSection.bodyStart + trimmedBody.length;
      const after = normalized.slice(keyDecSection.bodyEnd).replace(/^\n+/, "");
      const separator = trimmedBody ? "\n\n" : "\n";
      const trailingSep = after ? "\n\n" : "\n";
      const newSubsection = `### Intentional Tensions\n\n${entry}`;
      normalized =
        normalized.slice(0, insertAt) +
        separator +
        newSubsection +
        trailingSep +
        after;
    }
  } else {
    const trimmed = normalized.replace(/\n+$/, "");
    normalized = `${trimmed}\n\n## Key Decisions\n\n### Intentional Tensions\n\n${entry}\n`;
  }

  normalized = applyTimestamp(normalized, today);
  normalized = finalize(normalized, le);

  return { content: normalized };
}

// ---------------------------------------------------------------------------
// Deprecated shims (kept for backward compatibility)
// ---------------------------------------------------------------------------

/** @deprecated Use addException instead */
export async function writeException(
  _filePath: string,
  _params: ExceptionWriteParams,
): Promise<WriterResult> {
  throw new Error("Not implemented: writeException (deprecated)");
}

/** @deprecated Use addIntentionalTension instead */
export async function writeIntentionalTension(
  _filePath: string,
  _itemA: string,
  _itemB: string,
  _reason?: string,
): Promise<WriterResult> {
  throw new Error("Not implemented: writeIntentionalTension (deprecated)");
}

/** @deprecated Use addBidirectionalLink instead */
export async function writeBidirectionalLink(
  _filePath: string,
  _questionText: string,
  _decisionTitle: string,
): Promise<WriterResult> {
  throw new Error("Not implemented: writeBidirectionalLink (deprecated)");
}
