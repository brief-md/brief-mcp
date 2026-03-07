# TASK-28: Context Write — Sections & External Sessions

## Metadata
- Priority: 30
- Status: pending
- Dependencies: TASK-14, TASK-16, TASK-08, TASK-30
- Module path: src/context/
- Type stubs: src/types/context.ts
- Also read: src/types/writer.ts
- Test file: tests/context/write-sections.test.ts
- Estimated context KB: 40

## What To Build

Implement two MCP tools: `brief_update_section` and `brief_capture_external_session`. `brief_update_section` allows updating any section by name (using lenient alias resolution) with optional append mode, creating missing sections at canonical positions. `brief_capture_external_session` batch-writes decisions from external tool sessions as a single atomic operation, records a session breadcrumb, and auto-triggers conflict detection.

## Implementation Guide

1. `src/context/write-sections.ts` — section update and external session handlers.

2. `brief_update_section` handler: accept `section` (required name/alias), `content` (required, empty string valid for clearing), `append` (optional boolean, default false). Resolve target section via parser's lenient alias map (WRITE-14). If section exists, replace content (or append if flag set). If section missing, create at the canonical position in the file. Check content for H1 headings and include warning if found (WRITE-19). When moving content between sections, any ontology HTML comment tags (`brief:ontology`, `brief:ref-link`) attached to moved paragraphs travel with that content and are preserved — ontology tags are paragraph-scoped, not section-scoped. Reference OQ-217.

3. `brief_capture_external_session` handler: accept `tool` (required, name of external tool), `decisions` (required array of decision objects with title and optional why/alternatives), `session_date` (optional, defaults to today). Validate all inputs. Write all decisions in a single atomic operation — either all succeed or none are written. After writing decisions, append a session breadcrumb to the `## External Tool Sessions` sub-section (WRITE-16a). Auto-trigger conflict detection (T30) and include any conflicts in the response.

4. Atomic batch: use a single read-modify-write cycle for the entire external session. Do not write decisions one at a time. This prevents partial state if the operation fails mid-way.

5. Breadcrumb format: `- [session_date] [tool]: [n] decisions captured — [comma-separated decision titles]`.

6. Both handlers: validate inputs via MCP-03, run requireActiveProject() guard, return confirmation with file path and summary.

## Exported API

Export from `src/context/write-sections.ts`:
- `handleUpdateSection(options: { heading?: string; section?: string; content: string; append?: boolean; _noActiveProject?: boolean }) → { success: boolean; sectionUpdated: string; canonicalName: string; previousContent?: string; appendMode?: boolean; warnings?: string[]; tagsPreserved?: boolean; content: Array<{ type: string; text: string }>; isError?: boolean }`
- `handleCaptureExternalSession(options: { tool: string; decisions: Array<{ title: string; why: string }>; _noActiveProject?: boolean }) → { success: boolean; decisionsWritten: number; breadcrumbWritten: boolean; breadcrumbFormat?: string; breadcrumb?: string; conflictsDetected?: boolean; conflictDetectionRan?: boolean; isError?: boolean; content?: any }`
  Atomic: all decisions succeed or none. Breadcrumb includes: date (YYYY-MM-DD), tool name, count, comma-separated titles.

## Rules

### WRITE-14: Write Tool Section Matching Uses Parser's Lenient Resolution
When a write tool accepts a `section` parameter (e.g., `brief_update_section`), the target section MUST be resolved using the same section alias map (PARSE-03) and case-insensitive matching (PARSE-02) as the read parser. Write target resolution and read section detection use identical matching logic.

### WRITE-16a: External Tool Session Breadcrumb Format (GAP-S15)
When `brief_capture_external_session` writes session metadata, it MUST append a one-line breadcrumb to an `## External Tool Sessions` subsection within the active BRIEF.md (created if absent). The exact format is:

```
- [session_date] [tool]: [n] decisions captured — [comma-separated decision titles]
```

Example: `- 2026-02-20 Ableton Live: 3 decisions captured — Key set to F minor, Tempo locked at 82 BPM, Reverb on bus`

This breadcrumb is written even when the captured decision list may be incomplete, providing a clear record that external work occurred on that date.

### WRITE-19: Content Structure Warning
If `brief_update_section` content contains `#` (H1) headings, return warning in response: "Content contains top-level heading(s) which may affect document structure." Do not block — preserve lenient write principle. (OQ-179)

### DEC-16: External Session Conflict Awareness
After `brief_capture_external_session` writes narrated decisions, auto-run conflict detection. If conflicts found, include in response: `"conflicts_detected": [...]`. AI can then ask user about supersession. (OQ-185)

## Test Specification

### Unit Tests (specific input → expected output)
- Update section by canonical name → content replaced in that section
- Update section by alias → resolved to canonical section and updated
- Update section with case-insensitive name → resolved and updated
- Update with append mode → new content appended to existing section content
- Update missing section → section created at canonical position
- Update with empty string content → section cleared (valid operation)
- Update with H1 heading in content → warning returned, write proceeds
- Capture external session with 3 decisions → all 3 written atomically
- Capture session → breadcrumb appended with date, tool name, count, titles
- Capture session when External Tool Sessions sub-section missing → sub-section created
- Capture session → conflict detection auto-runs, conflicts included in response
- Capture session with failed write → no partial decisions written (atomic)
- No active project → guard error
- Section name not matching any known section or alias → created as project-specific section
- Update section moving content with ontology tags → tags travel with their associated paragraphs

### Property Tests (invariants that hold for ALL inputs)
- forAll(section alias): write target resolution matches read parser's resolution
- forAll(external session): all decisions written or none (atomic)
- forAll(external session): breadcrumb always includes date, tool, count, and titles
- forAll(update operation): confirmation includes file path

## Tier 4 Criteria

Tier 4 criteria: JC-02, JC-07, JC-09
