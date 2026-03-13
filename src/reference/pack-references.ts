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
 * Load reference packs from disk via ontology pack-loader, falling back
 * to FALLBACK_REFERENCE_PACKS if disk load fails or returns nothing.
 */
export async function loadReferencePacks(): Promise<RefPack[]> {
  try {
    const { loadAllPacks } = await import("../ontology/pack-loader.js");
    const diskPacks = await loadAllPacks();
    if (diskPacks && diskPacks.length > 0) {
      return diskPacks.map((p) => ({
        name: p.name ?? "",
        entries: (p.entries ?? []).map((e: Record<string, unknown>) => ({
          id: String(e.id ?? ""),
          label: String(e.label ?? ""),
          references: Array.isArray(e.references)
            ? (e.references as Array<Record<string, string>>).map((r) => ({
                creator: r.creator ?? "",
                title: r.title ?? "",
                type: r.type,
              }))
            : [],
          categories: Array.isArray(e.categories)
            ? (e.categories as string[])
            : [],
          tags: Array.isArray(e.tags) ? (e.tags as string[]) : [],
        })),
      }));
    }
  } catch {
    // Disk load failed — fall through to fixture data
  }
  return FALLBACK_REFERENCE_PACKS;
}
