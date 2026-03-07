# TASK-38: Reference — Suggestion & Entry References

## Metadata
- Priority: 41
- Status: pending
- Dependencies: TASK-37, TASK-08
- Module path: src/reference/
- Type stubs: src/types/reference.ts
- Also read: src/types/ontology.ts
- Test file: tests/reference/suggestion.test.ts
- Estimated context KB: 35

## What To Build

Implement two MCP tools: `brief_suggest_references` and `brief_get_entry_references`. The suggestion tool assembles a context block with pack references, project context, existing reference deduplication, and AI signals following the three-tier suggestion flow (pack results → AI knowledge → web search). The entry references tool returns works associated with an ontology entry, supporting type filtering, extension filtering, and max results. Both tools support extension-aware reference filtering and include derived context for reference-to-extension enrichment suggestions.

## Implementation Guide

1. `src/reference/suggestion.ts` — suggestion and entry reference tools.

2. Register `brief_get_entry_references` tool handler. Accept parameters: `ontology` (pack name), `entry_id`, `type_filter` (optional — return only references of a specific type like film, song, novel), `extension_filter` (optional — return only references relevant to a specific extension), `max_results` (optional, default 10). Use the reverse index from T37 to look up references for the given entry. Apply `type_filter` by matching reference format. Apply `extension_filter` by matching against the enriched index category/tag context.

3. Register `brief_suggest_references` tool handler. Accept parameters: `context` (project context — current section, active extensions), `existing_references` (optional array of `{ontology, entry_id}` objects representing already-tagged entries). Assemble a context block containing pack references relevant to the project context.

4. Three-tier suggestion flow: the response MUST include a source tier signal for each result so the AI can communicate provenance clearly. Tier 1 = pack results (structured, locally-available with clear provenance). Tier 2 = AI knowledge (if pack results are sparse). Tier 3 = internet search (if available and still insufficient). Manual entry is always available as an option.

5. Existing references deduplication: when `existing_references` is provided, exclude any entries that appear in the list. When omitted, return all matches regardless of existing tags.

6. Reference-to-extension enrichment: when results include ontology links, the response SHOULD include a `derived_context` block containing metadata from linked entries relevant to the project's active extensions. For example, if a reference links to an entry tagged with `genre: indie-folk` and the project has a SONIC ARTS extension, include `{sonic_arts: {suggested_genres: ["indie-folk"]}}`.

7. Empty/sparse data handling: when pack results are empty or sparse, include structured signals indicating that AI knowledge and web search tiers are available.

## Exported API

Export from `src/reference/suggestion.ts`:
- `getEntryReferences(params: { ontology: string; entryId: string; typeFilter?: string; extensionFilter?: string; maxResults?: number }) → { references: Array<{ type: string; extension?: string }> }`
- `suggestReferences(params: { context: { section: string; activeExtensions: string[] }; existingReferences?: Array<{ ontology: string; entryId: string }> }) → ReferenceSuggestionResult`

  **Return type uses `ReferenceSuggestionResult` from `src/types/references.ts`:**
  ```
  { suggestions: SuggestedReference[];        // NOT "results" — field is "suggestions"
    hasAiKnowledgeTier: boolean;              // true when AI knowledge tier is available
    hasWebSearchTier: boolean;                // true when web search tier is available
    derivedContext?: Record<string, unknown>; // extension enrichment metadata
  }
  ```
  Each `SuggestedReference` has `{ entry: ReverseReferenceIndexEntry; sourceTier: 1 | 2 | 3 }`.
  When no pack data: `hasAiKnowledgeTier` and/or `hasWebSearchTier` should be `true`.

## Rules

### REF-05: Type and Extension Filtering
`brief_get_entry_references` MUST support:
- `type_filter` — return only references of a specific type (film, song, novel, etc.). Filters by reference *format*.
- `extension_filter` — return only references relevant to a specific extension (sonic_arts, narrative_creative, etc.). Filters by reference *relevance* using the enriched reverse index from REF-01.

Both filters can be used independently or together. The `extension_filter` is typically more useful during active work because it maps to the user's current focus area.

### REF-06: Three-Tier Reference Suggestion Flow
When the AI presents reference suggestions, it MUST use a three-tier approach, offering each tier in sequence based on user need:

1. **Tier 1 — Pack results:** Show any references found in installed ontology packs. These are the structured, locally-available results with clear provenance.
2. **Tier 2 — AI knowledge:** If pack results are sparse or the user wants more, offer to search from the AI's own training knowledge. The AI presents these as its own suggestions, distinct from pack results.
3. **Tier 3 — Internet search:** If available and still insufficient, offer web search.
4. **Always available:** Manual entry — the user can add a reference directly at any point without going through any search tier.

The context block signal from `brief_suggest_references` MUST indicate the source tier of each result so the AI can communicate provenance clearly to the user.

### REF-06a: `brief_suggest_references` — `existing_references` Parameter (GAP-S05)
The `existing_references` parameter on `brief_suggest_references` accepts an array of `{ontology, entry_id}` objects representing ontology entries already tagged in the active BRIEF.md. Its purpose is deduplication — the server uses this list to exclude entries the user has already tagged when generating suggestions. The server MUST NOT suggest entries that appear in `existing_references`. When omitted, all matches are returned regardless of existing tags.

### REF-08: Reference-to-Extension Enrichment Suggestions
When `brief_add_reference` is called with `ontology_links`, the server response SHOULD include a `derived_context` block containing metadata from the linked ontology entries that is relevant to the project's active extensions. For example, if a reference links to an ontology entry tagged with `genre: indie-folk` and the project has a SONIC ARTS extension, the `derived_context` block might include `{sonic_arts: {suggested_genres: ["indie-folk"]}}`.

The AI then offers these as suggestions to the user: "Based on this reference, would you like to add 'indie-folk' to your Genre field?" This is suggestion-based enrichment, not automatic propagation — the user's BRIEF.md is only updated with explicit consent, consistent with the principle "discovery is conversational, commitment is explicit" (Pattern 6).

## Test Specification

### Unit Tests (specific input → expected output)
- Get entry references with no filters → all references for that entry returned (up to default max)
- Get entry references with type_filter → only matching type returned
- Get entry references with extension_filter → only extension-relevant references returned
- Get entry references with both filters → both applied together
- Get entry references with max_results=3 → at most 3 results returned
- Suggest references with project context → pack results returned with tier-1 signal
- Suggest references with existing_references → already-tagged entries excluded from results
- Suggest references without existing_references → all matches returned
- Suggest references with sparse pack data → response includes tier-2/tier-3 availability signals
- Suggest references with no pack data → empty pack results with AI-knowledge signal
- Entry with ontology links and active extension → derived_context block included in response
- Entry without ontology links → no derived_context block
- Non-existent pack or entry → error returned

### Property Tests (invariants that hold for ALL inputs)
- forAll(suggestion result): source tier always indicated
- forAll(existing_references provided): no excluded entry appears in results
- forAll(type_filter): all returned references match the specified type
- forAll(entry reference result): max_results limit always respected

## Test Fixtures

The test file uses the following hardcoded values, all sourced from `DEFAULT_FIXTURE_PACKS` in `src/reference/lookup.ts`:

### Packs
- `"theme-pack"` — primary test pack with 5 entries
- `"film-pack"` — secondary pack with 2 entries

### Entry IDs (theme-pack)
- `"nostalgia"` — label "Nostalgia", refs: album (Bon Iver) + film (Amélie), tags: ["indie-folk", "cinema"]
- `"freedom"` — label "Freedom", refs: book + film (Into the Wild), tags: ["adventure", "wilderness"]
- `"spirit"` — label "千と千尋の神隠し", refs: film (Miyazaki), tags: ["animation", "japanese"]
- `"crosspack-a"` — label "Shared", refs: song (Common Title), tags: ["shared"]
- `"new-entry"` — label "New Discovery", refs: album, tags: ["new"]

### Entry IDs (film-pack)
- `"wild-song"` — label "Wild Soundtrack", refs: song (Eddie Vedder), tags: ["rock"]
- `"crosspack-b"` — label "Shared B", refs: book (Common Title), tags: ["shared"]

### Reference Types
- `"album"`, `"film"`, `"book"`, `"song"` — all present in fixture data

### Extension Names (used for filtering/enrichment)
- `"sonic_arts"`, `"narrative_creative"`, `"lyrical_craft"`, `"visual_storytelling"`, `"strategic_planning"`
- `"custom_ext"` — used for sparse/no-data testing (not in fixtures)

## Tier 4 Criteria

Tier 4 criteria: JC-01, JC-02, JC-07, JC-09
