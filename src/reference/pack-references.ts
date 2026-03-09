// src/reference/pack-references.ts — Shared reference pack loader
// Provides a single source of default fixture packs and a disk loader
// used by both suggestion.ts and lookup.ts.

// ── Types ────────────────────────────────────────────────────────────────

export interface RefPackEntry {
  id: string;
  label: string;
  references?: Array<{
    creator: string;
    title: string;
    type?: string;
  }>;
  categories?: string[];
  tags?: string[];
}

export interface RefPack {
  name: string;
  entries: RefPackEntry[];
}

// ── Fallback fixture packs (used at module load + _resetState) ──────────

export const FALLBACK_REFERENCE_PACKS: RefPack[] = [
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
          { creator: "Jean-Pierre Jeunet", title: "Am\u00e9lie", type: "film" },
        ],
        categories: ["emotion"],
        tags: ["indie-folk", "cinema"],
      },
      {
        id: "freedom",
        label: "Freedom",
        references: [
          { creator: "Jon Krakauer", title: "Into the Wild", type: "book" },
          { creator: "Sean Penn", title: "Into the Wild", type: "film" },
        ],
        categories: ["theme"],
        tags: ["adventure", "wilderness"],
      },
      {
        id: "spirit",
        label: "\u5343\u3068\u5343\u5C0B\u306E\u795E\u96A0\u3057",
        references: [
          {
            creator: "Hayao Miyazaki",
            title: "\u5343\u3068\u5343\u5C0B\u306E\u795E\u96A0\u3057",
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
          { creator: "Eddie Vedder", title: "Into the Wild", type: "song" },
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

// ── Disk loader ─────────────────────────────────────────────────────────

/**
 * Load reference packs, returning FALLBACK_REFERENCE_PACKS.
 * Future: load from disk via ontology pack-loader interface.
 */
export async function loadReferencePacks(): Promise<RefPack[]> {
  return FALLBACK_REFERENCE_PACKS;
}
