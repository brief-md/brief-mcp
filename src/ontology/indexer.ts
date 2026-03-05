// src/ontology/indexer.ts — TASK-32a: Ontology Index Building

import defaultLogger from "../observability/logger.js";

const logger = defaultLogger;

// ─── Types ──────────────────────────────────────────────────────────────────

interface IndexEntry {
  entryId: string;
  field: string;
  baseScore: number;
  source: string;
}

interface ForwardIndex {
  terms: Map<string, IndexEntry[]>;
  entries: Map<string, EntryData>;
  packName: string;
  entryCount: number;
  byReference: Map<string, { pack: string; entryId: string }[]>;
  synonyms: Record<string, string[]>;
}

interface EntryData {
  id: string;
  label: string;
  source: string;
  [key: string]: unknown;
}

interface SearchResult {
  entryId: string;
  score: number;
  label: string;
  matchContext: {
    matchedTerms: string[];
    matchedFields?: string[];
  };
  matchedFields: string[];
  matchType: string;
  source?: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const FIELD_MULTIPLIERS: Record<string, number> = {
  label: 4,
  aliases: 3,
  keywords: 2,
  description: 1,
};

const DEFAULT_SEARCH_FIELDS = ["label", "aliases", "keywords", "description"];

const DIRECT_MATCH_MULTIPLIER = 1.5;

// ─── Tokenization via Intl.Segmenter (ONT-17) ──────────────────────────────

const segmenter = new Intl.Segmenter(undefined, { granularity: "word" });

function tokenize(text: string): string[] {
  if (!text || typeof text !== "string") return [];
  const segments = segmenter.segment(text);
  const tokens: string[] = [];
  for (const seg of segments) {
    if (seg.isWordLike) {
      const normalized = seg.segment.toLowerCase().trim();
      if (normalized.length > 0) {
        tokens.push(normalized);
      }
    }
  }
  return tokens;
}

// ─── Synonym Expansion (ONT-02, ONT-11, ONT-14) ────────────────────────────

/**
 * Expand a term using synonym groups. Pack synonyms override global for same term.
 * The key of each synonym group is itself part of the group (bidirectional).
 * Returns all expanded terms (including the original term).
 */
export function expandSynonyms(
  term: string,
  globalSynonyms?: Record<string, string[]>,
  packSynonyms?: Record<string, string[]>,
): string[] {
  const normalized = term.toLowerCase().trim();
  if (!normalized) return [normalized];

  const expanded = new Set<string>([normalized]);

  // Pack synonyms take priority (ONT-11)
  let foundInPack = false;
  if (packSynonyms) {
    for (const [groupKey, group] of Object.entries(packSynonyms)) {
      const normalizedKey = groupKey.toLowerCase().trim();
      const normalizedGroup = group.map((s) => s.toLowerCase().trim());
      if (
        normalizedKey === normalized ||
        normalizedGroup.includes(normalized)
      ) {
        foundInPack = true;
        expanded.add(normalizedKey);
        for (const syn of normalizedGroup) {
          expanded.add(syn);
        }
      }
    }
  }

  // Global synonyms as fallback — only if term NOT found in pack synonyms
  if (!foundInPack && globalSynonyms) {
    for (const [groupKey, group] of Object.entries(globalSynonyms)) {
      const normalizedKey = groupKey.toLowerCase().trim();
      const normalizedGroup = group.map((s) => s.toLowerCase().trim());
      if (
        normalizedKey === normalized ||
        normalizedGroup.includes(normalized)
      ) {
        expanded.add(normalizedKey);
        for (const syn of normalizedGroup) {
          expanded.add(syn);
        }
      }
    }
  }

  return [...expanded];
}

// ─── Pack Name Resolution ───────────────────────────────────────────────────

function resolvePackName(pack: Record<string, unknown>): string {
  if (typeof pack.name === "string" && pack.name) return pack.name;
  if (typeof pack.packName === "string" && pack.packName) return pack.packName;
  if (typeof pack.pack === "string" && pack.pack) return pack.pack;
  return "unknown";
}

// ─── Build Index (ONT-07) ───────────────────────────────────────────────────

/**
 * Build a forward index for a single pack.
 * Indexes direct terms only — synonym expansion happens at search time.
 * Stores pack synonyms in the index for use during search.
 * Returns index object with `entryCount` and `packName` properties.
 */
export function buildIndex(pack: {
  name?: string;
  packName?: string;
  entries: Array<Record<string, unknown>>;
  synonyms?: Record<string, string[]>;
  searchFields?: string[];
  [key: string]: unknown;
}): ForwardIndex {
  const startTime = Date.now();
  const resolvedName = resolvePackName(pack as Record<string, unknown>);

  const fields = pack.searchFields ?? DEFAULT_SEARCH_FIELDS;
  const terms = new Map<string, IndexEntry[]>();
  const entries = new Map<string, EntryData>();
  const byReference = new Map<string, { pack: string; entryId: string }[]>();

  for (const rawEntry of pack.entries) {
    const entry = rawEntry as Record<string, unknown>;
    const entryId = entry.id as string;
    const label = (entry.label as string) ?? "";

    entries.set(entryId, {
      id: entryId,
      label,
      source: resolvedName,
      ...entry,
    });

    // Index each configured field — direct terms only
    for (const field of fields) {
      const multiplier = FIELD_MULTIPLIERS[field] ?? 1;
      const value = entry[field];

      if (value === undefined || value === null) continue;

      let textsToIndex: string[];
      if (Array.isArray(value)) {
        textsToIndex = value.filter((v): v is string => typeof v === "string");
      } else if (typeof value === "string") {
        textsToIndex = [value];
      } else {
        continue;
      }

      for (const text of textsToIndex) {
        const tokens = tokenize(text);
        for (const token of tokens) {
          if (!terms.has(token)) {
            terms.set(token, []);
          }
          const existing = terms.get(token)!;
          if (
            !existing.some((e) => e.entryId === entryId && e.field === field)
          ) {
            existing.push({
              entryId,
              field,
              baseScore: multiplier,
              source: resolvedName,
            });
          }
        }
      }
    }

    // Build reverse reference index
    const refs = entry.references as
      | Array<{ creator?: string; title?: string }>
      | undefined;
    if (Array.isArray(refs)) {
      for (const ref of refs) {
        if (ref && typeof ref === "object" && ref.title) {
          const key = ref.creator ? `${ref.creator}:${ref.title}` : ref.title;
          if (!byReference.has(key)) {
            byReference.set(key, []);
          }
          byReference.get(key)!.push({ pack: resolvedName, entryId });
        }
      }
    }
  }

  const elapsed = Date.now() - startTime;
  logger.debug(`Index built for pack "${resolvedName}" in ${elapsed}ms`);

  return {
    terms,
    entries,
    packName: resolvedName,
    entryCount: pack.entries.length,
    byReference,
    synonyms: pack.synonyms ?? {},
  };
}

// ─── Search Index (ONT-03, ONT-04, ONT-05) ─────────────────────────────────

/**
 * Search a single index for matching entries.
 * Synonym expansion happens at search time using index-stored synonyms
 * plus any additional synonyms provided via options.
 * Direct matches get 1.5x multiplier over synonym-expanded matches (ONT-04).
 * Per query token per entry: if direct match exists, only direct scores count;
 * synonym scores are used only for entries not found by the direct term.
 * Returns results sorted by score descending.
 */
export function searchIndex(
  index: ForwardIndex,
  query: string,
  options?: {
    globalSynonyms?: Record<string, string[]>;
    packSynonyms?: Record<string, string[]>;
  },
): SearchResult[] {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];

  const { globalSynonyms, packSynonyms } = options ?? {};

  // Use index's stored synonyms as pack synonyms unless overridden
  const effectivePackSynonyms =
    packSynonyms ??
    (Object.keys(index.synonyms).length > 0 ? index.synonyms : undefined);

  // Score accumulator per entry
  const scoreMap = new Map<
    string,
    {
      score: number;
      matchedTerms: Set<string>;
      matchedFields: Set<string>;
      hasDirect: boolean;
      hasSynonym: boolean;
      source: string;
    }
  >();

  for (const token of queryTokens) {
    // Expand query term via synonyms at search time (ONT-02)
    let searchTerms: string[];
    if (effectivePackSynonyms || globalSynonyms) {
      searchTerms = expandSynonyms(
        token,
        globalSynonyms,
        effectivePackSynonyms,
      );
    } else {
      searchTerms = [token];
    }

    // Per entry: collect direct and synonym matches separately (ONT-04)
    // Direct matches take priority — synonym scores only used for entries
    // not found by the direct term, ensuring direct >= 1.5x synonym.
    const directScores = new Map<
      string,
      { score: number; terms: Set<string>; fields: Set<string>; source: string }
    >();
    const synonymScores = new Map<
      string,
      { score: number; terms: Set<string>; fields: Set<string>; source: string }
    >();

    for (const searchTerm of searchTerms) {
      const isDirect = searchTerm === token;
      const indexEntries = index.terms.get(searchTerm);
      if (!indexEntries) continue;

      const targetMap = isDirect ? directScores : synonymScores;

      for (const ie of indexEntries) {
        if (!targetMap.has(ie.entryId)) {
          targetMap.set(ie.entryId, {
            score: 0,
            terms: new Set(),
            fields: new Set(),
            source: ie.source,
          });
        }
        const acc = targetMap.get(ie.entryId)!;
        const matchMultiplier = isDirect ? DIRECT_MATCH_MULTIPLIER : 1;
        acc.score += ie.baseScore * matchMultiplier;
        acc.terms.add(searchTerm);
        acc.fields.add(ie.field);
      }
    }

    // Merge into global scoreMap: use direct scores when available,
    // synonym scores only for entries without direct matches
    const allEntryIds = new Set([
      ...directScores.keys(),
      ...synonymScores.keys(),
    ]);

    for (const entryId of allEntryIds) {
      const direct = directScores.get(entryId);
      const synonym = synonymScores.get(entryId);
      const primary = direct ?? synonym!;
      const isDirect = !!direct;

      if (!scoreMap.has(entryId)) {
        scoreMap.set(entryId, {
          score: 0,
          matchedTerms: new Set(),
          matchedFields: new Set(),
          hasDirect: false,
          hasSynonym: false,
          source: primary.source,
        });
      }
      const acc = scoreMap.get(entryId)!;

      // Score comes only from the primary match type
      acc.score += primary.score;

      // Track all matched terms and fields for context (ONT-05)
      for (const t of primary.terms) acc.matchedTerms.add(t);
      for (const f of primary.fields) acc.matchedFields.add(f);
      if (synonym) {
        for (const t of synonym.terms) acc.matchedTerms.add(t);
        for (const f of synonym.fields) acc.matchedFields.add(f);
      }

      if (isDirect) {
        acc.hasDirect = true;
      } else {
        acc.hasSynonym = true;
      }
    }
  }

  // Build results
  const results: SearchResult[] = [];
  for (const [entryId, acc] of scoreMap.entries()) {
    const entryData = index.entries.get(entryId);
    if (!entryData) continue;

    results.push({
      entryId,
      score: acc.score,
      label: entryData.label,
      matchContext: {
        matchedTerms: [...acc.matchedTerms],
        matchedFields: [...acc.matchedFields],
      },
      matchedFields: [...acc.matchedFields],
      matchType: acc.hasDirect ? "direct" : "synonym",
      source: acc.source,
    });
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  return results;
}

// ─── Merge Indexes (ONT-07) ────────────────────────────────────────────────

/**
 * Merge multiple pack indexes into a combined index.
 * Results from all packs are combined; byReference and synonyms are merged.
 */
export function mergeIndexes(indexes: ForwardIndex[]): ForwardIndex {
  const mergedTerms = new Map<string, IndexEntry[]>();
  const mergedEntries = new Map<string, EntryData>();
  const mergedByReference = new Map<
    string,
    { pack: string; entryId: string }[]
  >();
  const mergedSynonyms: Record<string, string[]> = {};
  let totalEntries = 0;

  for (const idx of indexes) {
    totalEntries += idx.entryCount;

    // Merge terms — each IndexEntry retains its source pack
    for (const [term, entries] of idx.terms.entries()) {
      if (!mergedTerms.has(term)) {
        mergedTerms.set(term, []);
      }
      mergedTerms.get(term)!.push(...entries);
    }

    // Merge entries — each entry retains its source
    for (const [id, data] of idx.entries.entries()) {
      mergedEntries.set(id, data);
    }

    // Merge reverse references
    for (const [key, refs] of idx.byReference.entries()) {
      if (!mergedByReference.has(key)) {
        mergedByReference.set(key, []);
      }
      mergedByReference.get(key)!.push(...refs);
    }

    // Merge synonyms — union of all synonym groups
    for (const [key, syns] of Object.entries(idx.synonyms)) {
      if (!mergedSynonyms[key]) {
        mergedSynonyms[key] = [...syns];
      } else {
        const existing = new Set(mergedSynonyms[key]);
        for (const s of syns) {
          existing.add(s);
        }
        mergedSynonyms[key] = [...existing];
      }
    }
  }

  return {
    terms: mergedTerms,
    entries: mergedEntries,
    packName: "merged",
    entryCount: totalEntries,
    byReference: mergedByReference,
    synonyms: mergedSynonyms,
  };
}
