# TASK-36: Ontology — Tagging Tool

## Metadata
- Priority: 39
- Status: pending
- Dependencies: TASK-16, TASK-31, TASK-08
- Module path: src/ontology/tagging.ts
- Type stubs: src/types/ontology.ts
- Also read: src/types/writer.ts
- Test file: tests/ontology/tagging.test.ts
- Estimated context KB: 35

## What To Build

Implement the `brief_tag_entry` MCP tool — record ontology mappings as invisible HTML comments in BRIEF.md files. The tool writes `<!-- brief:ontology {pack} {id} "{label}" -->` comments after the target content paragraph, validates that the pack is installed and entry exists, enforces idempotent tagging (no duplicates), handles label overrides for existing tags, syncs the `**Ontologies:**` metadata field, and uses pack-scoped entry IDs throughout.

## Implementation Guide

1. `src/ontology/tagging.ts` — tagging tool implementation.

2. Register `brief_tag_entry` tool handler. Accept parameters: `ontology` (pack name), `entry_id`, `section` (target section), `paragraph` (optional text to locate target paragraph), `label_override` (optional custom label).

3. Validation: verify pack is installed and entry exists in the pack. If not, return clear error. Validate entry ID and label have no `--` (double dash) sequences that could break HTML comment parsing.

4. Idempotent tagging: before writing, check if an identical tag (same pack, same entry_id) already exists on the target paragraph. If yes, return a flag indicating already tagged without writing a duplicate. If same entry but different label, update the existing comment's label.

5. Write the HTML comment after the target content paragraph. Use the writer module (T16) for the actual file modification.

6. Metadata sync: after writing the tag, ensure the pack name appears in the `**Ontologies:**` metadata field (including version annotation). Delegate to T16's metadata sync.

7. Pack-scoped IDs: all responses include the qualified `{pack}:{entry_id}` form.

## Exported API

Export from `src/ontology/tagging.ts`:
- `tagEntry(params: { ontology: string; entryId: string; section: string; paragraph?: string; labelOverride?: string }) → { tagged: boolean; comment: string; label: string; alreadyTagged?: boolean; labelUpdated?: boolean; metadataUpdated?: boolean; packVersion?: string; updatedOntologiesField?: string; metadataDuplicated?: boolean; qualifiedId: string; targetType: 'section' | 'paragraph'; contentPreserved: boolean; afterContent: string; validated?: boolean; entryId?: string }`
  Comment format: `<!-- brief:ontology pack entryId "label" -->`. `qualifiedId` format: `"pack:id"`.

## Rules

### ONT-08: Version Tracking
When an ontology is used to tag content, the version MUST be recorded in the `**Ontologies:**` metadata field.

### ONT-12: Pack-Scoped Entry IDs
Entry IDs are scoped to their ontology pack. Two packs MAY have entries with the same ID. All internal references MUST use the qualified form `{pack}:{id}` (e.g., `theme-ontology:nostalgia`). HTML comment tags in BRIEF.md already include the pack name (`<!-- brief:ontology {pack} {id} "{label}" -->`). Search results, reverse index lookups, and tool responses MUST always include the pack name alongside the entry ID.

### ONT-21: Tag Validation on Write
`brief_tag_entry` validates that entry ID exists in the specified pack before writing the HTML comment. If not found, return `user_error`. Existing orphaned tags found on parse are preserved; `brief_lint` reports them. (OQ-189)

### WRITE-05: Metadata Sync on Extension/Ontology Changes
When `brief_add_extension` is called, the `**Extensions:**` metadata field MUST be updated. When `brief_tag_entry` is called with a new ontology, the `**Ontologies:**` metadata field MUST be updated (including version).

### WRITE-15: Idempotent ontology tagging.
`brief_tag_entry` checks for existing tags on the target paragraph before writing. If an identical tag (same pack, same entry_id) already exists, return `already_tagged: true` without writing a duplicate. If the same entry is tagged with a different label_override, update the existing comment's label. (OQ-214)

## Test Fixtures

The tagging module installs its own fixture packs at module load (same pattern as browse.ts):

- **theme-pack** — entries: `nostalgia`, `redemption`, `longing`, `emotion`, `entry-1`, `entry-2`
- **new-pack** — entries: `entry-1`

These fixtures are required for all unit and property tests. The module exports:
- `TAGGING_FIXTURE_PACK_NAMES` — `["theme-pack", "new-pack"]`
- `TAGGING_FIXTURE_ENTRY_IDS` — all entry IDs from theme-pack
- `_resetState()` — clears module-level tagging state (tag registry, metadata tracking) for test isolation

## Test Specification

### Unit Tests (specific input → expected output)
- Tag entry on paragraph → HTML comment written after target paragraph
- Tag with valid pack and entry → comment includes pack, id, and label
- Tag with non-existent pack → error
- Tag with non-existent entry in pack → error
- Same tag applied twice → returns already-tagged flag, no duplicate written
- Same entry with different label → existing comment label updated
- First tag with a new pack → Ontologies metadata field updated with pack name and version
- Tag when pack already in metadata → metadata not duplicated
- Entry ID with double-dash → rejected (breaks HTML comment syntax)
- Response includes pack-scoped entry ID → format is pack:id
- Tag preserves existing content and other tags → no side effects on unrelated content

### Property Tests (invariants that hold for ALL inputs)
- forAll(tag operation): idempotent — duplicate tag never written
- forAll(new pack tag): Ontologies metadata always updated
- forAll(entry ID): always validated against pack before writing
- forAll(tag response): always includes pack-scoped entry ID

## Tier 4 Criteria

Tier 4 criteria: JC-02, JC-07, JC-09
