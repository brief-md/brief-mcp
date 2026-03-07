# TASK-37: Reference — Reverse Reference Index & Lookup

## Metadata
- Priority: 40
- Status: pending
- Dependencies: TASK-31, TASK-08
- Module path: src/reference/
- Type stubs: src/types/reference.ts
- Also read: src/types/ontology.ts
- Test file: tests/reference/lookup.test.ts
- Estimated context KB: 40

## What To Build

Build the reverse reference index and implement the `brief_lookup_reference` MCP tool. The reverse index is built at pack load time, mapping `{creator, title}` pairs to ontology entries across all installed packs. The index includes enriched category and tag context from each entry. The lookup tool supports case-insensitive matching, partial matching for creator names, Unicode-normalised accent-insensitive matching, cross-pack search, and ambiguous result disambiguation (grouped by type, filtered by creator). When no pack results are found, the response signals that AI knowledge should be the primary discovery mechanism. The index refreshes on pack install/update.

## Implementation Guide

1. `src/reference/lookup.ts` — reverse reference index and lookup tool.

2. Build the reverse index at pack load time. For every installed pack, iterate all entries and extract `references[].creator` and `references[].title` values. For each reference, create an index entry mapping `{creator, title}` to `[{pack, entry_id, categories[], tags[]}]`. Include the entry's category and tag context from the source ontology entry to enable extension-aware filtering at the index level without requiring a full entry fetch.

3. Register `brief_lookup_reference` tool handler. Accept parameters: `creator` (optional), `title` (optional, at least one required), `type_filter` (optional, e.g., film, song, book).

4. Matching algorithm: normalise both query and index entries. Apply case-insensitive comparison. Support partial matching for creator names (e.g., "Bon" matches "Bon Iver"). Apply Unicode NFKD decomposition and strip combining marks for accent-insensitive matching ("Amélie" → "Amelie"). Strip punctuation and normalise whitespace. Original labels are preserved — normalisation is matching-only. Non-Latin scripts use exact matching in v1.

5. Cross-pack search: always search across ALL installed ontology packs, not just one. Results are grouped by pack.

6. Ambiguous results: when multiple matches are returned (e.g., "Into the Wild" matching a film, a book, and a song), group results by type. If `creator` is provided, filter by creator first. The AI presents grouped matches to the user for selection — the server does not auto-select.

7. Empty results: when no pack results are found, include a signal in the response indicating that AI knowledge is the primary discovery mechanism (Tier 2 per the three-tier flow). The reference system is a discovery technique, not just a recording tool.

8. Index refresh: rebuild the reverse index when packs are installed, updated, or removed.

## Exported API

Export from `src/reference/lookup.ts`:
- `lookupReference(params: { creator?: string; title?: string; type_filter?: string }) → { results: Array<{ label?: string; name?: string; creator?: string; title?: string; type: string; pack: string }>; groupedByType?: Record<string, any[]>; aiKnowledgePrimary?: boolean; indexRebuilt?: boolean; discoverabilityUpdated?: boolean; removed?: boolean }`
- `buildReverseIndex(packs: any[]) → { byReference: Record<string, any>; entryCount: number; categories?: any; tags?: any; entries?: Record<string, any>; index: { entries: Record<string, any> } }`
  `byReference` keyed by `"Creator:Title"` format.

## Rules

### REF-01: Reverse Index Completeness
The reverse reference index MUST include every `references[].creator` and `references[].title` value from every entry in every installed pack. Additionally, the index MUST include the entry's category and tag context (e.g., genres, themes, parent categories) from the source ontology entry. This enables extension-aware filtering at the index level without requiring a full entry fetch.

Index entry structure: `{creator, title} → [{pack, entry_id, categories[], tags[]}]`

### REF-02: Fuzzy Matching on Lookups
`brief_lookup_reference` MUST support case-insensitive matching and should handle common variations (e.g., "Bon Iver" matches "bon iver", partial matching for creator names).

### REF-03: Cross-Pack Search
`brief_lookup_reference` MUST search across ALL installed ontology packs, not just one. Results are grouped by pack.

### REF-07: References as a Discovery Technique
The AI MUST use the bidirectional reference flow as an active *discovery technique* when a user struggles to categorise their project. This is not just a final-state recording tool.

**Trigger pattern:** When a user cannot answer a categorical question (e.g., "what genre is this?", "what style are you going for?"), the AI SHOULD pivot to influence-based discovery:
1. Ask the user about influences, references, or works they admire
2. Use the AI's own knowledge to suggest categories based on the named influences: "Based on Bon Iver, this sounds like indie-folk with intimate production — does that feel right?"
3. Call `brief_lookup_reference` to check if installed ontology packs have structured data for those works — if found, use pack data to enrich or validate the AI's suggestions
4. Surface the categories as suggestions and confirm with the user before applying tags

**Important:** The AI's own knowledge is the primary discovery mechanism. Ontology pack data enriches the suggestion when available but is NOT required for the flow to work. Most packs will not have reference data — the pattern must work without it by relying on the AI's training knowledge (Tier 2 per REF-06).

This flow resolves the common situation where users know their influences but can't directly name their genre or style.

### REF-09: Ambiguous Reference Disambiguation
When `brief_lookup_reference` returns multiple matches (e.g., "Into the Wild" matching a film, a book, and a song), results MUST be grouped by type (film, song, book, etc.). If `creator` is provided, results are filtered by creator first. The AI presents the grouped matches to the user for selection. The server does not auto-select.

### REF-12: Unicode-Normalised Reference Matching
Apply NFKD decomposition + strip combining marks for accent-insensitive matching ("Amélie" → "Amelie"). Strip punctuation, normalise whitespace. Original labels preserved — normalisation is matching-only. Non-Latin scripts use exact matching in v1. (OQ-167)

## Test Fixtures

The module auto-builds its reverse index at load time from DEFAULT_FIXTURE_PACKS. The `lookupReference` unit tests rely on this default data existing. The implementation must define these fixtures at module level and call `buildReverseIndex(DEFAULT_FIXTURE_PACKS)` at load time.

### DEFAULT_FIXTURE_PACKS

```ts
const DEFAULT_FIXTURE_PACKS = [
  {
    name: "theme-pack",
    entries: [
      {
        id: "nostalgia",
        label: "Nostalgia",
        references: [
          { creator: "Bon Iver", title: "For Emma, Forever Ago", type: "album" },
          { creator: "Jean-Pierre Jeunet", title: "Amélie", type: "film" },
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
        label: "千と千尋の神隠し",
        references: [
          { creator: "Hayao Miyazaki", title: "千と千尋の神隠し", type: "film" },
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
          { creator: "Newly Installed Artist", title: "New Work", type: "album" },
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
```

### DEFAULT_REMOVED_REFERENCES

The module tracks references from removed packs. When `lookupReference` finds 0 results but the query matches a removed reference creator, it returns `{ removed: true }` instead of `{ aiKnowledgePrimary: true }`.

```ts
const DEFAULT_REMOVED_REFERENCES = new Set(["Removed Artist"]);
```

### Metadata flags

- `indexRebuilt`: always `true` when the index has been built (set after `buildReverseIndex` runs)
- `discoverabilityUpdated`: always `true` when the index exists
- `removed`: `true` when results are empty AND query creator/title matches a removed reference
- `aiKnowledgePrimary`: `true` when results are empty AND query does NOT match a removed reference

## Test Specification

### Unit Tests (specific input → expected output)
- Lookup by creator name → all references by that creator returned across all packs
- Lookup by title → matching references returned across all packs
- Case-insensitive lookup ("bon iver" vs "Bon Iver") → same results
- Partial creator match ("Bon" for "Bon Iver") → match found
- Unicode accent lookup ("Amelie" for "Amélie") → match found
- Ambiguous title matching multiple types → results grouped by type
- Ambiguous title with creator filter → results filtered by creator first, then grouped
- Cross-pack search with two packs having matching references → results from both packs returned
- No matches found → empty results with AI-knowledge-primary signal
- Index built from pack with multiple entries → all references indexed with category and tag context
- Pack install triggers index rebuild → new references discoverable
- Pack removal triggers index rebuild → removed references no longer returned
- Non-Latin script lookup → exact matching applied

### Property Tests (invariants that hold for ALL inputs)
- forAll(installed pack): every reference in pack appears in index
- forAll(lookup query): results always grouped by pack
- forAll(ambiguous result): results always grouped by type
- forAll(index entry): category and tag context always included

## Tier 4 Criteria

Tier 4 criteria: JC-02, JC-07, JC-09
