# TASK-10: Parser — Sections & Headings

## Metadata
- Priority: 11
- Status: pending
- Dependencies: TASK-09
- Module path: src/parser/sections.ts
- Type stubs: src/types/parser.ts
- Also read: none
- Test file: tests/parser/sections.test.ts
- Estimated context KB: 45

## What To Build

Build a section parsing module that extracts the structural hierarchy of a BRIEF.md file from its headings. It performs case-insensitive matching against a canonical name table with built-in aliases, bundled language packs, and user-configured aliases. Classifies sections as core, extension, or project-specific, detects tool-specific sections, handles flexible heading levels, and is code-block-aware so lines inside code are never mistaken for headings.

## Implementation Guide

1. `src/parser/sections.ts` — accepts body content (post-metadata) and returns ordered section descriptors with classification, heading text, level, and body content.

2. **Code block detection (run FIRST):** Identify fenced (3+ backticks/tildes) and indented (4-space/tab after blank line) code blocks. Build line-range interval list. Lines inside code are never headings.

3. **Heading extraction:** ATX only (`#` prefix; no Setext). Strip leading/trailing `#`, trailing `{...}` attributes, then trim.

4. **Alias resolution (three-tier):** (a) Canonical English names case-insensitively. (b) Bundled language packs. (c) User `section_aliases` from config — additive only, cannot override built-ins.

5. **Flexible levels:** `#`/`##`/`###` all accepted for any section (PARSE-05).

6. **Tool-specific sections:** `TOOL SPECIFIC: {ToolName}` pattern, case-insensitive prefix. Classify as tool-scoped. Do not enforce file position (PARSE-09).

7. **Three-way classification:** core (canonical/alias/language match), extension (known extension via PARSE-13 from T09), project-specific (unmatched — preserved per PARSE-06). Unknown ALL CAPS not in extension list: project-specific + debug log (COMPAT-02).

8. **Section body:** Content between heading and next equal-or-higher-level heading (or EOF). H4 structural within section; H5/H6 content-level only.

9. **Return order:** File order; no reordering (PARSE-09). Empty/whitespace content returns zero sections.

9a. **Extension reference subsections:** Within extension sections, recognise the `## References: {TypeLabel}` subsection heading pattern (e.g., `## References: Musical`, `## References: Thematic`). These are parsed as structured reference lists, not generic content. Each list item is a reference entry in the format `{creator}: {title} ({notes})`. The `brief:ref-link` comment tag on the following line links the entry to an ontology entry. Reference PARSE-16.

10. **Duplicate section headings:** If two or more sections with the same heading (after case-normalisation and alias resolution) appear in the same file, concatenate their content in document order with a blank line separator between them. The resulting merged section is returned as a single section. `brief_lint` warns about duplicate sections. Reference OQ-010.

## Exported API

Export from `src/parser/sections.ts`:
- `parseSections(input: string, options?: { aliases?: Record<string, string> }) → Section[]`
  Each Section includes: `canonicalName`, `headingText`, `classification`, `body`, `level`, `hasDuplicate?`, `subsections?`, `toolName?`. H1-H3 all resolve identically. Strips trailing hashes and `{#...}` attributes. Sections returned in document order.
- `resolveAlias(alias: string, options?: { userAliases?: Record<string, string> }) → string`
  Built-in aliases: `Overview` → `What This Is`, `Motivation` → `Why This Exists`, etc. Bundled language packs (e.g., German: `'Was das ist'` → `'What This Is'`). User aliases override built-in.
- `classifySection(heading: string) → SectionClassification`
  Returns `'core'`, `'extension'`, `'project-specific'`, or `'tool-specific'`. Known extension headings (e.g., `'SONIC ARTS'`) → `'extension'`.
- `parseReferenceList(items: string[]) → Array<{ creator: string; title: string; notes?: string }>`
  Parses `'Creator: Title (notes)'` format

## Rules

### PARSE-02: Case-Insensitive Section Matching
All section heading matching MUST be case-insensitive. "What This Is", "what this is", and "WHAT THIS IS" must all resolve to the same canonical section.

### PARSE-03: Section Alias Resolution
The parser MUST maintain a map of section aliases. At minimum:
| Canonical Name | Accepted Aliases |
|---|---|
| What This Is | What It Is, Description, About, Overview |
| What This Is NOT | What It Is Not, What This Is Not, Constraints, Exclusions, Not This |
| Why This Exists | Motivation, Purpose, Reason, Intent, Goal |
| Key Decisions | Decisions, Decisions Made, Design Decisions |
| Open Questions | Questions, Unresolved |

- The system ships bundled language alias packs for major languages (French, German, Spanish, Portuguese, Japanese, Chinese, Korean, Arabic, Russian, and more). These are loaded automatically, enabling non-English users to work in their language without configuration. The alias resolution order is: (1) canonical English name, (2) bundled language aliases, (3) user-configured `section_aliases` in config.json. (OQ-253)
- Strip trailing `#` characters and `{...}` attributes from heading text before matching against canonical section names. E.g., `## What This Is ## {#custom-id}` matches "What This Is". Writer does not add trailing hashes or attributes. (OQ-159)

**User-configurable aliases:** Users MAY define additional section aliases via a `section_aliases` entry in `~/.brief/config.json`. User-defined aliases are merged with the built-in table; they cannot override or remove built-in aliases. Format:
```json
{
  "section_aliases": {
    "What This Is": ["Summary", "Project Description"],
    "Key Decisions": ["Architecture Decisions"]
  }
}
```

### PARSE-04: Multi-Format Metadata
The parser MUST accept metadata in these formats:
- `**Field:** value` (canonical bold markdown)
- `**Field :** value` (extra space before colon — per IMPLEMENTATION_GUIDE.md lenient parsing table)
- `Field: value` (plain text)
- YAML frontmatter block (`---` delimited)

All four formats must produce identical parsed output for the same fields.

### PARSE-05: Flexible Heading Levels
The parser MUST accept `#`, `##`, and `###` for any section heading regardless of spec-canonical level. A `# What This Is` and `### What This Is` must both be recognised.

### PARSE-06: Preserve Unknown Sections
Any section heading not matching a known canonical name or alias MUST be preserved as project-specific content and returned in tool responses. Never discard unknown sections.

### PARSE-09: Section Order Independence
The parser MUST correctly parse BRIEF.md files regardless of section order. Sections may appear in any sequence.

### PARSE-14: Tool-Specific Section Detection
The parser MUST detect sections with the `# TOOL SPECIFIC: {ToolName}` heading format and treat them as tool-scoped content, distinct from extensions and unknown sections. These sections are always at the end of the file.

### PARSE-19: Empty File Handling
If a BRIEF.md file exists but is empty (0 bytes), the parser MUST return a valid parsed result with no metadata fields and no sections — not an error. `brief_lint` reports missing-required-fields errors (VALID-01) for the empty file, but the parser itself does not reject it.
- Strip UTF-8 BOM (U+FEFF) from the beginning of file content before any parsing. Never write a BOM back. Log at debug when detected. (OQ-152)
- Normalise all line endings to `\n` at the start of the parse pipeline before structural parsing. Writer outputs `\n` consistently. (OQ-153)

### COMPAT-02: Unknown Extension Names
The server MUST NOT reject files with unrecognised extension names. Unknown extensions are preserved as-is. The server MAY warn about unrecognised extensions but MUST still parse the file.

## Test Specification

### Unit Tests (specific input -> expected output)
- Canonical heading `## What This Is` -> resolved to core section
- Alias `## Overview` -> resolved to core "What This Is"
- Mixed-case and ALL CAPS variants -> same canonical section
- Trailing hashes and `{...}` attributes -> stripped before matching
- H1, H2, H3 for same name -> all resolve identically
- Each built-in alias -> correct canonical section
- User alias -> resolves; user override of built-in -> built-in preserved
- Bundled language alias -> resolves to canonical section
- Heading inside fenced or indented code block -> not a section
- Sections in non-canonical order -> all parsed correctly
- Unknown heading -> preserved as project-specific
- `# TOOL SPECIFIC: Cursor` -> tool-scoped with name "Cursor"
- Section body to next equal-or-higher heading -> body captured
- H4 structural within section; H5/H6 content-level, not boundaries
- Empty file -> zero sections, no error; BOM/CRLF -> handled gracefully
- Unrecognised ALL CAPS heading -> project-specific, not rejected
- Setext underline -> not recognised; consecutive headings -> empty body preserved
- File with two sections sharing the same heading -> content concatenated in document order as single section, lint warning produced
- Extension section with `## References: Musical` subsection -> parsed as structured reference list
- Reference list item `John Coltrane: A Love Supreme (modal jazz)` -> parsed with creator, title, notes fields

### Property Tests (invariants that hold for ALL inputs)
- forAll(heading text): case-insensitive matching produces same canonical name regardless of casing
- forAll(heading level in 1..3, section name): flexible level always resolves the section
- forAll(valid BRIEF.md content): parser never throws, always returns structured result
- forAll(list of sections in any order): parsed count equals headings outside code blocks
- forAll(content with `#` lines inside code blocks): no code-block line appears as section
- forAll(unknown section heading): heading text preserved exactly as written

## Tier 4 Criteria

Tier 4 criteria: JC-03
