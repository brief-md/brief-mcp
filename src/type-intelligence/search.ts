// src/type-intelligence/search.ts — WP2: Type guide search & suggestion (OQ-4/OQ-7)

import { getAliasIndex, getLoadedGuides } from "./loading.js";

interface SuggestCandidate {
  type: string;
  displayName: string;
  source: string;
  matchType: "exact" | "alias" | "keyword" | "related";
  relevanceScore: number;
  summary: string;
  suggestedExtensions?: string[];
  suggestedOntologies?: string[];
}

interface SuggestResult {
  candidates: SuggestCandidate[];
  hasExactMatch: boolean;
  signal: string;
}

/**
 * Tokenize a string into lowercase alphanumeric words,
 * filtering out empty strings and words shorter than 2 characters.
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 2);
}

/**
 * Extract a summary from guide body text: first line or first 200 chars.
 */
function extractSummary(body: string | undefined): string {
  if (!body) return "";
  const trimmed = body.trim();
  const firstNewline = trimmed.indexOf("\n");
  if (firstNewline !== -1 && firstNewline <= 200) {
    return trimmed.slice(0, firstNewline).trim();
  }
  if (trimmed.length > 200) {
    return trimmed.slice(0, 200);
  }
  return trimmed;
}

export async function suggestTypeGuides(params: {
  query: string;
  description?: string;
  earlyDecisions?: string;
  maxResults?: number;
}): Promise<SuggestResult> {
  const { query, description, earlyDecisions, maxResults = 5 } = params;

  if (!query || query.trim().length === 0) {
    return {
      candidates: [],
      hasExactMatch: false,
      signal: "No matching guides found. Proceed to brief_create_type_guide.",
    };
  }

  const guides = getLoadedGuides();
  const aliasIndex = getAliasIndex();
  const normalizedQuery = query.toLowerCase().trim();

  // Track which types have already been matched (for dedup)
  const matchedTypes = new Set<string>();
  const candidates: SuggestCandidate[] = [];

  // Tier 1: Exact match
  const exactGuide = guides.get(normalizedQuery);
  if (exactGuide && exactGuide.metadata.type !== "_generic") {
    matchedTypes.add(exactGuide.metadata.type);
    candidates.push({
      type: exactGuide.metadata.type,
      displayName: exactGuide.displayName,
      source: exactGuide.metadata.source,
      matchType: "exact",
      relevanceScore: 1.0,
      summary: extractSummary(exactGuide.body),
      suggestedExtensions: exactGuide.metadata.suggestedExtensions,
      suggestedOntologies: exactGuide.metadata.suggestedOntologies,
    });
  }

  // Tier 2: Alias match
  const aliasTarget = aliasIndex.get(normalizedQuery);
  if (aliasTarget && !matchedTypes.has(aliasTarget)) {
    const aliasGuide = guides.get(aliasTarget);
    if (aliasGuide && aliasGuide.metadata.type !== "_generic") {
      matchedTypes.add(aliasGuide.metadata.type);
      candidates.push({
        type: aliasGuide.metadata.type,
        displayName: aliasGuide.displayName,
        source: aliasGuide.metadata.source,
        matchType: "alias",
        relevanceScore: 0.9,
        summary: extractSummary(aliasGuide.body),
        suggestedExtensions: aliasGuide.metadata.suggestedExtensions,
        suggestedOntologies: aliasGuide.metadata.suggestedOntologies,
      });
    }
  }

  // Tier 3: Keyword match
  const combinedText = [query, description ?? "", earlyDecisions ?? ""].join(
    " ",
  );
  const queryTokens = tokenize(combinedText);

  if (queryTokens.length > 0) {
    for (const [, guide] of guides) {
      if (guide.metadata.type === "_generic") continue;
      if (matchedTypes.has(guide.metadata.type)) continue;

      // Build searchable text from guide body + metadata aliases
      const guideTextParts = [
        guide.body ?? "",
        guide.metadata.type,
        guide.displayName,
        ...(guide.metadata.typeAliases ?? []),
      ];
      const guideText = guideTextParts.join(" ").toLowerCase();

      let matchedCount = 0;
      for (const token of queryTokens) {
        if (guideText.includes(token)) {
          matchedCount++;
        }
      }

      if (matchedCount > 0) {
        // Cap keyword score at 0.8 so it's always below exact (1.0) and alias (0.9)
        const rawScore = matchedCount / queryTokens.length;
        const score = Math.min(rawScore * 0.8, 0.8);
        matchedTypes.add(guide.metadata.type);
        candidates.push({
          type: guide.metadata.type,
          displayName: guide.displayName,
          source: guide.metadata.source,
          matchType: "keyword",
          relevanceScore: Math.round(score * 1000) / 1000,
          summary: extractSummary(guide.body),
          suggestedExtensions: guide.metadata.suggestedExtensions,
          suggestedOntologies: guide.metadata.suggestedOntologies,
        });
      }
    }
  }

  // Tier 4: Related match (commonParentTypes / commonChildTypes)
  for (const [, guide] of guides) {
    if (guide.metadata.type === "_generic") continue;
    if (matchedTypes.has(guide.metadata.type)) continue;

    const parentTypes = guide.metadata.commonParentTypes ?? [];
    const childTypes = guide.metadata.commonChildTypes ?? [];
    const relatedTypes = [...parentTypes, ...childTypes];

    const isRelated = relatedTypes.some(
      (rt) => rt.toLowerCase() === normalizedQuery,
    );

    if (isRelated) {
      matchedTypes.add(guide.metadata.type);
      candidates.push({
        type: guide.metadata.type,
        displayName: guide.displayName,
        source: guide.metadata.source,
        matchType: "related",
        relevanceScore: 0.5,
        summary: extractSummary(guide.body),
        suggestedExtensions: guide.metadata.suggestedExtensions,
        suggestedOntologies: guide.metadata.suggestedOntologies,
      });
    }
  }

  // Sort descending by score, cap at maxResults
  candidates.sort((a, b) => b.relevanceScore - a.relevanceScore);
  const capped = candidates.slice(0, maxResults);

  const hasExactMatch = capped.some((c) => c.matchType === "exact");

  let signal: string;
  if (hasExactMatch) {
    signal = "An exact type guide exists.";
  } else if (capped.length > 0) {
    signal = "Potential matches found.";
  } else {
    signal = "No matching guides found. Proceed to brief_create_type_guide.";
  }

  return {
    candidates: capped,
    hasExactMatch,
    signal,
  };
}
