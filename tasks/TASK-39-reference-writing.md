# TASK-39: Reference — Writing

## Metadata
- Priority: 42
- Status: pending
- Dependencies: TASK-14, TASK-16, TASK-08
- Module path: src/reference/
- Type stubs: src/types/reference.ts
- Also read: src/types/writer.ts
- Test file: tests/reference/writing.test.ts
- Estimated context KB: 30

## What To Build

Implement the `brief_add_reference` MCP tool — write references to extension sections in BRIEF.md files. The tool appends a reference entry in `{creator}: {title} ({notes})` format to the specified `References: {TypeLabel}` section (creating it if needed). Ontology links are optional — when provided, `<!-- brief:ref-link {pack} {id} -->` comment tags are written after the reference entry. The tool warns on same-section exact duplicates but does not block the operation. Cross-section duplicates are allowed (different contexts). Uses the writer module (T14) for file modification and metadata sync (T16).

## Implementation Guide

1. `src/reference/writing.ts` — reference writing tool.

2. Register `brief_add_reference` tool handler. Accept parameters: `section` (required — target `References: {TypeLabel}` subsection), `creator` (required), `title` (required), `notes` (optional), `ontology_links` (optional array of `{pack, entry_id}` objects).

3. Reference format: write as `{creator}: {title} ({notes})` or `{creator}: {title}` if no notes. Append to the specified references subsection.

4. Section creation: if the target `References: {TypeLabel}` subsection does not exist, create it in the appropriate location within the extension section.

5. Ontology link writing: when `ontology_links` is provided, write `<!-- brief:ref-link {pack} {id} -->` comment tags after the reference entry. One comment per link.

6. Optional links: when `ontology_links` is not provided, write the reference without any ref-link comments. This is valid — not every reference needs formal ontology tagging.

7. Deduplication: check for an exact duplicate (same creator, same title, same section) before writing. If found, include a warning in the response but do NOT block the write. Cross-section duplicates (same creator + title in different sections) are allowed because they represent different contexts.

8. Use the writer module (T14) for the actual file modification. Delegate metadata sync to T16 as needed.

## Exported API

Export from `src/reference/writing.ts`:
- `addReference(params: { section: string; creator: string; title: string; notes?: string; ontologyLinks?: Array<{ pack: string; entryId: string }>; noActiveProject?: boolean }) → { written: boolean; referenceText: string; format: string; refLinkComments?: Array<{ text: string }>; sectionCreated?: boolean; duplicateWarning?: string; contentPreserved: boolean; originalContent: string; afterContent: string; filePath: string }`
  Reference format: `Creator: Title (year, notes)`. ref-link comment format: `<!-- brief:ref-link pack entryId -->`.

## Rules

### REF-04: Ontology Links on References
When `brief_add_reference` includes `ontology_links`, the writer MUST add `<!-- brief:ref-link {pack} {id} -->` comments after the reference entry.

### REF-10: Ontology Links Are Optional on References
`brief_add_reference` MUST accept calls without `ontology_links`. When no links are provided, the reference is recorded without `<!-- brief:ref-link -->` comment tags. This is valid — not every reference needs formal ontology tagging. `brief_lint` MAY report unlinked references as info-level findings.

### REF-11: Reference Deduplication
The same reference (same creator + title) MAY appear in multiple sections (different contexts). `brief_add_reference` MUST warn if an exact duplicate (same creator, title, AND section) already exists, but MUST NOT block the operation. `brief_lint` reports same-section duplicates as info-level findings.

## Test Specification

### Unit Tests (specific input → expected output)
- Add reference with creator, title, and notes → entry written in correct format
- Add reference without notes → entry written without parenthetical notes
- Add reference with ontology_links → ref-link comments written after entry
- Add reference with multiple ontology_links → one comment per link
- Add reference without ontology_links → no ref-link comments written
- Add reference to non-existent subsection → subsection created, then entry written
- Add reference to existing subsection → entry appended to existing content
- Exact duplicate in same section → warning returned, write still proceeds
- Same creator+title in different section → no warning, write proceeds (valid cross-section)
- Reference preserves existing section content → no side effects on other entries
- No active project → guard error

### Property Tests (invariants that hold for ALL inputs)
- forAll(reference with ontology_links): ref-link comments always written
- forAll(reference without ontology_links): no ref-link comments present
- forAll(same-section duplicate): warning always returned but write never blocked
- forAll(add operation): confirmation includes file path

## Tier 4 Criteria

Tier 4 criteria: JC-02, JC-07, JC-09
