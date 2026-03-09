// src/validation/conflicts.ts — TASK-30: Conflict Detection

/**
 * Heuristic cross-section conflict detection engine.
 * v1: keyword overlap with negation detection (DEC-04).
 * Errs on the side of over-reporting (false positives OK, false negatives are bugs).
 * Never modifies files. Never runs automatically from get_context.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConflictDecisionInput {
  text: string;
  status: string;
  section?: string;
  exceptionTo?: string;
}

export interface IntentionalTensionPair {
  itemA: string;
  itemB: string;
}

export interface CheckConflictsParams {
  decisions: ConflictDecisionInput[];
  constraints: string[];
  includeHierarchy?: boolean;
  hierarchyOverride?: boolean;
  intentionalTensions?: IntentionalTensionPair[];
  domainPatterns?: ReadonlyArray<readonly [string, string]>;
}

export interface ConflictItem {
  text: string;
  status: string;
}

export interface DetectedConflict {
  type?: string;
  source?: string;
  severity: string;
  items: ConflictItem[];
  resolutionOptions: string[];
}

export interface CheckConflictsResult {
  conflicts: DetectedConflict[];
  hierarchyIncluded?: boolean;
  filesModified: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RESOLUTION_OPTIONS: string[] = [
  "supersede",
  "exception",
  "update",
  "dismiss",
];

const STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "will",
  "would",
  "could",
  "should",
  "shall",
  "may",
  "might",
  "can",
  "must",
  "to",
  "of",
  "in",
  "for",
  "on",
  "with",
  "at",
  "by",
  "from",
  "as",
  "into",
  "through",
  "during",
  "before",
  "after",
  "above",
  "below",
  "between",
  "out",
  "off",
  "over",
  "under",
  "again",
  "further",
  "then",
  "once",
  "here",
  "there",
  "when",
  "where",
  "why",
  "how",
  "all",
  "each",
  "every",
  "both",
  "few",
  "more",
  "most",
  "other",
  "some",
  "such",
  "only",
  "own",
  "same",
  "than",
  "too",
  "very",
  "just",
  "because",
  "but",
  "and",
  "or",
  "if",
  "while",
  "that",
  "this",
  "these",
  "those",
  "it",
  "its",
  "we",
  "they",
  "he",
  "she",
  "them",
  "their",
  "about",
  "also",
  "which",
  "what",
  "who",
]);

const NEGATION_PATTERNS: RegExp[] = [
  /\bnot\b/i,
  /\bno\b/i,
  /\bnever\b/i,
  /\bwithout\b/i,
  /\bavoid\b/i,
  /\bnone\b/i,
  /\bneither\b/i,
  /\bnor\b/i,
  /\bexclud(?:e[ds]?|ing)\b/i,
  /\breject(?:ed|s)?\b/i,
  /\bprohibit(?:ed|s)?\b/i,
  /\bforbid(?:den|s)?\b/i,
  /\bdon'?t\b/i,
  /\bdoesn'?t\b/i,
  /\bwon'?t\b/i,
  /\bcan'?t\b/i,
  /\bisn'?t\b/i,
  /\baren'?t\b/i,
  /\bshouldn'?t\b/i,
  /\bwouldn'?t\b/i,
  /\bcouldn'?t\b/i,
  /\bhasn'?t\b/i,
  /\bhaven'?t\b/i,
];

const ANTONYM_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["minimal", "complex"],
  ["minimal", "comprehensive"],
  ["minimal", "extensive"],
  ["minimal", "maximal"],
  ["simple", "complex"],
  ["simple", "complicated"],
  ["simple", "elaborate"],
  ["include", "exclude"],
  ["allow", "disallow"],
  ["allow", "forbid"],
  ["allow", "prohibit"],
  ["allow", "prevent"],
  ["enable", "disable"],
  ["add", "remove"],
  ["open", "closed"],
  ["public", "private"],
  ["internal", "external"],
  ["sync", "async"],
  ["synchronous", "asynchronous"],
  ["mandatory", "optional"],
  ["required", "optional"],
  ["static", "dynamic"],
  ["mutable", "immutable"],
  ["strict", "relaxed"],
  ["strict", "lenient"],
  ["centralized", "decentralized"],
  ["monolithic", "modular"],
  ["lightweight", "heavyweight"],
  ["fast", "slow"],
  ["manual", "automatic"],
  ["manual", "automated"],
  ["accept", "reject"],
  ["global", "local"],
  ["verbose", "concise"],
  ["tight", "loose"],
];

// ---------------------------------------------------------------------------
// Keyword extraction & analysis
// ---------------------------------------------------------------------------

function extractKeywords(text: string): Set<string> {
  const words = text.toLowerCase().split(/[\s\W]+/);
  const keywords = new Set<string>();
  for (const w of words) {
    if (w.length > 2 && !STOP_WORDS.has(w)) {
      keywords.add(w);
    }
  }
  return keywords;
}

function hasNegation(text: string): boolean {
  return NEGATION_PATTERNS.some((p) => p.test(text));
}

function keywordOverlap(a: Set<string>, b: Set<string>): number {
  let count = 0;
  for (const word of a) {
    if (b.has(word)) count++;
  }
  return count;
}

function hasAntonymConflict(
  keywordsA: Set<string>,
  keywordsB: Set<string>,
  antonyms: ReadonlyArray<readonly [string, string]> = ANTONYM_PAIRS,
): boolean {
  for (const [wordA, wordB] of antonyms) {
    if (
      (keywordsA.has(wordA) && keywordsB.has(wordB)) ||
      (keywordsA.has(wordB) && keywordsB.has(wordA))
    ) {
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Pairwise conflict detectors
// ---------------------------------------------------------------------------

function detectDecisionDecisionConflict(
  textA: string,
  textB: string,
  antonyms: ReadonlyArray<readonly [string, string]> = ANTONYM_PAIRS,
): boolean {
  // Direct negation containment: "A" vs "Not A" (DEC-04 over-report)
  if (hasNegation(textA) !== hasNegation(textB)) {
    const plain = hasNegation(textA) ? textB : textA;
    const negated = hasNegation(textA) ? textA : textB;
    if (negated.toLowerCase().includes(plain.toLowerCase().trim())) {
      return true;
    }
  }

  const kwA = extractKeywords(textA);
  const kwB = extractKeywords(textB);
  if (kwA.size === 0 || kwB.size === 0) return false;

  // Antonym pairs → conflict
  if (hasAntonymConflict(kwA, kwB, antonyms)) return true;

  // Negation difference + keyword overlap → conflict
  const overlap = keywordOverlap(kwA, kwB);
  if (overlap > 0 && hasNegation(textA) !== hasNegation(textB)) return true;

  // High keyword overlap → potential conflict (over-report per DEC-04)
  const minSize = Math.min(kwA.size, kwB.size);
  if (minSize > 0 && overlap >= Math.max(1, Math.ceil(minSize * 0.3)))
    return true;

  return false;
}

function detectDecisionConstraintConflict(
  decisionText: string,
  constraintText: string,
  antonyms: ReadonlyArray<readonly [string, string]> = ANTONYM_PAIRS,
): boolean {
  const kwD = extractKeywords(decisionText);
  const kwC = extractKeywords(constraintText);
  if (kwD.size === 0 || kwC.size === 0) return false;

  // Antonym pairs → conflict
  if (hasAntonymConflict(kwD, kwC, antonyms)) return true;

  // Constraints are inherently negated ("What This Is NOT")
  // Keyword overlap without decision self-negating → conflict
  const overlap = keywordOverlap(kwD, kwC);
  if (overlap > 0 && !hasNegation(decisionText)) return true;

  return false;
}

function detectConstraintConstraintConflict(
  textA: string,
  textB: string,
  antonyms: ReadonlyArray<readonly [string, string]> = ANTONYM_PAIRS,
): boolean {
  const kwA = extractKeywords(textA);
  const kwB = extractKeywords(textB);
  if (kwA.size === 0 || kwB.size === 0) return false;

  // Antonym pairs → conflict
  if (hasAntonymConflict(kwA, kwB, antonyms)) return true;

  // Overlapping keywords (potential redundancy/contradiction)
  const overlap = keywordOverlap(kwA, kwB);
  const minSize = Math.min(kwA.size, kwB.size);
  if (minSize > 0 && overlap >= Math.max(1, Math.ceil(minSize * 0.3))) {
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Intentional tension suppression
// ---------------------------------------------------------------------------

function matchesTensionItem(text: string, tensionItem: string): boolean {
  const tLower = text.toLowerCase().trim();
  const iLower = tensionItem.toLowerCase().trim();
  return (
    tLower === iLower || tLower.includes(iLower) || iLower.includes(tLower)
  );
}

function isSuppressedByTension(
  textA: string,
  textB: string,
  tensions: IntentionalTensionPair[],
): boolean {
  for (const t of tensions) {
    if (
      (matchesTensionItem(textA, t.itemA) &&
        matchesTensionItem(textB, t.itemB)) ||
      (matchesTensionItem(textA, t.itemB) && matchesTensionItem(textB, t.itemA))
    ) {
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Main export — checkConflicts
// ---------------------------------------------------------------------------

export function checkConflicts(
  params: CheckConflictsParams,
): CheckConflictsResult {
  const {
    decisions,
    constraints,
    includeHierarchy = true,
    hierarchyOverride = false,
    intentionalTensions = [],
    domainPatterns,
  } = params;

  const effectiveAntonyms: ReadonlyArray<readonly [string, string]> =
    domainPatterns && domainPatterns.length > 0
      ? [...ANTONYM_PAIRS, ...domainPatterns]
      : ANTONYM_PAIRS;

  const conflicts: DetectedConflict[] = [];
  const hierarchyEnabled = includeHierarchy || hierarchyOverride;
  // Filter: only active decisions without exceptionTo (DEC-04)
  const activeDecisions = decisions.filter(
    (d) => d.status === "active" && !d.exceptionTo,
  );

  // 1. Decision vs decision (pairwise)
  for (let i = 0; i < activeDecisions.length; i++) {
    for (let j = i + 1; j < activeDecisions.length; j++) {
      const a = activeDecisions[i];
      const b = activeDecisions[j];

      const isHierarchyPair = !!(
        a.section &&
        b.section &&
        a.section !== b.section
      );

      // Skip hierarchy pairs if hierarchy not enabled
      if (isHierarchyPair && !hierarchyEnabled) continue;

      // Intentional tension suppression (DEC-09)
      if (isSuppressedByTension(a.text, b.text, intentionalTensions)) continue;

      if (detectDecisionDecisionConflict(a.text, b.text, effectiveAntonyms)) {
        const conflict: DetectedConflict = {
          type: isHierarchyPair ? "cross-section" : "decision-decision",
          severity: isHierarchyPair ? "info" : "warning",
          items: [
            { text: a.text, status: a.status },
            { text: b.text, status: b.status },
          ],
          resolutionOptions: [...RESOLUTION_OPTIONS],
        };
        if (isHierarchyPair) {
          conflict.source = "hierarchy";
        }
        conflicts.push(conflict);
      }
    }
  }

  // 2. Decision vs constraint
  for (const decision of activeDecisions) {
    for (const constraint of constraints) {
      if (
        isSuppressedByTension(decision.text, constraint, intentionalTensions)
      ) {
        continue;
      }

      const detected = detectDecisionConstraintConflict(
        decision.text,
        constraint,
        effectiveAntonyms,
      );
      if (detected || hierarchyOverride) {
        const isHierarchy = hierarchyEnabled;
        conflicts.push({
          type: "decision-constraint",
          severity: isHierarchy ? "info" : "warning",
          source: isHierarchy ? "hierarchy" : undefined,
          items: [
            { text: decision.text, status: decision.status },
            { text: constraint, status: "constraint" },
          ],
          resolutionOptions: [...RESOLUTION_OPTIONS],
        });
      }
    }
  }

  // 3. Constraint vs constraint (OQ-213, DEC-13 disambiguation)
  for (let i = 0; i < constraints.length; i++) {
    for (let j = i + 1; j < constraints.length; j++) {
      if (
        isSuppressedByTension(
          constraints[i],
          constraints[j],
          intentionalTensions,
        )
      ) {
        continue;
      }

      if (
        detectConstraintConstraintConflict(
          constraints[i],
          constraints[j],
          effectiveAntonyms,
        )
      ) {
        conflicts.push({
          type: "constraint-constraint",
          severity: "warning",
          items: [
            { text: constraints[i], status: "constraint" },
            { text: constraints[j], status: "constraint" },
          ],
          resolutionOptions: [...RESOLUTION_OPTIONS],
        });
      }
    }
  }

  return {
    conflicts,
    hierarchyIncluded: hierarchyEnabled,
    filesModified: 0,
  };
}
