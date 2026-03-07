# TASK-16: Writer — Metadata Sync & Section Targeting

## Metadata
- Priority: 18
- Status: pending
- Dependencies: TASK-14
- Module path: src/writer/
- Type stubs: src/types/writer.ts
- Also read: src/types/parser.ts
- Test file: tests/writer/metadata-sync.test.ts
- Estimated context KB: 40

## What To Build

Build the metadata synchronization and section targeting subsystem within the writer module. This ensures that when extensions or ontologies are added or removed, the corresponding metadata fields are kept in sync. It also provides lenient section targeting for write tools using the parser's alias resolution, idempotent extension creation and ontology tagging, external tool session breadcrumb writing, and extension name validation.

## Implementation Guide

1. `src/writer/metadata-sync.ts` — metadata field synchronization logic.

2. Extensions metadata sync: when an extension is added (heading created), ensure the extension name appears in the `**Extensions:**` metadata field in lowercase_underscore format. When an extension is removed, remove its name from the metadata field.

3. Ontologies metadata sync: when a new ontology pack is tagged for the first time in a file, add the pack name to the `**Ontologies:**` field (including version annotation if available). Track which packs are referenced.

4. Extension name translation: convert between heading format (ALL CAPS with spaces, e.g., `SONIC ARTS`) and metadata format (lowercase_underscores, e.g., `sonic_arts`).

5. Idempotent ontology tagging: before writing a tag, check if an identical tag (same pack, same entry_id) already exists on the target paragraph. If yes, return a flag indicating already tagged. If same entry but different label, update the existing comment's label.

6. Idempotent extension creation: before creating an extension heading, check if it already exists. If yes, return a flag with existing content. Also check metadata consistency — if heading exists but the extension is not listed in metadata, add it.

7. External tool session breadcrumb: append a one-line entry to `## External Tool Sessions` sub-section (create if absent). Format: `- [session_date] [tool]: [n] decisions captured — [comma-separated decision titles]`.

8. Extension name validation: heading-format names must match `[A-Z0-9 ]+`. Reject other characters on create. Reader accepts any heading leniently; lint warns about non-conformant names.

9. Tool-specific section preservation: ensure all `# TOOL SPECIFIC: {ToolName}` sections from other tools are preserved byte-for-byte during any write operation.

10. **Canonical metadata field order for new files:** When writing metadata to a new file, use the canonical field order: `Project`, `Type`, `Extensions`, `Status`, `Created`, `Updated`, `Ontologies`, `Version`. When updating metadata in an existing file, preserve the existing field order — only modify the value of the specific field being changed, do not reorder. Reference WRITE-11.

11. **Version field semantic:** The `Version` metadata field records the BRIEF.md core spec version (e.g., `1.0`), not the project's own version number. When setting the Version field for a new file, use the current spec version. `brief_lint` should warn if the field value is not a semver-like string. Reference OQ-091.

## Exported API

Export from `src/writer/metadata-sync.ts`:
- `syncExtensionMetadata(input: string, options: { action: 'add' | 'remove'; extensionName: string; isNewFile?: boolean }) → string`
- `syncOntologyMetadata(input: string, options: { pack: string; version?: string }) → string`
- `translateExtensionName(name: string, direction: 'toMetadata' | 'toHeading') → string`
  `toMetadata`: `lowercase_underscore`. `toHeading`: `ALL CAPS` with spaces.
- `checkIdempotentTag(input: string, options: { pack: string; entryId: string; label: string; targetLine: number }) → { alreadyTagged: boolean; content?: string }`
- `checkIdempotentExtension(input: string, name: string) → { alreadyExists: boolean; existingContent?: string; metadataUpdated?: boolean }`
- `writeExternalSessionBreadcrumb(input: string, options: { date: string; tool: string; decisionCount: number; titles: string[] }) → string`
  Format: `- [date] [tool]: [count] decisions captured — [comma-separated titles]`
- `validateExtensionName(name: string) → void` — throws on invalid (allows A-Z, 0-9, spaces)
- `preserveToolSpecificSections(input: string, options: { modifySection: string; newContent: string; canFitInCoreSection?: boolean }) → string`

## Rules

### WRITE-05: Metadata Sync on Extension/Ontology Changes
When `brief_add_extension` is called, the `**Extensions:**` metadata field MUST be updated. When `brief_tag_entry` is called with a new ontology, the `**Ontologies:**` metadata field MUST be updated (including version).

### WRITE-08: Extension Name in Metadata Format
When writing the `**Extensions:**` metadata field, use the BRIEF.md core spec's canonical format: **lowercase with underscores** (e.g., `sonic_arts, narrative_creative`). The heading in the document body uses ALL CAPS with spaces (e.g., `# SONIC ARTS`). The writer must translate between the two formats.

### WRITE-09: Preserve Tool-Specific Sections
When writing to a BRIEF.md, the writer MUST preserve all `# TOOL SPECIFIC: {ToolName}` sections from other tools byte-for-byte. These sections are at the end of the file and are scoped to their respective tools.

### WRITE-10: brief-mcp Tool-Specific Section Is Last Resort Only
brief-mcp MUST NOT write a `# TOOL SPECIFIC: brief-mcp` section unless the metadata has no appropriate home in any core section, extension section, or project-specific section. If the data can go anywhere else, it MUST go there.

Server-side operational state (cache paths, index locations, last-run timestamps, pack version records) MUST be stored in `~/.brief/` — never in the project's BRIEF.md. The only acceptable use of a `# TOOL SPECIFIC: brief-mcp` section is for metadata that must travel with the file itself (e.g., a stable project identifier that cannot be derived from the file's content or path). Any such use requires an explicit, justified decision before implementation.

### WRITE-12: Extension Removal Must Update Metadata
When an extension section is removed (via a future `brief_remove_extension` tool or manual deletion), the `**Extensions:**` metadata field MUST be updated to remove the extension name. If the extension had associated ontology tags, those tags are NOT automatically removed — `brief_lint` will detect them as orphaned tags referencing a removed extension context.

### WRITE-15: Idempotent ontology tagging.
`brief_tag_entry` checks for existing tags on the target paragraph before writing. If an identical tag (same pack, same entry_id) already exists, return `already_tagged: true` without writing a duplicate. If the same entry is tagged with a different label_override, update the existing comment's label. (OQ-214)

### WRITE-16a: External Tool Session Breadcrumb Format (GAP-S15)
When `brief_capture_external_session` writes session metadata, it MUST append a one-line breadcrumb to an `## External Tool Sessions` subsection within the active BRIEF.md (created if absent). The exact format is:

```
- [session_date] [tool]: [n] decisions captured — [comma-separated decision titles]
```

Example: `- 2026-02-20 Ableton Live: 3 decisions captured — Key set to F minor, Tempo locked at 82 BPM, Reverb on bus`

This breadcrumb is written even when the captured decision list may be incomplete, providing a clear record that external work occurred on that date.

### WRITE-18: Idempotent Extension Creation
`brief_add_extension` detects if extension heading already exists. If so, return `already_exists: true` with existing content. Check `**Extensions:**` metadata consistency — add to metadata if heading exists but not listed. (OQ-176)

## Test Specification

### Unit Tests (specific input → expected output)
- Add extension → extension name appears in Extensions metadata field in lowercase_underscore format
- Add extension when heading uses ALL CAPS → metadata uses lowercase_underscores
- Remove extension → extension name removed from Extensions metadata field
- Tag with new ontology pack → pack name added to Ontologies metadata field
- Tag same paragraph with same pack and entry → returns already-tagged flag, no duplicate written
- Tag same entry with different label → existing comment label updated
- Create extension that already exists → returns already-exists flag with existing content
- Extension heading exists but not in metadata → metadata updated to include it
- External session breadcrumb → one-line entry appended in correct format with date, tool, count, titles
- External Tool Sessions sub-section missing → created on first breadcrumb write
- Extension name with valid characters (A-Z, 0-9, spaces) → accepted
- Extension name with invalid characters (lowercase, punctuation) → rejected with error
- File with tool-specific sections from other tools → those sections preserved byte-for-byte after any write
- Attempt to write brief-mcp tool-specific section when data fits in core section → rejected per last-resort policy
- New file metadata written → fields appear in canonical order: Project, Type, Extensions, Status, Created, Updated, Ontologies, Version
- Update one metadata field in existing file → only that field's value changes, all other fields remain in original position
- Version field set on new file → contains spec version string (e.g., "1.0"), not a project version

### Property Tests (invariants that hold for ALL inputs)
- forAll(extension name): heading format ↔ metadata format translation is reversible
- forAll(tag operation): idempotent — applying same tag twice produces identical file content
- forAll(write operation): all tool-specific sections from other tools preserved byte-for-byte
- forAll(extension name in [A-Z0-9 ]+): create succeeds; outside that set: create fails

## Tier 4 Criteria

Tier 4 criteria: JC-03, JC-10
