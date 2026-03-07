// src/reference/suggestion.ts — Suggestion & entry reference tools (TASK-38)

import type {
  ReferenceSuggestionResult,
  SuggestedReference,
} from "../types/references.js";

// ── Default fixture data (mirrors lookup.ts DEFAULT_FIXTURE_PACKS) ────

const DEFAULT_FIXTURE_PACKS = [
  {
    name: "theme-pack",
    entries: [
      {
        id: "nostalgia",
        label: "Nostalgia",
        references: [
          {
            creator: "Bon Iver",
            title: "For Emma, Forever Ago",
            type: "album",
          },
          {
            creator: "Jean-Pierre Jeunet",
            title: "Amélie",
            type: "film",
          },
        ],
        categories: ["emotion"],
        tags: ["indie-folk", "cinema"],
      },
      {
        id: "freedom",
        label: "Freedom",
        references: [
          {
            creator: "Jon Krakauer",
            title: "Into the Wild",
            type: "book",
          },
          { creator: "Sean Penn", title: "Into the Wild", type: "film" },
        ],
        categories: ["theme"],
        tags: ["adventure", "wilderness"],
      },
      {
        id: "spirit",
        label: "千と千尋の神隠し",
        references: [
          {
            creator: "Hayao Miyazaki",
            title: "千と千尋の神隠し",
            type: "film",
          },
        ],
        categories: ["theme"],
        tags: ["animation", "japanese"],
      },
      {
        id: "crosspack-a",
        label: "Shared",
        references: [
          { creator: "Various", title: "Common Title", type: "song" },
        ],
        categories: ["misc"],
        tags: ["shared"],
      },
      {
        id: "new-entry",
        label: "New Discovery",
        references: [
          {
            creator: "Newly Installed Artist",
            title: "New Work",
            type: "album",
          },
        ],
        categories: ["discovery"],
        tags: ["new"],
      },
    ],
  },
  {
    name: "film-pack",
    entries: [
      {
        id: "wild-song",
        label: "Wild Soundtrack",
        references: [
          {
            creator: "Eddie Vedder",
            title: "Into the Wild",
            type: "song",
          },
        ],
        categories: ["soundtrack"],
        tags: ["rock"],
      },
      {
        id: "crosspack-b",
        label: "Shared B",
        references: [
          { creator: "Various", title: "Common Title", type: "book" },
        ],
        categories: ["misc"],
        tags: ["shared"],
      },
    ],
  },
];

// ── Extension configuration ──────────────────────────────────────────

const EXTENSION_REFERENCE_TYPES: Record<string, string[]> = {
  sonic_arts: ["album", "song"],
  narrative_creative: ["book", "film"],
  visual_storytelling: ["film"],
  lyrical_craft: ["album", "song"],
  strategic_planning: [],
};

const EXTENSION_TAG_CONFIG: Record<
  string,
  { tags: string[]; contextField: string }
> = {
  sonic_arts: {
    tags: ["indie-folk", "rock", "soundtrack"],
    contextField: "suggested_genres",
  },
  narrative_creative: {
    tags: ["cinema", "adventure", "wilderness"],
    contextField: "suggested_themes",
  },
  visual_storytelling: {
    tags: ["animation", "cinema", "japanese"],
    contextField: "suggested_styles",
  },
  lyrical_craft: {
    tags: ["indie-folk", "rock"],
    contextField: "suggested_genres",
  },
  strategic_planning: {
    tags: [],
    contextField: "suggested_strategies",
  },
};

// ── Internal types ────────────────────────────────────────────────────

interface InternalRef {
  creator: string;
  title: string;
  type: string;
  pack: string;
  entryId: string;
  label: string;
  categories: string[];
  tags: string[];
}

// ── Module state ──────────────────────────────────────────────────────

let _refs: InternalRef[] = [];
let _entryKeys: Set<string> = new Set();

function _buildState(packs: typeof DEFAULT_FIXTURE_PACKS): void {
  _refs = [];
  _entryKeys = new Set();

  for (const pack of packs) {
    const packName = pack.name || "";
    for (const entry of pack.entries || []) {
      _entryKeys.add(`${packName}:${entry.id}`);

      for (const ref of entry.references || []) {
        _refs.push({
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
}

_buildState(DEFAULT_FIXTURE_PACKS);

// ── Helpers ───────────────────────────────────────────────────────────

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isExtensionRelevantType(ext: string, refType: string): boolean {
  const types = EXTENSION_REFERENCE_TYPES[ext];
  if (!types || types.length === 0) return false;
  return types.includes(refType.toLowerCase());
}

function isExtensionRelevantEntry(ext: string, tags: string[]): boolean {
  const config = EXTENSION_TAG_CONFIG[ext];
  if (!config) return false;
  for (const tag of tags) {
    if (config.tags.includes(tag)) return true;
  }
  return false;
}

function refMatchesContext(
  ref: InternalRef,
  section: string,
  activeExtensions: string[],
): boolean {
  const normSection = normalizeText(section);

  // Match by category
  for (const cat of ref.categories) {
    const normCat = normalizeText(cat);
    if (
      normCat === normSection ||
      normCat.includes(normSection) ||
      normSection.includes(normCat)
    ) {
      return true;
    }
  }

  // Match by tag
  for (const tag of ref.tags) {
    const normTag = normalizeText(tag);
    if (normTag === normSection || normTag.includes(normSection)) {
      return true;
    }
  }

  // Match by label
  const normLabel = normalizeText(ref.label);
  if (
    normLabel &&
    (normLabel.includes(normSection) || normSection.includes(normLabel))
  ) {
    return true;
  }

  // Match by active extension relevance
  for (const ext of activeExtensions) {
    if (isExtensionRelevantType(ext, ref.type)) return true;
    if (isExtensionRelevantEntry(ext, ref.tags)) return true;
  }

  return false;
}

function buildDerivedContext(
  suggestions: SuggestedReference[],
  activeExtensions: string[],
): Record<string, unknown> | undefined {
  const derived: Record<string, Record<string, string[]>> = {};

  for (const ext of activeExtensions) {
    const config = EXTENSION_TAG_CONFIG[ext];
    if (!config) continue;

    const matchingTags: string[] = [];
    for (const sug of suggestions) {
      for (const tag of sug.entry.tags) {
        if (config.tags.includes(tag) && !matchingTags.includes(tag)) {
          matchingTags.push(tag);
        }
      }
    }

    if (matchingTags.length > 0) {
      derived[ext] = { [config.contextField]: matchingTags };
    }
  }

  return Object.keys(derived).length > 0 ? derived : undefined;
}

// ── Exported functions ────────────────────────────────────────────────

export async function getEntryReferences(params: {
  ontology: string;
  entryId: string;
  typeFilter?: string;
  extensionFilter?: string;
  maxResults?: number;
}): Promise<{
  references: Array<{
    type: string;
    extension?: string;
    creator?: string;
    title?: string;
    pack?: string;
    entryId?: string;
    categories?: string[];
    tags?: string[];
  }>;
}> {
  const {
    ontology,
    entryId,
    typeFilter,
    extensionFilter,
    maxResults = 10,
  } = params;

  const entryKey = `${ontology}:${entryId}`;
  if (!_entryKeys.has(entryKey)) {
    throw new Error(`Entry not found: ${ontology}/${entryId}`);
  }

  let matched = _refs.filter(
    (r) => r.pack === ontology && r.entryId === entryId,
  );

  if (typeFilter) {
    matched = matched.filter(
      (r) => r.type.toLowerCase() === typeFilter.toLowerCase(),
    );
  }

  if (extensionFilter) {
    matched = matched.filter((r) =>
      isExtensionRelevantType(extensionFilter, r.type),
    );
  }

  const limited = matched.slice(0, maxResults);

  return {
    references: limited.map((r) => ({
      type: r.type,
      creator: r.creator,
      title: r.title,
      pack: r.pack,
      entryId: r.entryId,
      categories: r.categories,
      tags: r.tags,
      extension: extensionFilter || undefined,
    })),
  };
}

export async function suggestReferences(params: {
  context: { section: string; activeExtensions: string[] };
  existingReferences?: Array<{ ontology: string; entryId: string }>;
}): Promise<ReferenceSuggestionResult> {
  const { context, existingReferences } = params;
  const { section, activeExtensions } = context;

  // Build exclusion set from existing references
  const excluded = new Set<string>();
  if (existingReferences) {
    for (const ref of existingReferences) {
      excluded.add(`${ref.ontology}:${ref.entryId}`);
    }
  }

  // Find matching references, deduplicating by pack:entryId:creator:title
  const seen = new Set<string>();
  const suggestions: SuggestedReference[] = [];

  for (const ref of _refs) {
    const refKey = `${ref.pack}:${ref.entryId}:${ref.creator}:${ref.title}`;
    if (seen.has(refKey)) continue;
    seen.add(refKey);

    const entryKey = `${ref.pack}:${ref.entryId}`;
    if (excluded.has(entryKey)) continue;

    if (!refMatchesContext(ref, section, activeExtensions)) continue;

    suggestions.push({
      entry: {
        pack: ref.pack,
        entryId: ref.entryId,
        categories: ref.categories,
        tags: ref.tags,
        creator: ref.creator,
        title: ref.title,
      },
      sourceTier: 1,
    });
  }

  // Tier availability signals: when pack results are sparse/empty,
  // indicate that AI knowledge and web search tiers are available
  const sparse = suggestions.length < 3;
  const hasAiKnowledgeTier = sparse;
  const hasWebSearchTier = sparse;

  const derivedContext = buildDerivedContext(suggestions, activeExtensions);

  return {
    suggestions,
    hasAiKnowledgeTier,
    hasWebSearchTier,
    ...(derivedContext ? { derivedContext } : {}),
  };
}

/** @internal Reset module-level state for test isolation */
export function _resetState(): void {
  _buildState(DEFAULT_FIXTURE_PACKS);
}
