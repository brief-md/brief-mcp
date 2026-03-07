# TASK-09: Parser — Metadata Extraction

## Metadata
- Priority: 10
- Status: pending
- Dependencies: TASK-02, TASK-03, TASK-05b
- Module path: src/parser/metadata.ts
- Type stubs: src/types/parser.ts
- Also read: none
- Test file: tests/parser/metadata.test.ts
- Estimated context KB: 45

## What To Build

Build a metadata extraction module that parses metadata from BRIEF.md files in three accepted formats: bold markdown, plain text, and YAML frontmatter. Detects required fields (Project, Type, Created), handles Extensions and Ontologies with comma-delimited grammar including version/excludes syntax, preserves unknown fields for forward compatibility, and tracks field order for write alignment. Inline metadata takes precedence over YAML frontmatter for duplicates.

## Implementation Guide

1. `src/parser/metadata.ts` — accepts raw content (already BOM-stripped and line-normalized) and returns structured metadata with fields, warnings, and field order.

2. **YAML frontmatter:** Detect `---` on line 1, find closing `---`. Parse with YAML 1.2 safe mode. Record consumed range so section parsing knows where body begins.

3. **Inline metadata:** Scan lines before first section heading for `**Field:** value`, `**Field :** value`, and `Field: value`. Value is everything after colon+space to EOL, treated as plain literal text (PARSE-22).

4. **Field normalization:** Case-insensitive canonical-name map (`project`/`PROJECT`/`Project` all resolve to `Project`).

5. **Precedence:** Inline overrides YAML for duplicate fields. Log override at debug level.

6. **Required fields:** Check for Project, Type, Created. Missing fields produce warnings (not errors — lenient per PARSE-01).

7. **Type normalization:** Normalize `Type` to lowercase-hyphen format (`"Software Library"` -> `"software-library"`) per COMPAT-06.

8. **Extensions:** Split on commas, trim. Accept heading format (`SONIC ARTS`) and metadata format (`sonic_arts`) per PARSE-13; store normalized lowercase_underscores.

9. **Ontologies:** Split on commas, parse per PARSE-23 grammar: name, optional `(version)`, optional `(excludes: ...)`.

10. **Unknown fields:** Preserve with original casing and value (COMPAT-01). Version field: accept `1.x` silently, warn on `2+` (COMPAT-03).

11. **Field order tracking:** Record ordinal position of each field for writer alignment.

## Exported API

Export from `src/parser/metadata.ts`:
- `parseMetadata(input: string) → { fields: Map<string, string>; warnings: string[]; consumedRange: { start: number; end: number }; fieldOrder: string[] }`
  Accepts bold markdown (`**Project:** Foo`), plain text (`Project: Foo`), and YAML frontmatter. Inline metadata wins over YAML.
- `normalizeFieldName(name: string) → string` — case-insensitive normalization to canonical form
- `normalizeType(value: string) → string` — lowercase with hyphens only (e.g., `'Software Library'` → `'software-library'`)
- `parseExtensionsList(input: string) → string[]` — parses comma-separated list to `snake_case` slugs
- `parseOntologiesList(input: string) → OntologyMetadataEntry[]` — parses entries with optional `(vX.X)` version and `(excludes: ...)` clauses

## Rules

### PARSE-01: Never Reject a BRIEF.md
The parser MUST NOT throw errors on malformed BRIEF.md files. If a file exists and contains any text, the parser must return whatever it can extract. Missing sections return empty, not errors.

### PARSE-04: Multi-Format Metadata
The parser MUST accept metadata in these formats:
- `**Field:** value` (canonical bold markdown)
- `**Field :** value` (extra space before colon — per IMPLEMENTATION_GUIDE.md lenient parsing table)
- `Field: value` (plain text)
- YAML frontmatter block (`---` delimited)

All four formats must produce identical parsed output for the same fields.

### PARSE-10: Required Metadata Fields (from BRIEF.md Core Spec)
The parser MUST recognise three required metadata fields: `Project`, `Type`, `Created`. A BRIEF.md missing any of these is **invalid** per the core spec. The parser should still read it (lenient), but `brief_lint` reports missing required fields as errors.

### PARSE-13: Extension Name Resolution
The parser MUST map between extension heading format (ALL CAPS with spaces, e.g., `SONIC ARTS`) and metadata format (lowercase_underscores, e.g., `sonic_arts`). Accept EITHER format in the `**Extensions:**` metadata field on read.

### PARSE-22: Extension and Ontology Metadata Delimiter
In the `**Extensions:**` and `**Ontologies:**` metadata fields, the comma (`,`) is the item delimiter. Extension and ontology names MUST NOT contain commas. The parser splits on commas, then trims whitespace from each item.
- Metadata values after `**Field:**` are plain text. Comma-as-delimiter only applies to the Extensions and Ontologies fields, not to all metadata. Nested markdown formatting within values (e.g., `**Project:** My **Bold** Project`) is preserved as literal text. (OQ-154)

### PARSE-23: Ontologies Metadata Field Grammar
The `**Ontologies:**` metadata field supports per-entry version annotation and opt-out syntax. Grammar:
```
ontologies = ontology ("," ontology)*
ontology   = name ["(" version ")"] ["(" "excludes:" name ("," name)* ")"]
```
Example: `**Ontologies:** theme-ontology (v2024.1), musicbrainz-genres (excludes: custom-themes)`. The `**Extensions:**` field uses the same comma-delimited grammar but does not support version or excludes syntax — it is a plain comma-separated list of names.

### COMPAT-01: Unknown Metadata Fields
The server MUST ignore unknown metadata fields gracefully and MUST preserve them when editing files. Unknown fields may come from newer spec versions or other tools.

### COMPAT-03: Version Compatibility
The server MUST accept BRIEF.md files following any v1.x spec version. Unknown fields added in minor versions are ignored but preserved. On major version mismatches (e.g., `**Version:** 2.0`), the server SHOULD warn but still attempt to parse.

## Test Specification

### Unit Tests (specific input -> expected output)
- Bold markdown field (`**Project:** Foo`) -> field extracted with correct name and value
- Bold markdown with extra space (`**Project :** Foo`) -> same result as canonical format
- Plain text field (`Project: Foo`) -> same result as canonical format
- YAML frontmatter with fields -> extracted identically to inline format
- YAML and inline both define same field -> inline value wins
- All three required fields present -> no missing-field warnings
- Missing one required field -> warning for that field, parsing continues
- Missing all required fields -> three warnings, parsing still succeeds
- Empty metadata region -> valid result with no fields and warnings
- Field names differing only in case -> resolve to same canonical field
- Extensions with heading format (`SONIC ARTS`) -> normalized to `sonic_arts`
- Ontologies with version syntax -> name and version extracted separately
- Ontologies with excludes syntax -> name and excludes list extracted
- Extensions with commas and whitespace -> items split and trimmed
- Value containing markdown (`My **Bold** Project`) -> preserved as literal text
- Non-Extensions field containing commas -> value not split
- Unknown metadata field -> preserved in output
- `spec_version: 1.3` -> accepted silently; `2.0` -> warning, parsing continues
- Type `Software Library` -> normalized to `software-library`
- Field order in output matches source appearance order
- Malformed YAML frontmatter -> warning, falls back to inline extraction

### Property Tests (invariants that hold for ALL inputs)
- forAll(field name string): case-insensitive lookup resolves consistently regardless of casing
- forAll(valid metadata content): parser never throws, always returns structured result
- forAll(list of extension names): comma-split-then-trim count equals input item count
- forAll(metadata with unknown fields): unknown fields appear in output exactly as written
- forAll(YAML + inline with overlapping keys): inline always takes precedence
- forAll(Type value): normalized form contains only lowercase letters, digits, and hyphens

## Tier 4 Criteria

Tier 4 criteria: JC-03
