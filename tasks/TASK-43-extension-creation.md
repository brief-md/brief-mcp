# TASK-43: Extension — Creation & Listing

## Metadata
- Priority: 46
- Status: pending
- Dependencies: TASK-14, TASK-16, TASK-08
- Module path: src/extension/
- Type stubs: src/types/extension.ts
- Also read: src/types/writer.ts, src/types/parser.ts
- Test file: tests/extension/creation.test.ts
- Estimated context KB: 35

## What To Build

Implement two MCP tools: `brief_add_extension` and `brief_list_extensions`. The add tool creates an extension section as an H1 heading with standard subsections, validates extension name characters (`[A-Z0-9 ]+` only), updates the `**Extensions:**` metadata field, and handles idempotent creation (returns `already_exists: true` if heading exists). The list tool returns all known extensions (spec-defined + custom) with descriptions, subsections, and associated ontologies. Extension heading format (ALL CAPS) maps to metadata format (lowercase_underscores) via the parser's name resolution.

## Implementation Guide

1. `src/extension/creation.ts` — extension creation and listing tools.

2. Register `brief_add_extension` tool handler. Accept parameters: `extension_name` (required — the extension name in either ALL CAPS or lowercase_underscore format), `subsections` (optional array — custom subsection names to include).

3. Extension name validation: the heading name must match `[A-Z0-9 ]+` only. Reject names with other characters. On lenient reading, accept any heading — this validation applies only to writes. Map between heading format (ALL CAPS with spaces, e.g., `SONIC ARTS`) and metadata format (lowercase_underscores, e.g., `sonic_arts`).

4. Idempotent creation: before writing, check if an extension heading already exists in the file. If it does, return `already_exists: true` with the existing content. Also check `**Extensions:**` metadata consistency — if the heading exists but isn't listed in metadata, add it to metadata.

5. Extension section structure: create the H1 heading and standard subsections. For spec-defined extensions, use their known subsections. For custom extensions, follow the convention: Direction/Intent, Constraints, References, Open Questions.

6. Metadata sync: after creating the extension heading, update the `**Extensions:**` metadata field. Write the metadata in canonical format (lowercase with underscores).

7. Register `brief_list_extensions` tool handler. No required parameters. Return all known extensions — the six spec-defined extensions plus any custom extensions found in the current project's BRIEF.md. Include descriptions, subsection lists, and associated ontologies for each.

8. Extension subsection disambiguation: when targeting a subsection that exists in multiple extensions, require the format `"EXTENSION > Subsection"`. If a bare subsection name is ambiguous, return an error listing the matching extensions. Non-ambiguous bare names are accepted.

## Exported API

Export from `src/extension/creation.ts`:
- `addExtension(params: { extensionName: string; targetSubsection?: string; simulateAmbiguous?: boolean; subsections?: string[]; simulateOrphanHeading?: boolean }) → { created: boolean; alreadyExists?: boolean; subsections: string[]; metadataUpdated?: boolean; metadataFormat: string; headingFormat: string; metadataKey: string; success?: boolean; content?: string }`
  Default subsections: `Direction/Intent`, `Constraints`, `References`, `Open Questions`. `metadataFormat`: `snake_case` (e.g., `sonic_arts`). `headingFormat`: `ALL CAPS` (e.g., `SONIC ARTS`).
- `listExtensions(options?: { includeProject?: boolean }) → { extensions: Array<{ name: string; description: string; subsections: string[]; associatedOntologies: string[] }> }`
- `resolveSubsectionTarget(target: string) → { extensionName: string; subsectionName: string }`
  Parses `"EXTENSION > Subsection"` format.

## Rules

### WRITE-05: Metadata Sync on Extension/Ontology Changes
When `brief_add_extension` is called, the `**Extensions:**` metadata field MUST be updated. When `brief_tag_entry` is called with a new ontology, the `**Ontologies:**` metadata field MUST be updated (including version).

### WRITE-08: Extension Name in Metadata Format
When writing the `**Extensions:**` metadata field, use the BRIEF.md core spec's canonical format: **lowercase with underscores** (e.g., `sonic_arts, narrative_creative`). The heading in the document body uses ALL CAPS with spaces (e.g., `# SONIC ARTS`). The writer must translate between the two formats.

### WRITE-16b: Extension Name Character Validation
Extension names in headings must consist of `[A-Z0-9 ]+` only. `brief_add_extension` rejects other characters. Lenient reading accepts any heading; `brief_lint` warns about non-conformant names. (OQ-174)

### WRITE-17: Extension Subsection Disambiguation
When targeting a subsection that exists in multiple extensions, require format `"EXTENSION > Subsection"`. If bare name is ambiguous, return `user_error` listing matches. Non-ambiguous bare names accepted. (OQ-175)

### WRITE-18: Idempotent Extension Creation
`brief_add_extension` detects if extension heading already exists. If so, return `already_exists: true` with existing content. Check `**Extensions:**` metadata consistency — add to metadata if heading exists but not listed. (OQ-176)

### PARSE-13: Extension Name Resolution
The parser MUST map between extension heading format (ALL CAPS with spaces, e.g., `SONIC ARTS`) and metadata format (lowercase_underscores, e.g., `sonic_arts`). Accept EITHER format in the `**Extensions:**` metadata field on read.

### COMPAT-05: Full Extension List with Abstract Capabilities
The server MUST know about all six spec-defined extensions: SONIC ARTS, NARRATIVE CREATIVE, LYRICAL CRAFT, VISUAL STORYTELLING, STRATEGIC PLANNING, SYSTEM DESIGN. The bundled extension registry must include all six with descriptions, **abstract capability descriptors** (for cross-domain matching), typical subsections, and commonly associated ontologies. The abstract capability descriptors enable the three-tier `brief_suggest_extensions` algorithm to match extensions across domains (e.g., SONIC ARTS matching "sensory qualities" for a food project).

### COMPAT-12: Custom Extension Subsection Convention
Custom extensions created for unknown domains SHOULD follow the standard subsection structure: Direction/Intent, Constraints, References, Open Questions. This is a SHOULD, not a MUST — domain-specific needs may require a different structure. The AI client makes this decision based on conversation context.

## Test Specification

### Unit Tests (specific input → expected output)
- Add spec-defined extension → heading created with correct subsections
- Add custom extension → heading created with standard subsection convention
- Extension name with valid characters ([A-Z0-9 ]) → accepted
- Extension name with invalid characters → rejected
- Extension already exists → already_exists: true returned, no duplicate heading
- Extension heading exists but not in metadata → metadata updated to include it
- Metadata format → always lowercase with underscores
- Heading format → always ALL CAPS with spaces
- Name provided as lowercase_underscore → converted to ALL CAPS heading
- Ambiguous bare subsection name across extensions → error listing matches
- Non-ambiguous bare subsection name → accepted without disambiguation
- List extensions → all six spec-defined extensions returned with descriptions
- List extensions on project with custom extension → custom extension included in results
- Empty extension section → valid placeholder, no error

### Property Tests (invariants that hold for ALL inputs)
- forAll(add extension): metadata field always updated
- forAll(extension name): heading ↔ metadata format mapping always consistent
- forAll(existing extension): never duplicated on repeat add
- forAll(list result): all six spec-defined extensions always present

## Tier 4 Criteria

Tier 4 criteria: JC-01, JC-02, JC-07, JC-09
