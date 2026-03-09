// src/type-intelligence/conflict-patterns.ts — Domain conflict pattern extraction
// Extracts machine-readable conflict pairs and tension prose from type guides.

import type { TypeGuide } from "../types/type-intelligence.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DomainConflictPatterns {
  /** Machine-readable pairs from YAML frontmatter — feeds heuristic layer */
  readonly pairs: ReadonlyArray<readonly [string, string]>;
  /** Rich prose from ## Known Tensions section — feeds AI layer prompt */
  readonly tensionProse?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Validate and normalise a raw conflict_patterns value from YAML frontmatter.
 * Accepts an array of [string, string] tuples; silently drops malformed entries.
 */
function parsePairs(raw: unknown): ReadonlyArray<readonly [string, string]> {
  if (!Array.isArray(raw)) return [];
  const pairs: Array<readonly [string, string]> = [];
  for (const entry of raw) {
    if (
      Array.isArray(entry) &&
      entry.length === 2 &&
      typeof entry[0] === "string" &&
      typeof entry[1] === "string" &&
      entry[0].length > 0 &&
      entry[1].length > 0
    ) {
      pairs.push([entry[0], entry[1]] as const);
    }
  }
  return pairs;
}

/**
 * Extract the content of a `## Known Tensions` section from a markdown body.
 * Returns the text between the heading and the next `##` heading (or EOF).
 */
function extractTensionSection(body: string): string | undefined {
  const pattern = /^##\s+Known\s+Tensions\s*$/im;
  const match = pattern.exec(body);
  if (!match) return undefined;

  const start = match.index + match[0].length;
  const rest = body.slice(start);

  // Find the next ## heading (or end of string)
  const nextHeading = /^##\s/m.exec(rest);
  const sectionContent = nextHeading ? rest.slice(0, nextHeading.index) : rest;

  const trimmed = sectionContent.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Extract domain conflict patterns from a loaded TypeGuide.
 * Returns empty patterns if the guide has none defined.
 */
export function extractConflictPatterns(
  guide: TypeGuide,
): DomainConflictPatterns {
  const meta = guide.metadata as unknown as Record<string, unknown>;
  const pairs = parsePairs(meta.conflictPatterns ?? meta.conflict_patterns);
  const tensionProse = guide.body
    ? extractTensionSection(guide.body)
    : undefined;

  return { pairs, tensionProse };
}
