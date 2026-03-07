# TASK-34: Ontology — Browsing & Entry Retrieval

## Metadata
- Priority: 37
- Status: pending
- Dependencies: TASK-31, TASK-08
- Module path: src/ontology/browse.ts
- Type stubs: src/types/ontology.ts
- Also read: none
- Test file: tests/ontology/browse.test.ts
- Estimated context KB: 35

## What To Build

Implement `brief_get_ontology_entry` and `brief_browse_ontology` MCP tools. The entry retrieval tool returns full details for a specific entry by pack and entry_id, with an optional fields selector. The browsing tool explores an entry's neighborhood (parents, siblings, children) with directional navigation and cycle detection in parent chain traversal. Both respect detail level filtering and use pack-scoped entry IDs.

## Implementation Guide

1. `src/ontology/browse.ts` — browsing and entry retrieval.

2. `brief_get_ontology_entry` handler: accept `ontology` (pack name), `entry_id`, optional `fields` (array of field names to include), optional `detail_level`. Look up the entry in the loaded pack data. Return full entry details filtered by fields/detail_level. Entry IDs are always pack-scoped in responses.

3. `brief_browse_ontology` handler: accept `ontology`, `entry_id`, `direction` ("up", "down", "around", "all"), optional `detail_level`. Navigate the entry's relationships: "up" returns parents, "down" returns children, "around" returns siblings (entries sharing the same parent), "all" returns parents + children + siblings.

4. Cycle detection: during parent chain traversal, track visited entry IDs. If a cycle is detected, break the traversal, log a warning, and return results up to the cycle point. Same visited-set pattern as hierarchy walker.

5. All responses include pack-scoped entry IDs (`pack:entry_id` format).

6. Missing entry or pack → clear not_found error.

## Exported API

Export from `src/ontology/browse.ts`:
- `getOntologyEntry(params: { ontology: string; entryId: string; fields?: string[]; detailLevel?: string }) → { entry: { id: string; label: string; qualifiedId: string; description?: string; keywords?: string[]; aliases?: string[]; references?: any[] } }`
  `qualifiedId` format: `"pack:id"`.
- `browseOntology(params: { ontology: string; entryId: string; direction: 'up' | 'down' | 'around' | 'all' }) → { entries: Array<{ isParent?: boolean; isChild?: boolean; isSibling?: boolean; isAncestor?: boolean; isDescendant?: boolean; depth?: number; level?: number; parentId?: string }>; direction: string; queryDepth?: number; queryLevel?: number; queryParentId?: string; warning?: string; cycleDetected?: boolean }`
  Cycle detection: sets `cycleDetected: true` and `warning` matching `/cycle|circular/i`.

## Rules

### ONT-06: Detail Level Filtering
All ontology read tools MUST respect the `detail_level` parameter:
- `minimal`: id and label only
- `standard`: id, label, description, parents
- `full`: all fields including keywords, aliases, synonyms, references

### ONT-12: Pack-Scoped Entry IDs
Entry IDs are scoped to their ontology pack. Two packs MAY have entries with the same ID. All internal references MUST use the qualified form `{pack}:{id}` (e.g., `theme-ontology:nostalgia`). HTML comment tags in BRIEF.md already include the pack name (`<!-- brief:ontology {pack} {id} "{label}" -->`). Search results, reverse index lookups, and tool responses MUST always include the pack name alongside the entry ID.

### ONT-18: Circular Parent Relationship Detection
`brief_browse_ontology` tracks visited entry IDs during parent traversal. On cycle, break and warn. Pack validation during `brief_install_ontology` detects and warns about cycles. (OQ-163)

## Test Specification

### Unit Tests (specific input → expected output)
- Get entry by pack and id → full entry details returned
- Get entry with fields selector → only requested fields returned
- Get entry with detail_level minimal → only id and label
- Get entry with detail_level full → all fields
- Non-existent entry → not_found error
- Non-existent pack → not_found error
- Browse direction "up" → parent entries returned
- Browse direction "down" → child entries returned
- Browse direction "around" → sibling entries returned
- Browse direction "all" → parents, children, and siblings returned
- Circular parent chain → traversal breaks with warning, partial results returned
- All entry IDs in responses → pack-scoped format (pack:id)
- Entry existing in two different packs → distinguished by pack scope

### Property Tests (invariants that hold for ALL inputs)
- forAll(entry request): response always includes pack-scoped ID
- forAll(detail level): response fields always match requested level
- forAll(browse traversal): cycle detection prevents infinite loops
- forAll(direction): only requested relationship direction returned

## Tier 4 Criteria

Tier 4 criteria: JC-02, JC-07, JC-09
