# TASK-13: Parser — Pre-Processing & Edge Cases

## Metadata
- Priority: 14
- Status: pending
- Dependencies: TASK-09, TASK-10, TASK-11, TASK-12
- Module path: src/parser/preprocessing.ts
- Type stubs: src/types/parser.ts
- Also read: none
- Test file: tests/parser/preprocessing.test.ts
- Estimated context KB: 50

## What To Build

Build the pre-processing pipeline that runs before all parser modules: BOM stripping, line ending normalization, resource limit enforcement, and merge conflict detection. Also provides GFM strikethrough support, a metadata-only fast path, streaming for large files, a parse timeout, and a test corpus of intentionally messy files.

## Implementation Guide

1. `src/parser/preprocessing.ts` — accepts raw bytes or string, returns cleaned content plus warnings/errors.

2. **BOM + line endings:** Strip U+FEFF from file start (debug log, never write back). Replace `\r\n` and `\r` with `\n`. Runs first so downstream assumes `\n`-only.

3. **Resource limits:** File > 10 MB → reject before parsing. Heading scan > 500 sections → reject. Decision chain depth > 100 links → break traversal and log warning (prevents infinite loops from circular SUPERSEDED BY / REPLACES references). All three enforced before or during structural parsing. Reference SEC-17 and OQ-249.

4. **Merge conflicts:** `<<<<<<<`/`=======`/`>>>>>>>` at line start → data error. Write tools refuse; read tools return partial with warning.

5. **GFM:** `~~strikethrough~~` recognized. Tables preserved. No extensions beyond GFM.

6. **Timeout:** 5-second limit per file — exceeded limit aborts parsing and returns `system_error`. **Fast path:** Metadata-only reads until first section heading. **Streaming:** Files > 100KB use chunked processing with identical output.

6a. **ReDoS protection (SEC-17):** ALL structural parsing in this module (heading detection, metadata extraction, HTML comment extraction, code block detection) MUST use linear-time state-machine approaches or simple linear-scan logic. Do NOT use backtracking regular expressions on user-supplied content — they are vulnerable to catastrophic backtracking on crafted inputs (e.g., unclosed HTML comments followed by thousands of characters). The 5-second parse timeout (step 6) is the final safety net, but O(n) parsing is the primary protection. Reference SEC-17 and OQ-231.

6b. **Code block detection (OQ-155):** During preprocessing, identify all fenced code block ranges (triple-backtick ` ``` ` and triple-tilde `~~~` delimited) and indented code blocks (4+ leading spaces). Mark these byte/line ranges. All subsequent structural parsing (heading detection, metadata field extraction, HTML comment extraction) MUST skip content inside code blocks — a `#` character or `**Field:**` pattern inside a code block is content, not structure.

7. **Heading depth:** H4 = structural sub-heading. H5/H6 = content only. **Content preservation:** Non-`brief:` HTML, images, tables preserved as-is.

8. **Trailing newlines:** Accept any state; writer normalizes. **Empty files:** 0 bytes → valid empty result.

9. **Test corpus:** Messy fixtures (BOM + CRLF, merge markers, empty, oversized) in test fixtures directory.

## Exported API

Export from `src/parser/preprocessing.ts`:
- `preprocess(input: string) → { content: string; warnings: string[]; strikethroughSegments: Array<{ text: string; start: number; end: number }>; structuralHeadings: Array<{ text: string; level: number; line: number }>; mode?: 'streaming' | 'in-memory' }`
  Strips BOM (with warning), normalizes line endings, detects strikethrough segments, extracts structural headings.
- `preprocessContent(input: string) → Promise<PreprocessResult>` — async version
- `preprocessContentStream(input: string) → Promise<PreprocessResult>` — streaming async version (must return identical results to preprocessContent)
- `stripBom(content: string) → string`
- `normalizeLineEndings(content: string) → string`
- `checkResourceLimits(content: string) → void` — throws on: file >10,485,760 bytes, >500 sections (counts `##` headings), >100 decision chain depth (scans `SUPERSEDED BY:` / `REPLACES:` chains in content)
- `detectMergeConflicts(content: string) → void` — throws (matches `/merge conflict/i`) if `<<<<<<< HEAD` found at line start
- `metadataOnlyFastPath(input: string) → string` — returns metadata portion only, stops before first section heading

Also: barrel export `src/parser/index.ts` must export:
- `parseBrief(input: string, options?: { timeoutMs?: number }) → ParsedBriefMd`

## Rules

### PARSE-17: Heading Depth Within Sections
Within a section (e.g., `## Key Decisions`), the parser MUST recognise `####` (H4) as structural sub-headings (e.g., grouping alternatives, or a `#### Context` sub-heading within a decision). H5 (`#####`) and H6 (`######`) MUST be treated as document content, not as section or sub-section boundaries. `brief_lint` SHOULD warn (info level) if H5/H6 appear within Key Decisions, as this likely indicates the content should be restructured.

### PARSE-18: Markdown Dialect
The parser MUST support GitHub Flavored Markdown (GFM), not just CommonMark. Specifically, strikethrough (`~~text~~`) is required for the superseded decision format (DEC-01) and tables may appear in user content. The parser MUST NOT require or support markdown extensions beyond GFM (no math notation, no custom directives).

### PARSE-19: Empty File Handling
If a BRIEF.md file exists but is empty (0 bytes), the parser MUST return a valid parsed result with no metadata fields and no sections — not an error. `brief_lint` reports missing-required-fields errors (VALID-01) for the empty file, but the parser itself does not reject it.
- Strip UTF-8 BOM (U+FEFF) from the beginning of file content before any parsing. Never write a BOM back. Log at debug when detected. (OQ-152)
- Normalise all line endings to `\n` at the start of the parse pipeline before structural parsing. Writer outputs `\n` consistently. (OQ-153)

### PARSE-21: Non-Markdown Content Preservation
BRIEF.md files may contain embedded content (images, raw HTML, HTML tables) beyond `brief:` comments. The parser MUST preserve all such content as-is within its containing section. Content between recognised section headings is treated as section body — no filtering or transformation is applied.

### PARSE-24: Git Merge Conflict Marker Detection
If `<<<<<<<`, `=======`, `>>>>>>>` markers found at line start, return `data_error`: "BRIEF.md contains unresolved git merge conflicts." Write tools refuse to modify files with conflict markers. Read tools may return partial results with warning. (OQ-157)

### PARSE-25: Trailing Newline Handling
Parser handles files with and without trailing newlines. Writer always ensures a single trailing `\n` on output (POSIX convention). Not flagged by lint — silently normalised on write. (OQ-158)

### SEC-17: Parser Resource Limits
The parser MUST enforce resource limits to prevent denial-of-service from maliciously crafted BRIEF.md files:
- **Maximum file size:** 10 MB — files larger than this are rejected with a clear error before parsing
- **Maximum section count:** 500 sections per file — prevents memory exhaustion from files with thousands of headings
- **Maximum decision chain depth:** 100 links for supersession chain traversal — prevents infinite loops from circular `SUPERSEDED BY` / `REPLACES` references
These limits are safety nets — legitimate files should never approach them. `brief_lint` warns at 1000 lines (VALID-04), well before these hard limits.
- Use a state-machine parser (not regex) for HTML comment extraction. Regex-based comment parsers are vulnerable to ReDoS (catastrophic backtracking) on crafted inputs like unclosed comments followed by thousands of characters. A character-by-character state machine has O(n) time complexity regardless of input. (OQ-231)

## Test Specification

### Unit Tests (specific input → expected output)
- File starting with UTF-8 BOM → BOM stripped, parsed normally, debug log emitted
- File with `\r\n` line endings → all normalized to `\n`
- File with mixed line endings (`\r\n`, `\r`, `\n`) → all normalized to `\n`
- File exceeding 10 MB → rejected before structural parsing
- File with more than 500 sections → rejected with section-count error
- File with `<<<<<<<` at line start → data error about merge conflicts
- Conflict markers inside a code block → not detected as conflicts
- Empty file (0 bytes) → valid result, no metadata, no sections, no error
- `~~strikethrough~~` text → GFM strikethrough recognized
- GFM tables in content → preserved, not misinterpreted as structure
- H4 inside a section → structural sub-heading; H5/H6 → content only
- Embedded images and raw HTML in section body → preserved as-is
- File with and without trailing newline → both parsed successfully
- Metadata-only fast path → returns metadata, stops before first section
- Parse exceeding 5-second timeout → aborted with system error
- File over 100KB → streaming mode, same result as in-memory parse

### Property Tests (invariants that hold for ALL inputs)
- forAll(file content bytes): pipeline never throws, returns result or structured error
- forAll(file with any line ending style): after normalization, no `\r` characters remain
- forAll(file starting with BOM): after stripping, first character is never U+FEFF
- forAll(file under limits): pre-check passes, content reaches downstream parsing
- forAll(empty or whitespace-only content): valid result with no sections and no metadata
- forAll(file with embedded non-markdown content): non-structural content unchanged in output
- forAll(same content via streaming vs in-memory): both produce identical results

## Tier 4 Criteria

Tier 4 criteria: JC-03
