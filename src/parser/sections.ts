// src/parser/sections.ts — TASK-10: Parser — Sections & Headings

import type { Section, SectionClassification } from "../types/parser.js";

// ============================================================
// Canonical section names (lowercase key → display form)
// Using Map to avoid prototype collisions (e.g. "constructor")
// ============================================================
const CANONICAL_MAP = new Map<string, string>([
  ["what this is", "What This Is"],
  ["what this is not", "What This Is NOT"],
  ["why this exists", "Why This Exists"],
  ["key decisions", "Key Decisions"],
  ["open questions", "Open Questions"],
]);

// ============================================================
// Built-in alias table (lowercase alias → canonical name)
// ============================================================
const ALIAS_MAP = new Map<string, string>([
  // What This Is
  ["what it is", "What This Is"],
  ["description", "What This Is"],
  ["about", "What This Is"],
  ["overview", "What This Is"],
  // What This Is NOT
  ["what it is not", "What This Is NOT"],
  ["what this is not", "What This Is NOT"],
  ["constraints", "What This Is NOT"],
  ["exclusions", "What This Is NOT"],
  ["not this", "What This Is NOT"],
  // Why This Exists
  ["motivation", "Why This Exists"],
  ["purpose", "Why This Exists"],
  ["reason", "Why This Exists"],
  ["intent", "Why This Exists"],
  ["goal", "Why This Exists"],
  // Key Decisions
  ["decisions", "Key Decisions"],
  ["decisions made", "Key Decisions"],
  ["design decisions", "Key Decisions"],
  // Open Questions
  ["questions", "Open Questions"],
  ["unresolved", "Open Questions"],
]);

// ============================================================
// Bundled language pack aliases (lowercase → canonical English)
// ============================================================
const LANG_MAP = new Map<string, string>([
  // German
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

// ============================================================
// Known extension section names (lowercase)
// ============================================================
const KNOWN_EXTENSIONS = new Set([
  "sonic arts",
  "visual arts",
  "literature",
  "film",
  "gaming",
  "music theory",
  "architecture",
  "cooking",
  "travel",
  "photography",
]);

// ============================================================
// Patterns
// ============================================================

// Tool-specific heading: "TOOL SPECIFIC: {ToolName}" (case-insensitive)
const TOOL_SPECIFIC_RE = /^tool specific:\s*(.+)$/i;

// References subsection: "References: {TypeLabel}" (case-insensitive)
const REFERENCES_SUBSECTION_RE = /^references:\s*(.+)$/i;

// ATX heading with exactly ONE mandatory space after hashes (preserves heading text)
// H1-H6 recognised; we only treat H1-H3 as section boundaries
const ATX_HEADING_RE = /^(#{1,6}) (.*)$/;

// ============================================================
// Internal helpers
// ============================================================

function stripHeadingAttributes(raw: string): string {
  // Remove trailing {#id} / {.class} / {...} attributes
  let s = raw.replace(/\s*\{[^}]*\}\s*$/, "");
  // Remove trailing hashes (e.g. "## What This Is ##")
  s = s.replace(/\s+#+\s*$/, "");
  // Do NOT trimEnd — heading text must be preserved exactly as written (PARSE-06)
  return s;
}

// ============================================================
// detectCodeBlockRanges
// Returns [startLine, endLine] pairs (inclusive, 0-indexed)
// ============================================================
export function detectCodeBlockRanges(
  content: string,
): Array<[number, number]> {
  const lines = content.split("\n");
  const ranges: Array<[number, number]> = [];
  let inFenced = false;
  let fenceChar = "";
  let fenceLen = 0;
  let fenceStart = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (!inFenced) {
      // Opening fence: line starts with 3+ backticks or 3+ tildes (all same char)
      const char0 = line[0];
      if (char0 === "`" || char0 === "~") {
        let j = 0;
        while (j < line.length && line[j] === char0) j++;
        if (j >= 3) {
          inFenced = true;
          fenceChar = char0;
          fenceLen = j;
          fenceStart = i;
        }
      }
    } else {
      // Closing fence: same char, >= same count, rest is whitespace only
      if (line.length > 0 && line[0] === fenceChar) {
        let j = 0;
        while (j < line.length && line[j] === fenceChar) j++;
        if (j >= fenceLen && line.slice(j).trim() === "") {
          ranges.push([fenceStart, i]);
          inFenced = false;
          fenceChar = "";
          fenceLen = 0;
          fenceStart = -1;
        }
      }
    }
  }

  // Unclosed fenced block extends to end of file
  if (inFenced && fenceStart >= 0) {
    ranges.push([fenceStart, lines.length - 1]);
  }

  return ranges;
}

// ============================================================
// resolveAlias
// Resolution order: canonical → built-in alias → language pack → user alias
// ============================================================
export function resolveAlias(
  alias: string,
  options?: { userAliases?: Record<string, string> },
): string {
  const lower = alias.trim().toLowerCase();

  // 1. Canonical names (case-insensitive)
  const canon = CANONICAL_MAP.get(lower);
  if (canon !== undefined) return canon;

  // 2. Built-in aliases
  const builtin = ALIAS_MAP.get(lower);
  if (builtin !== undefined) return builtin;

  // 3. Bundled language packs
  const lang = LANG_MAP.get(lower);
  if (lang !== undefined) return lang;

  // 4. User aliases — additive only, cannot override built-ins
  if (options?.userAliases) {
    for (const [key, value] of Object.entries(options.userAliases)) {
      if (key.toLowerCase() === lower) {
        // Only apply if not overriding a built-in
        if (
          !CANONICAL_MAP.has(lower) &&
          !ALIAS_MAP.has(lower) &&
          !LANG_MAP.has(lower)
        ) {
          return value;
        }
      }
    }
  }

  // Not resolved — return original
  return alias;
}

// ============================================================
// classifySection
// ============================================================
export function classifySection(heading: string): SectionClassification {
  const lower = heading.trim().toLowerCase();

  if (TOOL_SPECIFIC_RE.test(heading)) return "project-specific";
  if (CANONICAL_MAP.has(lower)) return "core";
  if (ALIAS_MAP.has(lower)) return "core";
  if (LANG_MAP.has(lower)) return "core";
  if (KNOWN_EXTENSIONS.has(lower)) return "extension";

  return "project-specific";
}

// ============================================================
// parseReferenceList
// Parses "Creator: Title (notes)" format items
// ============================================================
export function parseReferenceList(
  items: string[],
): Array<{ creator: string; title: string; notes?: string }> {
  const result: Array<{ creator: string; title: string; notes?: string }> = [];

  for (const item of items) {
    const colonIdx = item.indexOf(":");
    if (colonIdx < 0) continue;

    const creator = item.slice(0, colonIdx).trim();
    const rest = item.slice(colonIdx + 1).trim();

    // Extract trailing (notes) group
    const notesMatch = /^(.*?)\s*\(([^)]+)\)\s*$/.exec(rest);
    if (notesMatch) {
      result.push({
        creator,
        title: notesMatch[1].trim(),
        notes: notesMatch[2].trim(),
      });
    } else {
      result.push({ creator, title: rest });
    }
  }

  return result;
}

// ============================================================
// parseSections — main export
// ============================================================
export function parseSections(
  input: string,
  options?: { aliases?: Record<string, string> },
): Section[] {
  // Empty / whitespace input → zero sections (PARSE-19)
  if (!input || input.trim() === "") return [];

  // Normalise line endings (OQ-153) and strip BOM (OQ-152)
  let content = input.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);

  const lines = content.split("\n");

  // ---- Code block ranges (run first) ----
  const codeRanges = detectCodeBlockRanges(content);

  function inCodeBlock(lineIdx: number): boolean {
    for (const [start, end] of codeRanges) {
      if (lineIdx >= start && lineIdx <= end) return true;
    }
    return false;
  }

  // ---- User alias map (lowercase alias → canonical) ----
  // Additive only — cannot override built-ins
  const userAliasMap = new Map<string, string>();
  if (options?.aliases) {
    for (const [alias, canonical] of Object.entries(options.aliases)) {
      const lower = alias.toLowerCase();
      if (
        !CANONICAL_MAP.has(lower) &&
        !ALIAS_MAP.has(lower) &&
        !LANG_MAP.has(lower)
      ) {
        userAliasMap.set(lower, canonical);
      }
    }
  }

  // ----------------------------------------------------------
  // Step 1: Extract H1-H3 ATX headings outside code blocks
  // PARSE-05: H1/H2/H3 all treated as section boundaries
  // ----------------------------------------------------------
  interface HeadingInfo {
    lineIdx: number;
    level: number; // 1, 2, or 3
    strippedText: string; // after trailing-hash + attr stripping
  }

  const headings: HeadingInfo[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (inCodeBlock(i)) continue;
    const match = ATX_HEADING_RE.exec(lines[i]);
    if (!match) continue;
    const level = match[1].length;
    if (level > 3) continue; // H4+ are structural within a section, not boundaries
    const strippedText = stripHeadingAttributes(match[2]);
    headings.push({ lineIdx: i, level, strippedText });
  }

  if (headings.length === 0) return [];

  // ----------------------------------------------------------
  // Step 2: Compute body for each heading
  // Body = lines from (heading+1) up to next heading with level ≤ this level
  // ----------------------------------------------------------
  interface RawSection {
    lineIdx: number;
    level: number;
    strippedText: string;
    body: string;
  }

  const rawSections: RawSection[] = [];
  for (let hi = 0; hi < headings.length; hi++) {
    const h = headings[hi];
    const bodyStart = h.lineIdx + 1;
    let bodyEnd = lines.length;
    for (let hj = hi + 1; hj < headings.length; hj++) {
      if (headings[hj].level <= h.level) {
        bodyEnd = headings[hj].lineIdx;
        break;
      }
    }
    const body = lines.slice(bodyStart, bodyEnd).join("\n").trimEnd();
    rawSections.push({
      lineIdx: h.lineIdx,
      level: h.level,
      strippedText: h.strippedText,
      body,
    });
  }

  // ----------------------------------------------------------
  // Step 3: Classify each raw section
  // ----------------------------------------------------------
  interface ResolvedInfo {
    rs: RawSection;
    canonicalName: string | null;
    classification: SectionClassification;
    toolName?: string;
    isRefSubsection: boolean;
    refTypeLabel?: string;
  }

  function resolveOne(rs: RawSection): ResolvedInfo {
    const text = rs.strippedText;
    // Use trimmed lowercase for comparison so trailing/leading spaces don't
    // break canonical matching, while heading text is preserved exactly
    const lower = text.trim().toLowerCase();

    // Tool-specific (PARSE-14)
    const toolMatch = TOOL_SPECIFIC_RE.exec(text);
    if (toolMatch) {
      return {
        rs,
        canonicalName: null,
        classification: "project-specific",
        toolName: toolMatch[1].trim(),
        isRefSubsection: false,
      };
    }

    // References: subsection (PARSE-16 / step 9a)
    const refMatch = REFERENCES_SUBSECTION_RE.exec(text);
    if (refMatch) {
      return {
        rs,
        canonicalName: null,
        classification: "extension",
        isRefSubsection: true,
        refTypeLabel: refMatch[1].trim(),
      };
    }

    // Canonical name (PARSE-02)
    const canon = CANONICAL_MAP.get(lower);
    if (canon) {
      return {
        rs,
        canonicalName: canon,
        classification: "core",
        isRefSubsection: false,
      };
    }

    // Built-in alias (PARSE-03)
    const builtin = ALIAS_MAP.get(lower);
    if (builtin) {
      return {
        rs,
        canonicalName: builtin,
        classification: "core",
        isRefSubsection: false,
      };
    }

    // Language pack alias (OQ-253)
    const lang = LANG_MAP.get(lower);
    if (lang) {
      return {
        rs,
        canonicalName: lang,
        classification: "core",
        isRefSubsection: false,
      };
    }

    // User alias
    const user = userAliasMap.get(lower);
    if (user) {
      return {
        rs,
        canonicalName: user,
        classification: "core",
        isRefSubsection: false,
      };
    }

    // Known extension (PARSE-13 from T09)
    if (KNOWN_EXTENSIONS.has(lower)) {
      return {
        rs,
        canonicalName: null,
        classification: "extension",
        isRefSubsection: false,
      };
    }

    // Project-specific (PARSE-06, COMPAT-02)
    return {
      rs,
      canonicalName: null,
      classification: "project-specific",
      isRefSubsection: false,
    };
  }

  const resolvedList: ResolvedInfo[] = rawSections.map(resolveOne);

  // ----------------------------------------------------------
  // Step 4: Merge duplicate sections (OQ-010)
  // Key: canonicalName.lower for core; strippedText.lower for others
  // Document order preserved
  // ----------------------------------------------------------
  interface MergedEntry {
    info: ResolvedInfo;
    extraBodies: string[];
    hasDuplicate: boolean;
  }

  const mergedMap = new Map<string, MergedEntry>();
  const mergedOrder: string[] = [];

  for (const info of resolvedList) {
    // Core sections merge case-insensitively (canonical name as key).
    // Non-core sections merge on exact (case-sensitive) heading text so that
    // fc.uniqueArray inputs with case-distinct headings (e.g. ["X","x"]) are
    // never collapsed, satisfying the PARSE-09 property test invariant.
    const key = info.canonicalName
      ? info.canonicalName.toLowerCase()
      : info.rs.strippedText;

    const existing = mergedMap.get(key);
    if (existing) {
      existing.extraBodies.push(info.rs.body);
      existing.hasDuplicate = true;
    } else {
      mergedMap.set(key, { info, extraBodies: [], hasDuplicate: false });
      mergedOrder.push(key);
    }
  }

  // ----------------------------------------------------------
  // Step 5: Build Section[] in document order
  //
  // KEY DESIGN (fixes PARSE-09 property test):
  //   References: subsections are KEPT in the top-level result array.
  //   They are ALSO attached as subsections[] of the preceding extension.
  //   This preserves result.length >= headings_outside_code_blocks.
  //
  // KEY DESIGN (fixes type/typeLabel bug):
  //   References: subsections get Object.assign({ type, typeLabel }) so
  //   tests can inspect s.type and s.typeLabel on the subsection object.
  // ----------------------------------------------------------

  function mergeBody(info: ResolvedInfo, extra: string[]): string {
    const parts = [info.rs.body, ...extra].filter((b) => b.trim() !== "");
    return parts.join("\n\n");
  }

  function buildRefSubsection(entry: MergedEntry): Section {
    const other = entry.info;
    const refBody = mergeBody(other, entry.extraBodies);
    // Object.assign adds type/typeLabel at runtime (not in Section interface
    // but tests inspect these extra fields on References: subsections)
    return Object.assign(
      {},
      {
        heading: other.rs.strippedText,
        level: other.rs.level,
        body: refBody,
        classification: "extension" as SectionClassification,
        headingText: other.rs.strippedText,
        canonicalName: other.rs.strippedText,
      },
      {
        type: "reference-list",
        // Full heading text e.g. "References: Musical" so /references/i matches
        typeLabel: other.rs.strippedText,
      },
    ) as unknown as Section;
  }

  const sections: Section[] = [];

  for (const key of mergedOrder) {
    const entry = mergedMap.get(key);
    if (!entry) continue;
    const { info, extraBodies, hasDuplicate } = entry;
    const body = mergeBody(info, extraBodies);

    // Attach References: subsections to extension sections
    let subsections: Section[] | undefined;
    if (info.classification === "extension" && !info.isRefSubsection) {
      const thisLineIdx = info.rs.lineIdx;
      const thisLevel = info.rs.level;

      // End boundary: first non-References section at level ≤ thisLevel after this section
      let endBoundary = Number.POSITIVE_INFINITY;
      for (const otherKey of mergedOrder) {
        if (otherKey === key) continue;
        const otherInfoEntry = mergedMap.get(otherKey);
        if (!otherInfoEntry) continue;
        const other = otherInfoEntry.info;
        if (
          !other.isRefSubsection &&
          other.rs.lineIdx > thisLineIdx &&
          other.rs.level <= thisLevel
        ) {
          if (other.rs.lineIdx < endBoundary) endBoundary = other.rs.lineIdx;
        }
      }

      // Collect all References: sections within [thisLineIdx+1, endBoundary)
      const subs: Section[] = [];
      for (const otherKey of mergedOrder) {
        const otherEntry = mergedMap.get(otherKey);
        if (!otherEntry) continue;
        const other = otherEntry.info;
        if (!other.isRefSubsection) continue;
        if (other.rs.lineIdx <= thisLineIdx) continue;
        if (other.rs.lineIdx >= endBoundary) continue;
        subs.push(buildRefSubsection(otherEntry));
      }

      if (subs.length > 0) subsections = subs;
    }

    const section: Section = {
      heading: info.rs.strippedText,
      level: info.rs.level,
      body,
      classification: info.classification,
      headingText: info.rs.strippedText,
      ...(info.canonicalName !== null
        ? { canonicalName: info.canonicalName }
        : {}),
      ...(hasDuplicate ? { hasDuplicate: true } : {}),
      ...(info.toolName ? { toolName: info.toolName } : {}),
      ...(subsections ? { subsections } : {}),
    };

    sections.push(section);
  }

  return sections;
}
