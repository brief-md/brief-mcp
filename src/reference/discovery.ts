// src/reference/discovery.ts — Reference discovery pipeline
// Builds context-aware search queries from extension data and returns
// local suggestions + a structured search query for the AI to use.

import { getTypeGuide } from "../type-intelligence/loading.js"; // check-rules-ignore
import { suggestReferences } from "./suggestion.js"; // check-rules-ignore

/* ------------------------------------------------------------------ */
/*  Stopwords — filtered from search queries for conciseness          */
/* ------------------------------------------------------------------ */

const STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "but",
  "in",
  "on",
  "at",
  "to",
  "for",
  "of",
  "with",
  "by",
  "from",
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
  "may",
  "might",
  "can",
  "this",
  "that",
  "these",
  "those",
  "it",
  "its",
  "not",
  "no",
  "so",
  "if",
  "then",
  "than",
  "as",
  "about",
  "into",
  "through",
  "during",
  "before",
  "after",
  "above",
  "below",
  "between",
  "each",
  "every",
  "all",
  "any",
  "both",
  "some",
  "such",
  "very",
  "just",
  "also",
  "more",
  "most",
  "other",
  "only",
]);

/* ------------------------------------------------------------------ */
/*  Project type → reference type fallbacks                           */
/* ------------------------------------------------------------------ */

const TYPE_REFERENCE_HINTS: Record<string, string[]> = {
  film: ["films", "documentaries", "TV series"],
  movie: ["films", "documentaries"],
  album: ["albums", "artists", "songs"],
  music: ["albums", "artists", "songs"],
  song: ["songs", "albums", "artists"],
  book: ["books", "novels", "authors"],
  novel: ["novels", "books", "authors"],
  game: ["games", "interactive experiences"],
  podcast: ["podcasts", "audio series"],
  documentary: ["documentaries", "films"],
  series: ["TV series", "films"],
  play: ["plays", "theatre productions"],
  exhibition: ["exhibitions", "art installations"],
};

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface LocalSuggestion {
  creator: string;
  title: string;
  type?: string;
  pack: string;
  entryId?: string;
  matchReason: string;
}

export interface SearchQueryContext {
  query: string;
  referenceTypes: string[];
  searchHints: string[];
  contextSummary: string;
}

export interface DiscoverReferencesResult {
  extensionName: string;
  localSuggestions: LocalSuggestion[];
  searchContext: SearchQueryContext | null;
  tierSignals: {
    webSearch: boolean;
    aiKnowledge: boolean;
    manual: boolean;
  };
  instructions: string;
}

/* ------------------------------------------------------------------ */
/*  Query builder                                                      */
/* ------------------------------------------------------------------ */

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s,;:./\-_]+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

function buildSearchQuery(params: {
  entryLabels?: string[];
  entryDescriptions?: string[];
  entryTags?: string[];
  extensionName: string;
  extensionDescription?: string;
  referenceTypes: string[];
}): SearchQueryContext {
  const {
    entryLabels = [],
    entryDescriptions = [],
    entryTags = [],
    extensionName,
    extensionDescription,
    referenceTypes,
  } = params;

  // Priority: entry labels > tags > extension name > descriptions
  const tokens: string[] = [];
  const seen = new Set<string>();

  const addTokens = (source: string[]) => {
    for (const s of source) {
      for (const t of tokenize(s)) {
        if (!seen.has(t)) {
          seen.add(t);
          tokens.push(t);
        }
      }
    }
  };

  addTokens(entryLabels);
  addTokens(entryTags);
  addTokens([extensionName]);
  if (extensionDescription) addTokens([extensionDescription]);
  addTokens(entryDescriptions);

  // Take top ~8 tokens for conciseness
  const topTokens = tokens.slice(0, 8);

  // Build query: reference types + top tokens
  const typePrefix =
    referenceTypes.length > 0 ? referenceTypes[0] : "references";
  const query = `${typePrefix} ${topTokens.join(" ")}`.trim();

  // Summary of what we used
  const parts: string[] = [];
  if (entryLabels.length > 0)
    parts.push(`entry labels: ${entryLabels.join(", ")}`);
  if (entryTags.length > 0) parts.push(`tags: ${entryTags.join(", ")}`);
  if (entryLabels.length === 0 && entryTags.length === 0) {
    parts.push(`extension: ${extensionName}`);
  }

  return {
    query,
    referenceTypes,
    searchHints: [],
    contextSummary: parts.join("; "),
  };
}

/* ------------------------------------------------------------------ */
/*  Instructions builder                                               */
/* ------------------------------------------------------------------ */

function buildInstructions(
  localCount: number,
  searchContext: SearchQueryContext | null,
  entryLabels: string[],
): string {
  const parts: string[] = [];

  if (localCount > 0) {
    parts.push(
      `Found ${localCount} local suggestion${localCount > 1 ? "s" : ""}.`,
    );
  } else {
    parts.push("No local reference pack matches found.");
  }

  if (searchContext) {
    const themeList =
      entryLabels.length > 0
        ? entryLabels.slice(0, 5).join(", ")
        : "the extension context";
    parts.push(
      `Use the search query to find real-world works via web search.`,
      `The query targets ${searchContext.referenceTypes[0] ?? "references"} whose attributes overlap with: ${themeList}.`,
      `Present results in a numbered list with titles, creators, descriptions, and links.`,
      `Let the user pick multiple (e.g., "1, 3, 5" or "all").`,
    );
  }

  parts.push(
    `For each selected reference, call brief_add_reference with section, creator, title, notes, and url.`,
  );

  return parts.join(" ");
}

/* ------------------------------------------------------------------ */
/*  Main function                                                      */
/* ------------------------------------------------------------------ */

export async function discoverReferences(params: {
  extensionName: string;
  extensionDescription?: string;
  entryLabels?: string[];
  entryDescriptions?: string[];
  entryTags?: string[];
  projectType?: string;
  existingReferences?: Array<{ creator: string; title: string }>;
  maxResults?: number;
}): Promise<DiscoverReferencesResult> {
  const {
    extensionName,
    extensionDescription,
    entryLabels = [],
    entryDescriptions = [],
    entryTags = [],
    projectType,
    existingReferences = [],
    maxResults = 10,
  } = params;

  // ── Load type guide for referenceSources (best-effort) ──
  let referenceTypes: string[] = [];
  const searchHints: string[] = [];

  if (projectType) {
    try {
      const res = await getTypeGuide({ type: projectType });
      if (res.guide?.metadata?.referenceSources) {
        // Parse referenceSources — may be like ["IMDB for films", "Discogs"]
        for (const src of res.guide.metadata.referenceSources) {
          searchHints.push(src);
          // Extract reference type from hints like "IMDB for films"
          const forMatch = src.match(/for\s+(.+)/i);
          if (forMatch) {
            referenceTypes.push(forMatch[1].trim());
          }
        }
      }
    } catch {
      // Type guide unavailable — use fallbacks
    }

    // Fallback: infer from project type if no referenceSources
    if (referenceTypes.length === 0) {
      const typeLower = projectType.toLowerCase();
      referenceTypes = TYPE_REFERENCE_HINTS[typeLower] ?? [];
    }
  }

  // ── Search local reference packs ──
  const localSuggestions: LocalSuggestion[] = [];

  try {
    // Build context string from extension data
    const contextParts = [extensionName];
    if (extensionDescription) contextParts.push(extensionDescription);
    contextParts.push(...entryLabels);
    contextParts.push(...entryTags);
    const contextStr = contextParts.join(" ").slice(0, 300);

    const result = await suggestReferences({
      context: { section: contextStr, activeExtensions: [] },
      webSearch: true,
    });

    // Build exclusion set
    const excludeSet = new Set(
      existingReferences.map(
        (r) => `${r.creator.toLowerCase()}:${r.title.toLowerCase()}`,
      ),
    );

    for (const suggestion of result.suggestions) {
      const entry = suggestion.entry;
      const creator = entry.creator ?? "";
      const title = entry.title;

      // Skip excluded references
      if (excludeSet.has(`${creator.toLowerCase()}:${title.toLowerCase()}`)) {
        continue;
      }

      // Build match reason from overlapping attributes
      const overlaps: string[] = [];
      for (const label of entryLabels) {
        const labelLower = label.toLowerCase();
        if (
          entry.tags.some((t) => t.toLowerCase().includes(labelLower)) ||
          entry.categories.some((c) => c.toLowerCase().includes(labelLower)) ||
          entry.title.toLowerCase().includes(labelLower)
        ) {
          overlaps.push(label);
        }
      }
      for (const tag of entryTags) {
        const tagLower = tag.toLowerCase();
        if (
          entry.tags.some((t) => t.toLowerCase().includes(tagLower)) ||
          entry.categories.some((c) => c.toLowerCase().includes(tagLower))
        ) {
          if (!overlaps.includes(tag)) overlaps.push(tag);
        }
      }

      const matchReason =
        overlaps.length > 0
          ? `matches: ${overlaps.join(", ")}`
          : `matches extension context`;

      localSuggestions.push({
        creator,
        title,
        type: entry.categories[0],
        pack: entry.pack,
        entryId: entry.entryId,
        matchReason,
      });

      if (localSuggestions.length >= maxResults) break;
    }
  } catch {
    // Local search failed — continue with web search tier
  }

  // ── Build search query ──
  const LOCAL_SUFFICIENT_THRESHOLD = 5;
  const needsExternalSearch =
    localSuggestions.length < LOCAL_SUFFICIENT_THRESHOLD;

  const searchContext = needsExternalSearch
    ? buildSearchQuery({
        entryLabels,
        entryDescriptions,
        entryTags,
        extensionName,
        extensionDescription,
        referenceTypes,
      })
    : null;

  // Add search hints to context if present
  if (searchContext && searchHints.length > 0) {
    searchContext.searchHints = searchHints;
  }

  // ── Tier signals ──
  const tierSignals = {
    webSearch: needsExternalSearch,
    aiKnowledge: needsExternalSearch,
    manual: true,
  };

  // ── Instructions ──
  const instructions = buildInstructions(
    localSuggestions.length,
    searchContext,
    entryLabels,
  );

  return {
    extensionName,
    localSuggestions,
    searchContext,
    tierSignals,
    instructions,
  };
}
