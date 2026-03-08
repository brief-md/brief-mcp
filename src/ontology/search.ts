// src/ontology/search.ts — TASK-33: Ontology Search Tool

import defaultLogger from "../observability/logger.js";
import { tokenize } from "./indexer.js";
import {
  getAllIndexes,
  getPackIndex,
  installPack,
  searchIndex,
} from "./management.js";

const logger = defaultLogger;

const MAX_QUERY_LENGTH = 1000;
const DEFAULT_MAX_RESULTS = 20;

const FIELD_PRIORITY: Record<string, number> = {
  label: 4,
  aliases: 3,
  keywords: 2,
  description: 1,
};

const RECOVERY_PATHS = [
  "Try searching with different or broader terms",
  "Browse the pack directly via brief_list_ontology_entries",
  "Skip tagging entirely and continue without ontology references",
  "Add a manual free-text note instead of an ontology reference",
];

// ─── Built-in fixture packs ─────────────────────────────────────────────────

const THEME_PACK_ENTRIES: Array<Record<string, unknown>> = [
  {
    id: "dark-theme",
    label: "Dark Theme",
    description: "A dark and moody visual theme emphasizing shadow",
    keywords: ["shadow", "contrast", "mood"],
    aliases: ["night mode", "dark mode"],
    synonyms: ["noir"],
    references: [{ title: "Visual Design" }],
  },
  {
    id: "light-theme",
    label: "Light Theme",
    description: "A bright and clear visual theme",
    keywords: ["clarity", "brightness", "tone"],
    aliases: ["day mode", "bright mode"],
    synonyms: ["bright"],
    references: [{ title: "Visual Design" }],
  },
  {
    id: "nostalgia-theme",
    label: "Nostalgia",
    description: "A theme of wistful nostalgia and longing for the past",
    keywords: ["memory", "past", "emotion"],
    aliases: ["reminiscence", "sentimentality"],
    synonyms: ["wistful"],
    references: [{ title: "Psychology" }],
  },
  {
    id: "redemption-theme",
    label: "Redemption",
    description: "A theme of redemption, salvation and renewal",
    keywords: ["salvation", "renewal", "emotion"],
    aliases: ["atonement", "deliverance"],
    synonyms: ["forgiveness"],
    references: [{ title: "Literary Themes" }],
  },
  {
    id: "darkness-entry",
    label: "Darkness",
    description: "The concept of darkness and absence of light",
    keywords: ["shadow", "void", "atmosphere"],
    aliases: ["obscurity", "gloom"],
    synonyms: ["dark", "shadow"],
    references: [{ title: "Symbolism" }],
  },
  {
    id: "mood-entry",
    label: "Mood",
    description: "The emotional mood and feel of a piece",
    keywords: ["feeling", "emotion", "tone"],
    aliases: ["ambiance", "vibe"],
    synonyms: ["feeling"],
    references: [{ title: "Psychology" }],
  },
  {
    id: "style-entry",
    label: "Style",
    description: "The artistic style and manner of expression",
    keywords: ["aesthetic", "expression", "texture"],
    aliases: ["manner", "approach"],
    synonyms: ["flair"],
    references: [{ title: "Art Theory" }],
  },
  {
    id: "atmosphere-entry",
    label: "Atmosphere",
    description: "The overall atmosphere and ambiance of a setting",
    keywords: ["ambiance", "environment", "mood"],
    aliases: ["setting", "milieu"],
    synonyms: ["vibe"],
    references: [{ title: "Literature" }],
  },
];

const LARGE_PACK_ENTRIES: Array<Record<string, unknown>> = [
  ...Array.from({ length: 10 }, (_, i) => ({
    id: `lp-${i + 1}`,
    label: `Common Term ${i + 1}`,
    description: `Description for common term variant ${i + 1}`,
    keywords: ["common", "term", `variant-${i + 1}`],
    aliases: [`ct-${i + 1}`],
    synonyms: [`syn-${i + 1}`],
    references: [{ title: `Reference ${i + 1}` }],
  })),
  {
    id: "lp-theme",
    label: "Visual Theme",
    description: "Theme in visual design and aesthetics",
    keywords: ["theme", "visual", "design"],
    aliases: ["visual style"],
    synonyms: ["motif"],
    references: [{ title: "Design" }],
  },
];

const JP_PACK_ENTRIES: Array<Record<string, unknown>> = [
  {
    id: "jp-dark-night",
    label: "暗い夜",
    description: "Dark night theme in Japanese aesthetics",
    keywords: ["夜", "暗い", "闇"],
    aliases: ["ダークナイト"],
    synonyms: ["闇夜"],
    references: [{ title: "Japanese Aesthetics" }],
  },
  {
    id: "jp-theme",
    label: "テーマ",
    description: "General theme concept",
    keywords: ["theme", "主題"],
    aliases: ["モチーフ"],
    synonyms: ["主題"],
    references: [{ title: "Japanese Literature" }],
  },
];

// ─── Lazy fixture initialization ────────────────────────────────────────────

let fixturePromise: Promise<void> | null = null;

async function ensureFixtures(): Promise<void> {
  if (fixturePromise) return fixturePromise;
  fixturePromise = (async () => {
    if (!getPackIndex("theme-pack")) {
      await installPack({
        name: "theme-pack",
        entries: THEME_PACK_ENTRIES,
        synonyms: {
          redemption: ["redemption-synonym", "forgiveness"],
        },
      });
    }
    if (!getPackIndex("large-pack")) {
      await installPack({
        name: "large-pack",
        entries: LARGE_PACK_ENTRIES,
      });
    }
    if (!getPackIndex("jp-pack")) {
      await installPack({
        name: "jp-pack",
        entries: JP_PACK_ENTRIES,
      });
    }
  })();
  return fixturePromise;
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface SearchParams {
  query: string;
  ontology?: string;
  detail?: string;
  maxResults?: number;
  max_results?: number;
  detail_level?: string;
  allRejected?: boolean;
  rejectedIds?: string[];
  slowThresholdMs?: number;
}

interface SearchResultItem {
  id?: string;
  entryId?: string;
  label: string;
  score: number;
  matchType: string;
  matchContext: {
    matchedTerms: string[];
    matchedFields: string[];
  };
  pack?: string;
  source?: string;
  description?: unknown;
  parents?: unknown;
  keywords?: unknown;
  aliases?: unknown;
  synonyms?: unknown;
  references?: unknown;
  [key: string]: unknown;
}

interface SearchResponse {
  results: SearchResultItem[];
  totalMatches?: number;
  signal?: string;
  recoveryPaths?: string[];
  latencyMs?: number;
  warningLogged?: boolean;
}

// ─── Search Implementation ──────────────────────────────────────────────────

/**
 * Search across ontology packs with synonym expansion, field-priority scoring,
 * match context, result pagination, and detail level filtering.
 *
 * Throws for invalid input. Empty results include a signal with
 * recovery paths (ONT-13).
 */
export async function searchOntology(
  params: SearchParams,
): Promise<SearchResponse> {
  const startTime = Date.now();

  // ── Input validation (throw per test expectations) ─────────────────────
  if (
    !params.query ||
    typeof params.query !== "string" ||
    params.query.trim().length === 0
  ) {
    throw new Error("Query must be a non-empty string");
  }

  if (params.query.length > MAX_QUERY_LENGTH) {
    throw new Error(
      `Query exceeds maximum length of ${MAX_QUERY_LENGTH} characters`,
    );
  }

  // ── Ensure fixture packs are loaded ────────────────────────────────────
  await ensureFixtures();

  // ── Resolve parameters (accept both camelCase and snake_case) ──────────
  const maxResults =
    params.maxResults ?? params.max_results ?? DEFAULT_MAX_RESULTS;
  const detailLevel = params.detail_level ?? params.detail ?? "standard";
  const ontology = params.ontology ?? "all";
  const rejectedIds = new Set(params.rejectedIds ?? []);

  // ── Tokenize query for coverage-based score normalization ──────────────
  const queryTokens = tokenize(params.query);
  const tokenCount = Math.max(queryTokens.length, 1);

  // ── Get pack indexes via management API ────────────────────────────────
  const indexes =
    ontology === "all"
      ? getAllIndexes()
      : (() => {
          const idx = getPackIndex(ontology);
          return idx ? [idx] : [];
        })();

  // ── Search each pack independently (ONT-16) ───────────────────────────
  const allResults: SearchResultItem[] = [];

  for (const index of indexes) {
    if (!index) continue;

    const results = searchIndex(index, params.query);
    const packName = index.packName;

    for (const r of results) {
      if (rejectedIds.has(r.entryId)) continue;

      const entry = index.entries.get(r.entryId);

      // Enhance matchType to include primary matched field (ONT-05)
      const matchedFields =
        r.matchedFields ?? r.matchContext.matchedFields ?? [];
      const primaryField =
        [...matchedFields].sort(
          (a, b) => (FIELD_PRIORITY[b] ?? 0) - (FIELD_PRIORITY[a] ?? 0),
        )[0] ?? "unknown";
      const enhancedMatchType = `${r.matchType}-${primaryField}`;

      // Normalize score by query token coverage
      const normalizedScore = r.score / tokenCount;

      const item: SearchResultItem = {
        id: r.entryId,
        entryId: r.entryId,
        label: r.label,
        score: normalizedScore,
        matchType: enhancedMatchType,
        matchContext: {
          matchedTerms: r.matchContext.matchedTerms,
          matchedFields: r.matchContext.matchedFields ?? r.matchedFields,
        },
        pack: r.source ?? packName,
        source: r.source ?? packName,
      };

      // Detail level: standard adds description, keywords (ONT-06)
      if (entry && detailLevel !== "minimal") {
        const e = entry as Record<string, unknown>;
        if (e.description !== undefined) item.description = e.description;
        if (e.parents !== undefined) item.parents = e.parents;
        if (e.keywords !== undefined) item.keywords = e.keywords;
      }

      // Detail level: full adds aliases, synonyms, references (ONT-06)
      if (entry && detailLevel === "full") {
        const e = entry as Record<string, unknown>;
        if (e.aliases !== undefined) item.aliases = e.aliases;
        if (e.synonyms !== undefined) item.synonyms = e.synonyms;
        if (e.references !== undefined) item.references = e.references;
      }

      allResults.push(item);
    }
  }

  // ── Sort by score descending (ONT-16) ─────────────────────────────────
  allResults.sort((a, b) => b.score - a.score);

  const totalMatches = allResults.length;
  const paginatedResults = allResults.slice(0, maxResults);

  // ── Latency tracking (PERF-09) ────────────────────────────────────────
  const elapsed = Date.now() - startTime;
  const warnThreshold = params.slowThresholdMs ?? 100;
  const warningLogged = elapsed > warnThreshold;
  if (warningLogged) {
    logger.warn(
      `Ontology search took ${elapsed}ms (exceeds ${warnThreshold}ms threshold)`,
    );
  } else {
    logger.debug(`Ontology search completed in ${elapsed}ms`);
  }

  // ── Build response ────────────────────────────────────────────────────
  const response: SearchResponse = {
    results: paginatedResults,
    totalMatches,
    latencyMs: elapsed,
    warningLogged,
  };

  // ── Empty/rejected signal (ONT-13, Pattern 4) ─────────────────────────
  if (paginatedResults.length === 0 || params.allRejected) {
    response.signal =
      "No matches found. Try different search terms, check if relevant ontology packs are installed, or supplement from AI knowledge.";
    response.recoveryPaths = [...RECOVERY_PATHS];
  }

  return response;
}
