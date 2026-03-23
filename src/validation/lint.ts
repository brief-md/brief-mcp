// src/validation/lint.ts — TASK-29: Lint Tool
// VALID-01..07: Two-tier validation (valid + well-formed), read-only.

import type { Decision } from "../types/decisions.js";
import type {
  BriefMetadata,
  BriefTag,
  OntologyTag,
  ParsedBriefMd,
  PreprocessResult,
  RefLinkTag,
  Section,
  UnknownBriefTag,
} from "../types/parser.js";
import type { LintFinding, LintSeverity } from "../types/validation.js";
import { checkConflicts } from "./conflicts.js";

// Dynamic import to satisfy ARCH-04 (no static cross-module imports)
// biome-ignore lint/suspicious/noExplicitAny: dynamic import typing
type ParserModule = Record<string, any>;
let _parserMod: ParserModule | undefined;
async function loadParser(): Promise<ParserModule> {
  if (!_parserMod) {
    _parserMod = await import("../parser/index.js"); // check-rules-ignore
  }
  return _parserMod;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CORE_SECTION_NAMES: readonly string[] = [
  "what this is",
  "what this is not",
  "why this exists",
  "key decisions",
  "open questions",
];

const CORE_SECTION_DISPLAY: Readonly<Record<string, string>> = {
  "what this is": "What This Is",
  "what this is not": "What This Is NOT",
  "why this exists": "Why This Exists",
  "key decisions": "Key Decisions",
  "open questions": "Open Questions",
};

const REQUIRED_METADATA_FIELDS: readonly string[] = [
  "Project",
  "Type",
  "Created",
];

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface LintOptions {
  installedPacks?: string[];
  checkBundledGuides?: boolean;
}

export interface LintBriefResult {
  findings: LintFinding[];
  errorCount: number;
  warningCount: number;
  infoCount: number;
  filesModified: number;
  readOnly: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFinding(
  ruleId: string,
  severity: LintSeverity,
  message: string,
  extra?: Partial<
    Pick<LintFinding, "line" | "section" | "suggestion" | "code" | "fields">
  >,
): LintFinding {
  return { ruleId, severity, message, code: ruleId, ...extra } as LintFinding;
}

function getCoreNameKey(section: Section): string | undefined {
  const name = (section.canonicalName ?? section.heading ?? "")
    .toLowerCase()
    .trim();
  if (CORE_SECTION_NAMES.includes(name)) return name;
  return undefined;
}

/**
 * Build a full ParsedBriefMd from individual parser results.
 * parseBrief is a stub that returns empty data, so we assemble manually.
 */
function buildParsedDocument(
  content: string,
  parser: ParserModule,
): ParsedBriefMd {
  // 1. Metadata
  const metaResult = parser.parseMetadata(content);
  const metadata: BriefMetadata = {};
  for (const [key, value] of metaResult.fields) {
    metadata[key] = value;
  }

  // Parse structured metadata fields
  const extensionsRaw = metaResult.fields.get("Extensions") ?? "";
  const extensions = parser.parseExtensionsList(extensionsRaw);
  if (extensions.length > 0) {
    metadata.Extensions = extensions;
  }

  const ontologiesRaw = metaResult.fields.get("Ontologies") ?? "";
  const ontologiesParsed = parser.parseOntologiesList(ontologiesRaw);
  if (ontologiesParsed.length > 0) {
    metadata.Ontologies = ontologiesParsed;
  }

  // 2. Sections
  const sections = parser.parseSections(content);

  // 3. Decisions (parse from full content)
  const decisionResult = parser.parseDecisions(content);
  const decisions: Decision[] = [...decisionResult];

  // 4. Questions
  const questionResult = parser.parseQuestions(content);
  const questions = [
    ...questionResult.toResolve,
    ...questionResult.toKeepOpen,
    ...questionResult.resolved,
  ];

  // 5. Comments/tags
  const commentResult = parser.parseComments(content);
  const comments: BriefTag[] = commentResult.tags;

  return {
    metadata,
    sections,
    decisions,
    questions,
    extensions,
    comments,
    warnings: metaResult.warnings.map((w: string) => ({
      message: w,
      severity: "warning" as const,
    })),
    fieldOrder: metaResult.fieldOrder,
  };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function lintBrief(
  content: string,
  options?: LintOptions,
): Promise<LintBriefResult> {
  const findings: LintFinding[] = [];

  // --- Raw content checks (always run, no parsing needed) ---
  checkFileSize(content, findings);
  checkNonCanonicalMetadata(content, findings);
  checkSetextHeadings(content, findings);
  checkDeepHeadings(content, findings);
  checkDashSeparators(content, findings);

  try {
    const parser = await loadParser();
    const preprocessed = parser.preprocess(content);
    checkCrlfLineEndings(preprocessed, findings);

    const parsed = buildParsedDocument(content, parser);

    // --- Error-level checks (VALID-01) ---
    checkRequiredMetadata(parsed, findings);
    checkCoreSectionsPresent(parsed, findings);

    // --- Warning-level checks (VALID-02, VALID-07) ---
    checkMissingRecommendedSections(parsed, findings);
    checkInconsistentHeadings(parsed, findings);
    checkDecisionConflictsLint(parsed, findings);
    checkDanglingReplaces(parsed, findings);
    checkDanglingExceptionTo(parsed, findings);
    checkSupersededByMismatch(parsed, findings);
    checkOrphanedOntologyTags(parsed, findings, options?.installedPacks);
    checkInvalidDates(parsed, findings);
    checkOntologyPackNames(parsed, findings);

    // --- Info-level checks (parsed data) ---
    checkDuplicateDecisionTitles(parsed, findings);
    checkOrphanedRefLinks(parsed, findings);
    checkNonConformantExtensions(parsed, findings);
    checkUnrecognisedComments(content, parsed, findings);
    if (options?.checkBundledGuides) {
      checkBundledGuideNotifications(parsed, findings);
    }
  } catch {
    // Property invariant: lint never throws
    findings.push(
      makeFinding("internal-error", "error", "Internal lint error occurred"),
    );
  }

  let errorCount = 0;
  let warningCount = 0;
  let infoCount = 0;
  for (const f of findings) {
    if (f.severity === "error") errorCount++;
    else if (f.severity === "warning") warningCount++;
    else infoCount++;
  }

  return {
    findings,
    errorCount,
    warningCount,
    infoCount,
    filesModified: 0,
    readOnly: true,
  };
}

// ---------------------------------------------------------------------------
// Error-level checks (VALID-01)
// ---------------------------------------------------------------------------

function checkRequiredMetadata(
  parsed: ParsedBriefMd,
  findings: LintFinding[],
): void {
  for (const field of REQUIRED_METADATA_FIELDS) {
    const value = parsed.metadata[field];
    if (
      value === undefined ||
      value === null ||
      (typeof value === "string" && value.trim() === "")
    ) {
      findings.push(
        makeFinding(
          "MISSING_METADATA",
          "error",
          `Missing required metadata field: ${field}`,
          { fields: [field] },
        ),
      );
    }
  }
}

function checkCoreSectionsPresent(
  parsed: ParsedBriefMd,
  findings: LintFinding[],
): void {
  const hasCore = parsed.sections.some(
    (s) =>
      s.classification === "core" ||
      CORE_SECTION_NAMES.includes(
        (s.canonicalName ?? s.heading ?? "").toLowerCase().trim(),
      ),
  );
  if (!hasCore) {
    findings.push(
      makeFinding(
        "NO_CORE_SECTIONS",
        "error",
        "No core sections found. At least one core section is required.",
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Warning-level checks (VALID-02, VALID-07)
// ---------------------------------------------------------------------------

function checkMissingRecommendedSections(
  parsed: ParsedBriefMd,
  findings: LintFinding[],
): void {
  const present = new Set<string>();
  for (const section of parsed.sections) {
    const key = getCoreNameKey(section);
    if (key) present.add(key);
  }
  for (const coreName of CORE_SECTION_NAMES) {
    if (!present.has(coreName)) {
      const display = CORE_SECTION_DISPLAY[coreName] ?? coreName;
      findings.push(
        makeFinding(
          "MISSING_SECTION",
          "warning",
          `Missing recommended core section: ${display}`,
          { section: display },
        ),
      );
    }
  }
}

function checkInconsistentHeadings(
  parsed: ParsedBriefMd,
  findings: LintFinding[],
): void {
  // Check if core sections appear at different heading levels
  const coreLevels = new Set<number>();
  for (const section of parsed.sections) {
    const key = getCoreNameKey(section);
    if (key) {
      coreLevels.add(section.level);
    }
  }
  if (coreLevels.size > 1) {
    const levelsStr = [...coreLevels]
      .sort()
      .map((l) => `H${l}`)
      .join(" and ");
    findings.push(
      makeFinding(
        "INCONSISTENT_HEADINGS",
        "warning",
        `Inconsistent heading levels: mix of ${levelsStr} for top-level sections`,
      ),
    );
  }
}

function checkDecisionConflictsLint(
  parsed: ParsedBriefMd,
  findings: LintFinding[],
): void {
  const decisions = parsed.decisions ?? [];
  const activeDecisions = decisions.filter(
    (d) => d.status === "active" && !d.exceptionTo,
  );
  if (activeDecisions.length < 2) return;

  try {
    const result = checkConflicts({
      decisions: activeDecisions.map((d) => ({
        text: d.text,
        status: d.status,
      })),
      constraints: [],
    });
    for (const conflict of result.conflicts) {
      const items = conflict.items.map((i) => i.text).join(" vs ");
      findings.push(
        makeFinding(
          "DECISION_CONFLICT",
          "warning",
          `Potential decision conflict: ${items}`,
        ),
      );
    }
  } catch {
    // Don't let conflict detection errors break lint
  }
}

function buildDecisionLookup(decisions: Decision[]): Set<string> {
  const lookup = new Set<string>();
  for (const d of decisions) {
    lookup.add(d.text.toLowerCase().trim());
    // Also index the ID prefix (e.g. "WRITE-01" from "WRITE-01: Use regex...")
    const idMatch = d.text.match(/^([A-Z][A-Z0-9_-]+(?:-[A-Z0-9]+)*):/i);
    if (idMatch) {
      lookup.add(idMatch[1].toLowerCase().trim());
    }
  }
  return lookup;
}

function checkDanglingReplaces(
  parsed: ParsedBriefMd,
  findings: LintFinding[],
): void {
  const decisions = parsed.decisions ?? [];
  const lookup = buildDecisionLookup(decisions);
  for (const d of decisions) {
    if (d.replaces) {
      const target = d.replaces.toLowerCase().trim();
      if (!lookup.has(target)) {
        findings.push(
          makeFinding(
            "DANGLING_REPLACES",
            "warning",
            `Decision "${d.text}" REPLACES non-existent decision: "${d.replaces}"`,
          ),
        );
      }
    }
  }
}

function checkDanglingExceptionTo(
  parsed: ParsedBriefMd,
  findings: LintFinding[],
): void {
  const decisions = parsed.decisions ?? [];
  const lookup = buildDecisionLookup(decisions);
  for (const d of decisions) {
    if (d.exceptionTo) {
      const target = d.exceptionTo.toLowerCase().trim();
      if (!lookup.has(target)) {
        findings.push(
          makeFinding(
            "DANGLING_EXCEPTION",
            "warning",
            `Decision "${d.text}" has EXCEPTION TO non-existent target: "${d.exceptionTo}"`,
          ),
        );
      }
    }
  }
}

function checkSupersededByMismatch(
  parsed: ParsedBriefMd,
  findings: LintFinding[],
): void {
  const decisions = parsed.decisions ?? [];
  const lookup = buildDecisionLookup(decisions);
  for (const d of decisions) {
    if (d.supersededBy) {
      const target = d.supersededBy.toLowerCase().trim();
      if (!lookup.has(target)) {
        findings.push(
          makeFinding(
            "SUPERSEDED_MISMATCH",
            "warning",
            `Decision "${d.text}" SUPERSEDED BY non-existent decision: "${d.supersededBy}"`,
          ),
        );
      }
    }
  }
}

function checkOrphanedOntologyTags(
  parsed: ParsedBriefMd,
  findings: LintFinding[],
  installedPacks: string[] | undefined,
): void {
  const comments = parsed.comments ?? [];
  const ontologyTags = comments.filter(
    (c): c is OntologyTag => c.type === "ontology",
  );

  if (ontologyTags.length === 0) return;

  // Check against installed packs if provided
  if (installedPacks) {
    const installedSet = new Set(installedPacks.map((p) => p.toLowerCase()));
    for (const tag of ontologyTags) {
      if (!installedSet.has(tag.pack.toLowerCase())) {
        findings.push(
          makeFinding(
            "ORPHANED_ONTOLOGY",
            "warning",
            `Orphaned ontology tag references uninstalled pack: "${tag.pack}"`,
          ),
        );
      }
    }
    return;
  }

  // If no installed packs list, check if pack is declared in metadata Ontologies
  const declaredPacks = new Set<string>();
  const ontologies = parsed.metadata.Ontologies;
  if (Array.isArray(ontologies)) {
    for (const entry of ontologies) {
      if (entry && typeof entry === "object" && "name" in entry) {
        declaredPacks.add((entry as { name: string }).name.toLowerCase());
      }
    }
  }

  for (const tag of ontologyTags) {
    if (!declaredPacks.has(tag.pack.toLowerCase())) {
      findings.push(
        makeFinding(
          "ORPHANED_ONTOLOGY",
          "warning",
          `Orphaned ontology tag references undeclared pack: "${tag.pack}"`,
        ),
      );
    }
  }
}

function checkInvalidDates(
  parsed: ParsedBriefMd,
  findings: LintFinding[],
): void {
  const decisions = parsed.decisions ?? [];
  for (const d of decisions) {
    if (d.when) {
      const dateStr = d.when.trim();
      if (dateStr && Number.isNaN(Date.parse(dateStr))) {
        findings.push(
          makeFinding(
            "INVALID_DATE",
            "warning",
            `Invalid date in WHEN field of decision "${d.text}": "${dateStr}"`,
          ),
        );
      }
    }
  }
}

function checkOntologyPackNames(
  parsed: ParsedBriefMd,
  findings: LintFinding[],
): void {
  const ontologies = parsed.metadata.Ontologies;
  if (!ontologies || !Array.isArray(ontologies)) return;

  const validPackName = /^[a-z0-9][a-z0-9-]*$/;
  for (const entry of ontologies) {
    if (entry && typeof entry === "object" && "name" in entry) {
      const name = (entry as { name: string }).name;
      if (name && !validPackName.test(name)) {
        findings.push(
          makeFinding(
            "INVALID_PACK_NAME",
            "warning",
            `Ontology pack name "${name}" uses PascalCase or camelCase — expected snake_case lowercase format [a-z0-9][a-z0-9-]*`,
          ),
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Info-level checks (VALID-03, VALID-04, VALID-05)
// ---------------------------------------------------------------------------

function checkCrlfLineEndings(
  preprocessed: PreprocessResult,
  findings: LintFinding[],
): void {
  if (
    preprocessed.lineEndingStyle === "crlf" ||
    preprocessed.lineEndingStyle === "mixed"
  ) {
    findings.push(
      makeFinding("CRLF_DETECTED", "info", "CRLF line endings detected"),
    );
  }
}

function checkFileSize(content: string, findings: LintFinding[]): void {
  const lineCount = content.split("\n").length;
  if (lineCount > 1000) {
    findings.push(
      makeFinding(
        "FILE_TOO_LARGE",
        "info",
        `Line count exceeds 1000 — file has too many lines (${lineCount}). Consider splitting into sub-projects.`,
      ),
    );
  }
}

function checkNonCanonicalMetadata(
  content: string,
  findings: LintFinding[],
): void {
  const lines = content.split("\n");
  const limit = Math.min(lines.length, 30);
  for (let i = 0; i < limit; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith("#") || trimmed === "---") break;
    if (trimmed === "") continue;

    const match = trimmed.match(
      /^(Project|Type|Created|Updated|Extensions|Status|Version):\s/,
    );
    if (match && !trimmed.startsWith("**")) {
      findings.push(
        makeFinding(
          "NON_CANONICAL_METADATA",
          "info",
          `Non-canonical metadata formatting: "${match[1]}" should use bold format (**${match[1]}:**)`,
        ),
      );
      return;
    }
  }
}

function checkSetextHeadings(content: string, findings: LintFinding[]): void {
  const lines = content.split("\n");
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (/^={3,}$/.test(line) || /^-{3,}$/.test(line)) {
      const prevLine = lines[i - 1].trim();
      if (
        prevLine.length > 0 &&
        !prevLine.startsWith("#") &&
        !prevLine.startsWith("---")
      ) {
        findings.push(
          makeFinding(
            "SETEXT_HEADING",
            "info",
            "Setext-style heading detected. ATX-style headings (# Heading) are preferred.",
          ),
        );
        return;
      }
    }
  }
}

function checkDeepHeadings(content: string, findings: LintFinding[]): void {
  const lines = content.split("\n");
  for (const line of lines) {
    const headingMatch = line.match(/^(#{5,6}) (.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      findings.push(
        makeFinding(
          "DEEP_HEADING",
          "info",
          `H${level} heading level is too deep. Consider using H2-H4 for better structure.`,
        ),
      );
      return;
    }
  }
}

function checkDuplicateDecisionTitles(
  parsed: ParsedBriefMd,
  findings: LintFinding[],
): void {
  const decisions = parsed.decisions ?? [];
  const activeDecisions = decisions.filter((d) => d.status === "active");
  const seen = new Map<string, number>();

  for (const d of activeDecisions) {
    const key = d.text.toLowerCase().trim();
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }

  for (const [title, count] of seen) {
    if (count > 1) {
      findings.push(
        makeFinding(
          "DUPLICATE_ACTIVE",
          "info",
          `Duplicate active decision title found (${count} instances): "${title}"`,
        ),
      );
    }
  }
}

function checkOrphanedRefLinks(
  parsed: ParsedBriefMd,
  findings: LintFinding[],
): void {
  const comments = parsed.comments ?? [];
  const refLinks = comments.filter(
    (c): c is RefLinkTag => c.type === "ref-link",
  );
  const ontologyTags = comments.filter(
    (c): c is OntologyTag => c.type === "ontology",
  );

  const taggedEntries = new Set<string>();
  for (const tag of ontologyTags) {
    taggedEntries.add(`${tag.pack}:${tag.entryId}`);
  }

  for (const refLink of refLinks) {
    const key = `${refLink.pack}:${refLink.entryId}`;
    if (!taggedEntries.has(key)) {
      findings.push(
        makeFinding(
          "ORPHANED_REF_LINK",
          "info",
          `Orphaned reference link to ${key} — ontology entry is no longer tagged in this file`,
        ),
      );
    }
  }
}

function checkNonConformantExtensions(
  parsed: ParsedBriefMd,
  findings: LintFinding[],
): void {
  const extensions = parsed.extensions ?? [];
  const validExtName = /^[A-Za-z0-9][A-Za-z0-9_ ]*$/;

  for (const ext of extensions) {
    if (ext && !validExtName.test(ext)) {
      findings.push(
        makeFinding(
          "NONCONFORMANT_EXTENSION",
          "info",
          `Extension name "${ext}" does not conform to expected format [A-Za-z0-9_ ]+`,
        ),
      );
    }
  }
}

function checkDashSeparators(content: string, findings: LintFinding[]): void {
  const lines = content.split("\n");
  let metadataDelimiters = 0;
  let pastMetadata = false;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    // Track metadata block boundaries (bold-style or YAML frontmatter)
    if (!pastMetadata) {
      if (trimmed === "---") {
        metadataDelimiters++;
        if (metadataDelimiters >= 2) {
          pastMetadata = true;
        }
        continue;
      }
      // Detect end of bold-style metadata (first heading or blank after metadata)
      if (trimmed.startsWith("#") || (trimmed === "" && i > 0)) {
        pastMetadata = true;
      }
      if (trimmed.startsWith("**") && trimmed.includes(":**")) {
        continue;
      }
    }

    if (!pastMetadata) continue;

    // Detect -- or --- separator used as horizontal rule in body content
    if (/^-{2,}$/.test(trimmed)) {
      findings.push(
        makeFinding(
          "DASH_SEPARATOR",
          "info",
          "Double-dash separator detected. Consider using headings for section separation instead.",
        ),
      );
      return;
    }
  }
}

function checkUnrecognisedComments(
  content: string,
  parsed: ParsedBriefMd,
  findings: LintFinding[],
): void {
  // Check parsed unknown comments from the parser
  const comments = parsed.comments ?? [];
  for (const comment of comments) {
    if (comment.type === "unknown") {
      const unknownTag = comment as UnknownBriefTag;
      findings.push(
        makeFinding(
          "UNKNOWN_COMMENT",
          "info",
          `Unrecognised brief: comment directive: "${unknownTag.raw}"`,
        ),
      );
      return;
    }
  }

  // Fallback: scan raw content for directive-style HTML comments
  const knownBriefDirectives = new Set([
    "ontology",
    "ref-link",
    "has-exception",
  ]);
  const directiveRegex = /<!--\s*([\w-]+)\s*:\s*([\w-]+)/gi;
  let execResult = directiveRegex.exec(content);

  while (execResult !== null) {
    const prefix = execResult[1].toLowerCase();
    const directive = execResult[2].toLowerCase();

    if (prefix === "brief" && knownBriefDirectives.has(directive)) {
      execResult = directiveRegex.exec(content);
      continue;
    }

    findings.push(
      makeFinding(
        "UNKNOWN_COMMENT",
        "info",
        `Unrecognised comment directive: "${prefix}:${directive}"`,
      ),
    );
    return;
  }
}

function checkBundledGuideNotifications(
  parsed: ParsedBriefMd,
  findings: LintFinding[],
): void {
  const extensions = parsed.extensions ?? [];
  for (const ext of extensions) {
    if (ext) {
      findings.push(
        makeFinding(
          "BUNDLED_GUIDE_AVAILABLE",
          "info",
          `Extension "${ext}" is registered but no guide is loaded. A bundled guide may be available for ${ext}.`,
        ),
      );
    }
  }
}
