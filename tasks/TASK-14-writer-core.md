# TASK-14: Writer — Core Write Engine

## Metadata
- Priority: 15
- Status: pending
- Dependencies: TASK-03, TASK-07, TASK-09, TASK-10
- Module path: src/writer/
- Type stubs: src/types/writer.ts
- Also read: src/types/parser.ts, src/types/io.ts
- Test file: tests/writer/core.test.ts
- Estimated context KB: 45

## What To Build

Build the core write engine for BRIEF.md files. This module implements a read-modify-write cycle that canonically formats only the sections being changed while preserving untouched content byte-for-byte. It handles metadata timestamp updates, new file creation with canonical field order, line ending consistency, trailing newline enforcement, and content structure warnings. All writes use the atomic write pattern provided by T07's file I/O utilities.

## Implementation Guide

1. `src/writer/index.ts` — barrel re-exporting public API.

2. `src/writer/core.ts` — main write engine. Accept parsed BRIEF.md (from T09/T10), a write operation descriptor (which section to modify, what content), and file path. Acquire file lock (from T07), read current file, apply modification, write back atomically.

3. Read-modify-write cycle: (a) read raw file content, (b) parse with T09/T10 parser, (c) apply the requested change to the target section, (d) reassemble the file preserving untouched sections byte-for-byte, (e) update `**Updated:**` timestamp, (f) write atomically via T07.

4. Section reassembly: iterate over the original file's sections. For each untouched section, emit its original raw text verbatim (byte-for-byte). For the modified section, emit canonically formatted content (bold metadata, canonical heading names, YYYY-MM-DD dates).

5. New file creation: when the target file does not exist, create it with metadata fields in canonical order (Project, Type, Extensions, Status, Created, Updated, Ontologies, Version) followed by any requested section content.

6. Line ending handling: new files always use LF. Existing files: detect the dominant line ending style and match it. Never mix styles within a file.

7. Trailing newline: ensure exactly one `\n` at end of file output.

8. Whitespace preservation: do not add or remove blank lines, trailing spaces, or indentation in sections not being modified.

9. Content structure check: if the content being written contains H1-level headings (`# ...`), include a warning in the response indicating this may affect document structure. Do not block the write.

## Exported API

Export from `src/writer/core.ts`:
- `writeSection(input: string, sectionName: string, newContent: string, options?: { simulateCrash?: boolean; filePath?: string }) → Promise<{ content: string; warnings: string[] }>`
  Byte-for-byte preservation of untouched sections. Updates `Updated:` timestamp.
- `writeBriefSection(filePath: string, section: string, content: string) → Promise<{ success: boolean; content?: string }>` — file-based section write
- `readBriefSection(filePath: string, section: string) → Promise<{ content: string }>` — file-based section read
- `createNewFile(options: { project: string; type: string; sectionContent?: string }) → string`
  Returns file content string. Metadata in canonical order: Project, Type, Extensions, Status, Created, Updated, Ontologies, Version.
- `detectLineEnding(content: string) → 'CRLF' | 'LF'`
- `ensureTrailingNewline(content: string) → string` — adds one newline if missing, collapses multiple trailing newlines to one

## Rules

### WRITE-01: Canonical Format for Touched Sections
When writing to a section, the writer MUST use spec-canonical formatting:
- Bold metadata: `**Field:** value`
- Canonical heading levels per spec
- Canonical section names (not aliases)
- Proper date format: `YYYY-MM-DD`

### WRITE-02: Preserve Untouched Content
The writer MUST NOT modify any section or line it wasn't explicitly asked to change. Untouched sections must be byte-for-byte identical after a write operation.

### WRITE-03: Update Timestamp
Every write operation MUST update the `**Updated:**` metadata field to the current date.

### WRITE-04: Atomic Writes
File writes MUST be atomic — write to a temp file, then rename. A crash mid-write must not corrupt the BRIEF.md.

### WRITE-06: Newline Consistency
The BRIEF.md core spec mandates LF (Unix) line endings. For **new files**, the writer MUST use LF. For **existing files**, the writer SHOULD detect the existing newline style and match it to avoid churn — but `brief_lint` should report CRLF files as info-level findings. Do not mix newline styles within a single file.

> **Spec divergence note:** SPECIFICATION.md (line 67) requires LF-only line endings. This rule takes a pragmatic position: enforcing LF on existing files that already use CRLF would cause unnecessary churn in Windows-created projects. New files are always LF-compliant; existing files are preserved to avoid disruption; `brief_lint` reports CRLF as info-level for visibility.

### WRITE-07: No Gratuitous Whitespace Changes
The writer MUST NOT add or remove blank lines, trailing whitespace, or indentation in sections it did not modify.

### WRITE-11: Metadata Field Order
When writing metadata, use this canonical order (aligned with SPECIFICATION.md examples): Project, Type, Extensions, Status, Created, Updated, Ontologies, Version. Existing files may have a different order — only enforce canonical order on newly created files.

> **Note:** `Ontologies` and `Version` are MCP-specific metadata fields not present in the core spec. They are placed after the spec-defined fields to maintain spec alignment for the standard fields.

### WRITE-19: Content Structure Warning
If `brief_update_section` content contains `#` (H1) headings, return warning in response: "Content contains top-level heading(s) which may affect document structure." Do not block — preserve lenient write principle. (OQ-179)

## Test Specification

### Unit Tests (specific input → expected output)
- File with three sections, modify middle section → first and last sections byte-for-byte identical to input
- Write to section using alias name → content appears under canonical heading
- Write using non-canonical casing → output uses canonical heading name
- New file creation → metadata fields in canonical order (Project, Type, Extensions, Status, Created, Updated, Ontologies, Version)
- Any write operation → Updated timestamp reflects current date
- Write to existing file with CRLF line endings → output preserves CRLF style
- New file creation → output uses LF line endings
- Output of any write → exactly one trailing newline at end of file
- Section not being modified contains unusual whitespace → whitespace preserved exactly
- Content with H1 heading written to section → write succeeds with warning in response
- Simulated crash during write (temp file exists, no rename) → original file intact
- Existing file with non-canonical metadata order → metadata order preserved (not reordered)
- Write to file that doesn't exist → file created with correct structure

### Property Tests (invariants that hold for ALL inputs)
- forAll(valid BRIEF.md, section index): writing to one section preserves all other sections byte-for-byte
- forAll(valid BRIEF.md): write then read produces identical parsed content for modified section
- forAll(write operation): Updated timestamp is always current date after write
- forAll(new file content): output ends with exactly one newline character
- forAll(valid BRIEF.md with mixed content): non-target sections are never modified

## Tier 4 Criteria

Tier 4 criteria: JC-03, JC-10
