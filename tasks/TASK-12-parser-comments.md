# TASK-12: Parser — HTML Comments & Tags

## Metadata
- Priority: 13
- Status: pending
- Dependencies: TASK-10
- Module path: src/parser/comments.ts
- Type stubs: src/types/parser.ts
- Also read: none
- Test file: tests/parser/comments.test.ts
- Estimated context KB: 45

## What To Build

Build a state-machine HTML comment parser that extracts `brief:`-prefixed HTML comments from BRIEF.md and produces structured tag objects for ontology annotations, reference links, and exception markers. The parser uses character-by-character scanning (no regex) for O(n) time and ReDoS immunity. It is code-block-aware, skipping comments inside fenced or indented code blocks. Malformed comments are silently ignored. Extracted tags are associated with the paragraph above them.

## Implementation Guide

1. `src/parser/comments.ts` — accepts raw file content (BOM-stripped, line-normalized). Returns structured tag collection plus content with recognized comments removed.

2. **Code block pre-scan:** Identify fenced code blocks (` ``` ` and `~~~` openers/closers) and indented code blocks (4+ leading spaces preceded by blank line). Record line ranges. Skip any HTML comments within these ranges.

3. **State machine:** Character-by-character scanner with states: `TEXT` → `OPEN_BANG` → `OPEN_DASH1` → `OPEN_DASH2` → `COMMENT_BODY` → `CLOSE_DASH1` → `CLOSE_DASH2`. No backtracking. First `<!--` opens, first `-->` closes. Nested `<!--` inside a comment is ignored. Unclosed comment at EOF is silently discarded (debug log).

4. **Leniency:** `--` inside comment body does not truncate — continue accumulating. Multi-line comments have internal whitespace collapsed to single spaces before payload parsing.

5. **Payload parsing:** After extracting and normalizing comment body, check for `brief:` prefix. Parse three known types:
   - `brief:ontology {pack} {id} "{label}"` → pack, entry ID, quoted label
   - `brief:ref-link {pack} {id}` → pack, entry ID
   - `brief:has-exception "{title}" {date}` → quoted title, date
   Unrecognised `brief:` types → preserve as-is, debug log.

6. **Tag association:** Link each tag to the nearest preceding non-empty paragraph by line number. Non-`brief:` HTML comments preserved in output unchanged. Ontology tags are paragraph-scoped, not section-scoped — there is no section-scoped ontology concept in v1. Tags travel with their associated paragraph content when moved between sections. Reference OQ-217.

7. **Resource limits:** Enforce 10 MB file size and 500 section limits before scanning.

## Exported API

Export from `src/parser/comments.ts`:
- `parseComments(input: string) → { tags: BriefTag[]; content: string }`
  Extracts `<!-- brief:ontology pack entryId "label" -->`, `<!-- brief:ref-link pack entryId -->`, `<!-- brief:has-exception "title" date -->` tags. Tags use `associatedLine` property. OntologyTag includes optional `body`. Content string has recognized `brief:` comments removed; non-brief HTML comments preserved. Throws on oversized input (error matches `/size|limit/i`). Comments inside code blocks (triple-backtick, `~~~`, indented) are skipped.
- `extractBriefTag(comment: string) → BriefTag | null` — parses a single HTML comment into a tag
- `isInsideCodeBlock(lines: string[], lineIndex: number) → boolean` — returns true if line is inside a fenced or indented code block

## Rules

### PARSE-07: HTML Comment Extraction
The parser MUST extract HTML comments matching these patterns:
- `<!-- brief:ontology {pack} {id} "{label}" -->`
- `<!-- brief:ref-link {pack} {id} -->`
- `<!-- brief:has-exception "{title}" {date} -->`

Comments not matching the `brief:` prefix MUST be preserved as-is.

### PARSE-15: HTML Comments Inside Code Blocks
The parser MUST NOT extract `brief:` HTML comments that appear inside fenced code blocks (`` ``` ``). Only match comments in prose content. Users may document the comment format as examples within code blocks.

### PARSE-20: HTML Comment Parsing Robustness
The HTML comment parser MUST handle these edge cases:
- **Multi-line comments:** Normalise internal whitespace to single spaces before parsing the `brief:` payload
- **Nested/double-open comments:** Treat the first `<!--` as the opener and the first `-->` as the closer; anything after is a new comment
- **Comments inside fenced code blocks:** Skip entirely — the parser MUST be code-block-aware (reinforces PARSE-15)
- **Malformed comments (no closing `-->`):** Silently ignore and log at debug level. Never throw or return an error for malformed ontology comments — the lenient-read principle applies
- `--` (double dash) inside HTML comments is technically invalid per HTML spec. The parser should handle `--` leniently (don't truncate), but `brief_lint` should warn. Pack IDs and entry IDs must not contain consecutive hyphens. (OQ-204)
- Parser must identify fenced code blocks (triple-backtick and `~~~`) and indented code blocks (4+ spaces) BEFORE scanning for headings, metadata, or HTML comments. Content inside code blocks is never treated as structural. (OQ-155)
- Unrecognised `brief:` prefixed HTML comments (e.g., `<!-- brief:custom-tag ... -->`) are preserved as-is and logged at debug level. `brief_lint` reports them as info: "Unknown brief comment type." Known types: `brief:ontology`, `brief:ref-link`, `brief:has-exception`. (OQ-164)

### SEC-17: Parser Resource Limits
The parser MUST enforce resource limits to prevent denial-of-service from maliciously crafted BRIEF.md files:
- **Maximum file size:** 10 MB — files larger than this are rejected with a clear error before parsing
- **Maximum section count:** 500 sections per file — prevents memory exhaustion from files with thousands of headings
- **Maximum decision chain depth:** 100 links for supersession chain traversal — prevents infinite loops from circular `SUPERSEDED BY` / `REPLACES` references
These limits are safety nets — legitimate files should never approach them. `brief_lint` warns at 1000 lines (VALID-04), well before these hard limits.
- Use a state-machine parser (not regex) for HTML comment extraction. Regex-based comment parsers are vulnerable to ReDoS (catastrophic backtracking) on crafted inputs like unclosed comments followed by thousands of characters. A character-by-character state machine has O(n) time complexity regardless of input. (OQ-231)

## Test Specification

### Unit Tests (specific input → expected output)
- Ontology comment with pack, ID, and quoted label → tag with all three fields extracted
- Ref-link comment with pack and ID → tag with both fields extracted
- Has-exception comment with quoted title and date → tag with title and date extracted
- Non-`brief:` HTML comment → preserved as-is, not extracted as tag
- `brief:` comment inside triple-backtick fenced code block → skipped, not extracted
- `brief:` comment inside `~~~` fenced code block → skipped
- `brief:` comment inside indented code block → skipped
- Same comment in prose outside code blocks → extracted normally
- Multi-line comment with internal newlines → whitespace normalized, tag extracted correctly
- Nested `<!--` inside open comment → ignored, first opener/closer pair used
- Two consecutive comments → both extracted independently
- Unclosed comment (no `-->` before EOF) → silently ignored, no error
- `--` inside comment body → not truncated, full body preserved
- Unrecognised `brief:` type → preserved as-is, not extracted as structured tag
- Label containing spaces inside quotes → full quoted string extracted intact
- File exceeding 10 MB → rejected before parsing
- Empty file → empty tag collection, no errors
- Ontology tag after paragraph → associated with that paragraph, not the section
- Tag association → paragraph-scoped, not section-scoped

### Property Tests (invariants that hold for ALL inputs)
- forAll(file content): parser never throws, always returns result (unless over size limit)
- forAll(comment body): state machine completes without backtracking
- forAll(comment inside code block): never extracted regardless of content
- forAll(valid ontology comment): extracted tag always has pack, ID, and label
- forAll(multi-line comment body): normalized payload has no newlines or consecutive spaces

## Tier 4 Criteria

Tier 4 criteria: JC-03
