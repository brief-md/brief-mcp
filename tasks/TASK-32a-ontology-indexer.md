# TASK-32a: Ontology — Index Building

## Metadata
- Priority: 34
- Status: pending
- Dependencies: TASK-31
- Module path: src/ontology/indexer.ts
- Type stubs: src/types/ontology.ts
- Also read: none
- Test file: tests/ontology/indexer.test.ts
- Estimated context KB: 45

## What To Build

Build the inverted keyword index for ontology search. This takes validated pack data (from T31) and builds a forward index mapping terms to entry IDs with field-priority scoring. Includes bidirectional synonym expansion (pack-level synonyms take priority over global fallback), field priority multipliers (label 4x, aliases 3x, keywords 2x, description 1x), direct match bonus (1.5x over synonym), `Intl.Segmenter` for CJK/Thai tokenization, cross-pack merge strategy, and index invalidation on pack changes.

## Implementation Guide

1. `src/ontology/indexer.ts` — index building engine.

2. For each validated pack, before building the index check `~/.brief/config.json` for a `pack_config.{pack-name}.search_fields` override. If present, index only those fields. If absent, index the default fields: `label`, `aliases`, `keywords`, `description`. Then build the forward index: tokenize all selected searchable fields of each entry, map each term to `[(entry_id, field_name, base_score)]`. Score reflects field priority: label matches 4x, aliases 3x, keywords 2x, description 1x. Reference ONT-09.

3. Synonym expansion: load pack-level synonym groups first (highest priority). Load bundled global synonym dataset as fallback. For each synonym group, expand bidirectionally — if A and B are in a group, searching A matches B and vice versa. Pack synonyms override global for the same term.

4. Synonym group overlap: if a term appears in multiple groups, expand to the union of all groups. Deduplicate before scoring.

5. Direct vs synonym match: when scoring results, direct term matches get a 1.5x multiplier over synonym-expanded matches.

6. Tokenization: use `Intl.Segmenter` with `granularity: 'word'` for word segmentation. This handles CJK and Thai correctly. Normalize tokens (lowercase, trim).

7. Cross-pack merge: maintain separate indexes per pack. Merge results at query time by combining all pack indexes, sorting by score descending.

8. Index invalidation: rebuild index immediately (blocking) when a pack is installed, updated, or removed. Log the rebuild duration at debug level: `"Index rebuilt for pack [name] in [N]ms"`. The `brief_install_ontology` response MUST confirm that the pack is immediately searchable (e.g., `"index_rebuilt": true`). On uninstall, remove the pack's index from the in-memory cache synchronously before returning the uninstall response. (OQ-251)

## Exported API

Export from `src/ontology/indexer.ts`:
- `buildIndex(pack: { name: string; entries: any[]; synonyms?: Record<string, string[]>; searchFields?: string[] }) → object`
  Returns index object with `entryCount: number` and `packName?: string` properties.
- `searchIndex(index: object, query: string) → Array<{ entryId: string; score: number; label: string; matchContext: { matchedTerms: string[]; matchedFields?: string[] }; matchedFields: string[]; matchType: string; source?: string }>`
  `matchType`: `'direct'` or `'synonym'`.
- `expandSynonyms(term: string, globalSynonyms?: Record<string, string[]>, packSynonyms?: Record<string, string[]>) → string[]`
  Pack synonyms override global for same term.
- `mergeIndexes(indexes: any[]) → object` — merged index with `byReference` property keyed by `"Creator:Title"` format

## Rules

### ONT-01: Self-Contained Packs
An ontology pack file MUST contain everything the server needs to execute search operations. No external downloads at runtime. No network calls to resolve entries. Search quality scales with pack richness — sparse packs produce sparse results, which the AI supplements via its own knowledge (Tier 2) and web search (Tier 3) per REF-06.

### ONT-02: Synonym Expansion Is Bidirectional
If term A is in a synonym group with term B, searching for A MUST also match entries with B, and vice versa. Synonym groups are sets, not directional.

### ONT-03: Field Priority Scoring
Search scoring MUST respect field priority with the following multipliers (GAP-S18):
- `label`: 4× multiplier
- `aliases`: 3× multiplier
- `keywords`: 2× multiplier
- `description`: 1× multiplier (baseline)

A match on `label` scores higher than a match on `keywords` for the same entry.

### ONT-04: Direct Match > Synonym Match
A direct term match MUST score higher than a synonym-expanded match. Direct matches receive a 1.5× multiplier over synonym-expanded matches. If the user searches "escape" and an entry has "escape" in keywords, it ranks higher than an entry that has "flee" (synonym of "escape") in keywords.

### ONT-05: Return Match Context
Search results MUST include which terms matched, in which fields, and whether via direct or synonym match. This helps the AI explain matches to the user.

### ONT-07: Pack Loading and Indexing
Ontology packs MUST be loaded and indexed at server startup. The index includes:
- Forward index: term → [(entry_id, field, score)]
- Reverse reference index: {creator, title} → [(pack, entry_id)]
Indexes are rebuilt when packs are installed or updated.

### ONT-08: Version Tracking
When an ontology is used to tag content, the version MUST be recorded in the `**Ontologies:**` metadata field.

### ONT-11: Synonym Sources — Pack-Level and Global
Synonym expansion uses two sources:
1. **Pack-level synonym groups** (highest priority): Synonym sets defined within each ontology pack's `synonyms` array. These are domain-specific and take priority when they exist.
2. **Bundled global synonym dataset**: A general-purpose synonym mapping shipped with the server that provides baseline synonym expansion across all packs. Global synonyms fill gaps when a pack has no synonym data of its own.

Pack-specific synonyms override global synonyms when both exist for the same term. Packs without any synonym data still benefit from synonym expansion via the global dataset.

**Bundled content:** The server MUST ship with:
- At minimum one genre-focused ontology pack (for SONIC ARTS projects)
- At minimum one themes-focused ontology pack (for NARRATIVE CREATIVE projects)
- A global synonym dataset providing general-purpose term expansion

The bundled global synonym dataset is sourced from **Moby Thesaurus II** (public domain, ~30,000 root words, ~2.5M synonym relationships). A build-time conversion script transforms the Moby Thesaurus text format into `assets/synonyms.json`. At runtime, this file is loaded from the bundled assets on startup. The dataset is not domain-specific — it provides broad general-purpose synonym coverage.

### ONT-14: Synonym Group Overlap
If a term appears in multiple synonym groups (within a single pack or across the global dataset), all groups are used for expansion. The term is expanded to the union of all synonyms from all groups it belongs to. Duplicate expansions are deduplicated before scoring.

### ONT-17: Use `Intl.Segmenter` for word tokenization.
For ontology search tokenization, use `Intl.Segmenter` (Node.js 16+) for word segmentation instead of naive space splitting. This handles CJK (Chinese, Japanese, Korean) and Thai correctly. German compounds and Arabic morphology are v2 concerns — document the limitation. (OQ-205)

## Test Specification

### Unit Tests (specific input → expected output)
- Pack with entries having labels and keywords → index maps terms to correct entries
- Search term matching label → scores higher than same term matching description
- Search term matching keyword → scores higher than description, lower than label
- Synonym pair A↔B → searching A finds entries with B, and vice versa
- Pack-level synonym overrides global synonym for same term → pack synonym used
- Direct match vs synonym match on same entry → direct scores 1.5x higher
- Term in multiple synonym groups → expanded to union of all groups
- CJK text tokenized → words segmented correctly via Intl.Segmenter
- Index rebuilt after pack install → new entries searchable immediately
- Cross-pack merge → results from multiple packs combined and sorted by score
- Match context → result includes matched terms, fields, and direct/synonym flag
- Empty pack (zero entries) → empty index, no errors
- Pack with `pack_config.{name}.search_fields` override in config → only configured fields indexed
- Pack with no `search_fields` config → default fields (label, aliases, keywords, description) indexed

### Property Tests (invariants that hold for ALL inputs)
- forAll(synonym group): expansion is always bidirectional
- forAll(search term): label matches always score higher than description matches
- forAll(direct match, synonym match): direct always scores ≥ 1.5x synonym
- forAll(pack update): index is always rebuilt and consistent

## Tier 4 Criteria

Tier 4 criteria: none
