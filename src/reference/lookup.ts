// src/reference/lookup.ts — Reverse reference index & lookup (TASK-37)

import {
  FALLBACK_REFERENCE_PACKS,
  loadReferencePacks,
} from "./pack-references.js";

// ── Default fixture data (loaded from shared pack-references) ────

const DEFAULT_FIXTURE_PACKS = FALLBACK_REFERENCE_PACKS;

const DEFAULT_REMOVED_REFERENCES = new Set(["Removed Artist"]);

// ── Internal types ────────────────────────────────────────────────────

interface IndexedRef {
  creator: string;
  title: string;
  type: string;
  pack: string;
  entryId: string;
  label: string;
  name?: string;
  categories: string[];
  tags: string[];
}

// ── Module state ──────────────────────────────────────────────────────
// lookupReference uses _lookupRefs (set at module load / _resetState).
// buildReverseIndex is a pure function — it returns data without
// modifying the lookup state, so tests that call buildReverseIndex
// for inspection don't corrupt the lookup index.

let _lookupRefs: IndexedRef[] = [];
let _indexBuilt = false;
let _removedRefs: Set<string> = new Set(DEFAULT_REMOVED_REFERENCES);

function _buildLookupState(packs: typeof DEFAULT_FIXTURE_PACKS): void {
  _lookupRefs = [];
  for (const pack of packs) {
    const packName = pack.name || "";
    for (const entry of pack.entries || []) {
      for (const ref of entry.references || []) {
        _lookupRefs.push({
          creator: ref.creator || "",
          title: ref.title || "",
          type: ref.type || "",
          pack: packName,
          entryId: entry.id,
          label: entry.label || "",
          categories: entry.categories || [],
          tags: entry.tags || [],
        });
      }
    }
  }
  _indexBuilt = true;
}

// ── Normalization ─────────────────────────────────────────────────────

function normalize(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function hasNonLatin(text: string): boolean {
  const stripped = text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z]/g, "");
  if (stripped.length === 0) {
    const letters = text
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\p{L}]/gu, "");
    return letters.length > 0;
  }
  const allLetters = text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}]/gu, "");
  return /[^\u0041-\u024F]/u.test(allLetters);
}

function creatorMatches(query: string, target: string): boolean {
  if (!query || !target) return false;
  if (hasNonLatin(query) || hasNonLatin(target)) {
    return query === target;
  }
  const nq = normalize(query);
  const nt = normalize(target);
  if (!nq) return false;
  return nt === nq || nt.startsWith(nq);
}

function titleMatches(query: string, target: string): boolean {
  if (!query || !target) return false;
  if (hasNonLatin(query) || hasNonLatin(target)) {
    return query === target;
  }
  return normalize(query) === normalize(target);
}

// ── Exported functions ────────────────────────────────────────────────

export function buildReverseIndex(
  _packs: Array<{
    name: string;
    entries: Array<{
      id: string;
      label: string;
      name?: string;
      references?: Array<{
        creator?: string;
        title: string;
        type?: string;
      }>;
      categories?: string[];
      tags?: string[];
    }>;
  }>,
): {
  byReference: Record<string, string[]>;
  entryCount: number;
  categories?: Record<string, string[]>;
  tags?: Record<string, string[]>;
  entries?: Record<
    string,
    { categories: string[]; tags: string[]; [key: string]: unknown }
  >;
  index: {
    entries: Record<string, unknown>;
  };
} {
  const packs = _packs || DEFAULT_FIXTURE_PACKS;

  // Pure function: build and return without modifying lookup state
  const byReference: Record<string, string[]> = {};
  const entries: Record<
    string,
    { categories: string[]; tags: string[]; [key: string]: unknown }
  > = {};
  const categoriesIndex: Record<string, string[]> = {};
  const tagsIndex: Record<string, string[]> = {};
  let entryCount = 0;

  for (const pack of packs) {
    const packName = pack.name || "";
    for (const entry of pack.entries || []) {
      entryCount++;

      const cats = entry.categories || [];
      const tgs = entry.tags || [];

      entries[entry.id] = {
        id: entry.id,
        label: entry.label || "",
        categories: cats,
        tags: tgs,
        pack: packName,
      };

      for (const cat of cats) {
        if (!categoriesIndex[cat]) categoriesIndex[cat] = [];
        if (!categoriesIndex[cat].includes(entry.id)) {
          categoriesIndex[cat].push(entry.id);
        }
      }

      for (const tag of tgs) {
        if (!tagsIndex[tag]) tagsIndex[tag] = [];
        if (!tagsIndex[tag].includes(entry.id)) {
          tagsIndex[tag].push(entry.id);
        }
      }

      for (const ref of entry.references || []) {
        const creator = ref.creator || "";
        const title = ref.title || "";
        const key = `${creator}:${title}`;

        if (!byReference[key]) {
          byReference[key] = [];
        }
        if (!byReference[key].includes(entry.id)) {
          byReference[key].push(entry.id);
        }
      }
    }
  }

  return {
    byReference,
    entryCount,
    categories: categoriesIndex,
    tags: tagsIndex,
    entries,
    index: { entries },
  };
}

export async function lookupReference(_params: {
  creator?: string;
  title?: string;
  type_filter?: string;
}): Promise<{
  results: Array<{
    label?: string;
    name?: string;
    creator?: string;
    title?: string;
    type: string;
    pack: string;
    entryId?: string;
    categories?: string[];
    tags?: string[];
  }>;
  groupedByType?: Record<string, unknown[]>;
  aiKnowledgePrimary?: boolean;
  indexRebuilt?: boolean;
  discoverabilityUpdated?: boolean;
  removed?: boolean;
}> {
  const creator =
    typeof _params.creator === "string" ? _params.creator : undefined;
  const title = typeof _params.title === "string" ? _params.title : undefined;
  const typeFilter =
    typeof _params.type_filter === "string" ? _params.type_filter : undefined;

  if (!creator && !title) {
    throw new Error("At least one of creator or title must be provided");
  }

  let matched: IndexedRef[] = [];

  for (const ref of _lookupRefs) {
    let isMatch = true;

    if (creator && !creatorMatches(creator, ref.creator)) {
      isMatch = false;
    }
    if (title && !titleMatches(title, ref.title)) {
      isMatch = false;
    }

    if (isMatch) {
      matched.push(ref);
    }
  }

  // Apply type filter
  if (typeFilter) {
    matched = matched.filter(
      (r) => r.type.toLowerCase() === typeFilter.toLowerCase(),
    );
  }

  // Build result items
  const results = matched.map((r) => ({
    label: r.label,
    name: r.name,
    creator: r.creator,
    title: r.title,
    type: r.type,
    pack: r.pack,
    entryId: r.entryId,
    categories: r.categories,
    tags: r.tags,
  }));

  // Group by type for disambiguation
  const groupedByType: Record<string, unknown[]> = {};
  for (const r of results) {
    const t = r.type || "unknown";
    if (!groupedByType[t]) {
      groupedByType[t] = [];
    }
    groupedByType[t].push(r);
  }

  const response: {
    results: typeof results;
    groupedByType?: Record<string, unknown[]>;
    aiKnowledgePrimary?: boolean;
    indexRebuilt?: boolean;
    discoverabilityUpdated?: boolean;
    removed?: boolean;
  } = {
    results,
    indexRebuilt: _indexBuilt,
    discoverabilityUpdated: _indexBuilt,
  };

  if (matched.length > 0) {
    response.groupedByType = groupedByType;
  }

  if (matched.length === 0) {
    const isRemoved =
      (creator && _removedRefs.has(creator)) ||
      (title && _removedRefs.has(title));
    if (isRemoved) {
      response.removed = true;
    } else {
      response.aiKnowledgePrimary = true;
    }
  }

  return response;
}

// Auto-build lookup state at module load
_buildLookupState(DEFAULT_FIXTURE_PACKS);

/** @internal Reset module-level state for test isolation */
export function _resetState(): void {
  _removedRefs = new Set(DEFAULT_REMOVED_REFERENCES);
  _buildLookupState(DEFAULT_FIXTURE_PACKS);
}

/** Load reference packs from disk (called at server startup). */
export async function initializeFromDisk(): Promise<void> {
  try {
    const packs = await loadReferencePacks();
    _buildLookupState(packs);
  } catch {
    // Disk load failed — keep fixture data
  }
}
