# TASK-26: Context Write — Decisions

## Metadata
- Priority: 28
- Status: pending
- Dependencies: TASK-15a, TASK-15b, TASK-08, TASK-30
- Module path: src/context/
- Type stubs: src/types/context.ts
- Also read: src/types/writer.ts, src/types/decisions.ts
- Test file: tests/context/write-decisions.test.ts
- Estimated context KB: 40

## What To Build

Implement the `brief_add_decision` MCP tool handler. This is the tool-layer interface that validates inputs, delegates to the writer module (T15a/T15b) for the actual decision lifecycle operations (new decision, supersession, exception, amendment), and formats responses. It enforces mutual exclusion between parameters, validates decision fields, runs the `requireActiveProject()` guard, and auto-triggers conflict detection after external session captures.

## Implementation Guide

1. `src/context/write-decisions.ts` — decision tool handler.

2. Register `brief_add_decision` tool handler with the MCP server. Accept parameters: `title` (required), `why` (recommended), `alternatives` (optional), `date` (optional, defaults to today), `replaces` (optional), `exception_to` (optional), `amend` (optional).

3. Input validation: (a) validate `title` is non-empty, 1-500 chars, (b) if `date` provided, validate ISO 8601 format, (c) mutual exclusion: `replaces` and `exception_to` cannot both be provided — return clear error listing the conflict, (d) `amend` is mutually exclusive with `replaces` and `exception_to`.

4. Routing: if `replaces` → delegate to T15a's supersession flow. If `exception_to` → delegate to T15b's exception flow. If `amend` → delegate to T15b's amendment flow. Otherwise → delegate to T15a's new decision flow.

5. After any write: if the write was part of an external session capture (DEC-16), auto-run conflict detection (T30) and include any detected conflicts in the response.

6. Response: return confirmation of what was written, file path, and any warnings or conflicts.

## Exported API

Export from `src/context/write-decisions.ts`:
- `handleAddDecision(options: { title: string; why: string; replaces?: string; exception_to?: string; amend?: boolean; when?: string; date?: string; afterExternalSession?: boolean; _noActiveProject?: boolean }) → { success: boolean; content: Array<{ type: 'text'; text: string }>; filePath?: string; whenDate?: string; previousDecisionUpdated?: boolean; supersededByAnnotation?: boolean; annotationAdded?: boolean; annotation?: string; whenDatePreserved?: boolean; originalWhenDate?: string; conflictsDetected?: boolean; suggestion?: string; isError?: boolean }`
  Mutual exclusions: `replaces` & `exception_to`, `replaces` & `amend`, `amend` & `exception_to`. Title max 500, why max 5000, date YYYY-MM-DD.

## Rules

### DEC-01: Supersession Creates Bidirectional Links
When `brief_add_decision` is called with `replaces`, BOTH the old and new decisions must be updated:
- Old: add strikethrough, "(superseded)", `SUPERSEDED BY: {new title} ({date})`
- New: add `REPLACES: {old title}`

### DEC-02: Exceptions Annotate the Original
When `brief_add_decision` is called with `exception_to`, the original constraint/decision MUST be annotated with `<!-- brief:has-exception "{new title}" {date} -->`. Both items remain active.

### DEC-07: Decision Amendment (In-Place Edit)
When a user wants to update the rationale, alternatives, or other fields of an existing active decision without superseding it (e.g., "I want to add another alternative I considered"), the server MUST support in-place editing of existing decisions. This is distinct from supersession (DEC-01), which replaces the decision entirely.

`brief_add_decision` SHOULD accept an `amend` parameter with the title of the existing decision to update. The writer updates the specified fields in-place. The `**Updated:**` timestamp of the BRIEF.md is refreshed but the decision's `WHEN` date remains unchanged.

### DEC-16: External Session Conflict Awareness
After `brief_capture_external_session` writes narrated decisions, auto-run conflict detection. If conflicts found, include in response: `"conflicts_detected": [...]`. AI can then ask user about supersession. (OQ-185)

### MCP-03: Input Validation
All tool inputs MUST be validated against their schema before execution. Invalid inputs return a structured error, not a crash. Validate empty/whitespace-only strings: for required parameters (title, query, path, name), treat empty or whitespace-only strings as missing and return `user_error`. For `brief_update_section(content: "")`, empty string is valid (means "clear section"). Centralise in `validateRequiredString()`. Validate parameter length limits: titles/names 500 chars, section content 100KB, search queries 1000 chars, labels 200 chars, paths 4096 chars. Configurable via config.json. Check mutually exclusive parameters: `replaces` and `exception_to` cannot both be provided. `direction` without `entry_id` is invalid. Return clear `user_error` listing the conflict. Decision field validation: `title` required, 1-500 chars. `why` recommended but not required. `date` defaults to today if missing, rejected if present but not parseable.

## Test Specification

### Unit Tests (specific input → expected output)
- New decision with title and rationale → decision written, confirmation returned with file path
- Decision with replaces → supersession flow triggered, old and new both updated
- Decision with exception_to → exception flow triggered, original annotated, both active
- Decision with amend → in-place update, WHEN date unchanged
- Both replaces and exception_to provided → mutual exclusion error
- Both amend and replaces provided → mutual exclusion error
- Empty title → validation error
- Title exceeding 500 characters → validation error
- Invalid date format → validation error
- Date omitted → defaults to current date
- Replaces referencing non-existent decision → error with suggestion
- Decision after external session capture → conflict detection auto-triggered
- No active project set → requireActiveProject guard error
- Whitespace-only title → treated as missing, validation error

### Property Tests (invariants that hold for ALL inputs)
- forAll(decision parameters): handler never throws, always returns structured response
- forAll(title string): empty or whitespace-only always rejected
- forAll(mutually exclusive params): conflict always detected and reported
- forAll(write operation): confirmation includes file path

## Tier 4 Criteria

Tier 4 criteria: JC-02, JC-06, JC-07, JC-09
