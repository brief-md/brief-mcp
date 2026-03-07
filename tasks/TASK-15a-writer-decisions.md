# TASK-15a: Writer — Decision Writing & Supersession

## Metadata
- Priority: 16
- Status: pending
- Dependencies: TASK-14, TASK-11
- Module path: src/writer/
- Type stubs: src/types/writer.ts, src/types/decisions.ts
- Also read: src/types/parser.ts
- Test file: tests/writer/decisions.test.ts
- Estimated context KB: 45

## What To Build

Build the decision writing subsystem within the writer module. This handles creating new decisions in full format (WHAT, WHY, WHEN, ALTERNATIVES CONSIDERED), supersession chains (marking old decisions and linking new ones), and decision field validation. Supersession must handle both minimal-format and full-format existing decisions, detect circular chains, enforce single-file scope, and prevent superseding already-superseded decisions.

## Implementation Guide

1. `src/writer/decisions.ts` — decision write operations.

2. New decision writing: accept decision fields (title, rationale, alternatives, date). Format as a new H3 entry under `## Key Decisions` using full format with WHAT, WHY, WHEN, ALTERNATIVES CONSIDERED fields. Use the core write engine (T14) for the actual file modification.

3. Supersession: when a `replaces` parameter is provided, (a) find the target decision by title using normalized matching, (b) verify target is active (not already superseded), (c) mark the old decision with strikethrough on heading, "(superseded)" label, and `SUPERSEDED BY: {new title} ({date})` field, (d) add `REPLACES: {old title}` to the new decision, (e) write both changes atomically.

4. Minimal-format supersession: when superseding a minimal-format decision, add the SUPERSEDED BY field and strikethrough WITHOUT restructuring the decision body into full format. The result is a hybrid (minimal body + lifecycle field).

5. Title matching: use a centralized `normalizeForMatching()` utility that strips markdown formatting, zero-width Unicode characters, and applies case-insensitive comparison. If multiple decisions match, return an error listing all matches with disambiguation info.

6. Circular chain detection: maintain a visited-titles set during chain traversal. On cycle, break the loop, log a warning, and produce a lint-level finding.

7. Validation: `title` required, 1-500 characters, whitespace-stripped; `why` optional, max 5000 chars; `date` optional, ISO 8601 YYYY-MM-DD format, defaults to today if absent; `alternatives` optional array, each element max 500 chars; `replaces` must match exactly one active decision. Reference MCP-03 and OQ-162.

8. Duplicate detection: before writing a new decision, check if an active decision with the same normalized title already exists. Warn but do not block.

9. **Amendment flow (DEC-07):** Support an `amend` parameter on `brief_add_decision`. When `amend` is provided (targeting an existing active decision title), update the decision's rationale (`WHY` field) and/or `ALTERNATIVES CONSIDERED` in-place without creating a supersession chain. Preserve the original `WHEN` date — do not change it. Update the file's `Updated` metadata timestamp. The amended decision remains active. Use the same normalized title matching as step 5 for target resolution. Reference DEC-07.

## Exported API

Export from `src/writer/decisions.ts`:
- `addDecision(input: string, options: { title: string; why: string; when?: string; alternatives?: string[] }) → Promise<{ content: string; warnings: string[] }>`
  Writes WHAT/WHY/WHEN/ALTERNATIVES CONSIDERED fields. Date format: YYYY-MM-DD.
- `supersedeDecision(input: string, options: { title: string; why: string; replaces: string; sourceFile?: string }) → Promise<{ content: string }>`
  Old decision: strikethrough + `(superseded)` + `SUPERSEDED BY:` field. New decision: `REPLACES:` field.
  Error patterns: already superseded → `/already superseded/i` (includes current active head title), multiple matches → `/multiple|disambig/i`, no match → `/not found|no match/i`, scope → `/not found|single.file|scope/i`
- `detectCircularChain(decisions: Array<{ title: string; supersededBy?: string }>) → { hasCycle: boolean; involvedTitles: string[] }`
- `validateDecisionFields(options: { title: string; when?: string; why?: string; alternatives?: string[] }) → void`
  Throws: title >500 chars → `/title|limit|500/i`, bad date → `/date|format|YYYY/i`, why >5000 → `/why|5000|length/i`, alt >500 each → `/alternatives|500|length/i`
- `normalizeTitleForMatch(title: string) → string` — normalizes for fuzzy matching

## Rules

### DEC-01: Supersession Creates Bidirectional Links
When `brief_add_decision` is called with `replaces`, BOTH the old and new decisions must be updated:
- Old: add strikethrough, "(superseded)", `SUPERSEDED BY: {new title} ({date})`
- New: add `REPLACES: {old title}`

### DEC-03: Default View Is Active Only
`brief_get_context` and `brief_get_decisions` MUST return only active (non-superseded) decisions by default. Superseded decisions are only included when `include_superseded=true`.

### DEC-05: Date Format
All decision dates MUST use `YYYY-MM-DD` format. The `WHEN` field is set to the current date when a decision is recorded. Dates use the server's local timezone. No timezone offset or timezone identifier is stored — dates are for human reference and chronological ordering, not for precise timestamp comparison.

### DEC-10: No Supersession Chain Limit
Supersession chains have no maximum length. A decision may be superseded any number of times. `brief_get_decisions` with `include_superseded=true` returns the full chain. The default view (DEC-03) shows only the head (active decision).

### DEC-11: Only Active Decisions Can Be Superseded
`brief_add_decision` with `replaces` MUST only target an active (non-superseded) decision. Attempting to supersede an already-superseded decision MUST return an error: "Decision '[title]' is already superseded by '[current active title]'. Supersede the current active decision instead." To change direction, the user supersedes the head of the chain.

### DEC-13: Decision Title Matching
When `replaces` or `exception_to` is provided as a string, the server MUST match it against existing decision headings using case-insensitive substring matching. The heading text is stripped of markdown formatting (remove `###`, `**`, `~~`) before matching. If multiple decisions match, the server MUST return an error listing all matches and require disambiguation.
- Strip all zero-width Unicode characters (U+200B, U+200C, U+200D, U+FEFF, U+2060) from both strings before matching. Use a centralised `normalizeForMatching(str)` utility for all string matching: decision titles, section names, constraint titles, question matching. (OQ-238)
- When multiple constraints share a title, require disambiguation via scope. Return `user_error` listing matches with their sections and line numbers. (OQ-213)
- If `replaces` matches multiple active decisions with identical titles, return `user_error` listing all matches with dates and line numbers. The server must never silently pick one. `brief_lint` warns about duplicate active decision titles. (OQ-160)

### DEC-14: Supersession Is Single-File Only
`brief_add_decision` with `replaces` or `exception_to` MUST only reference decisions within the same BRIEF.md file. Cross-file supersession (a child decision superseding a parent's decision) is not supported. Cross-hierarchy contradictions are handled by the hierarchy override pattern (HIER-05, HIER-06) — the context formatter flags them, but no linking occurs between files.

### DEC-15: Circular Supersession Chain Detection
Track visited decision IDs during chain traversal. On cycle detection, break loop, log warning, include lint finding: "Circular supersession chain detected involving: [titles]." Return results up to cycle point. Same visited-set pattern as HIER-15. (OQ-161)

### WRITE-13: Superseding Minimal-Format Decisions
When superseding a decision written in the minimal format (heading + paragraph, no structured fields), the writer MUST add `SUPERSEDED BY: {new title} ({date})` and strikethrough formatting WITHOUT restructuring the existing decision into full format. The result is a hybrid (minimal body + lifecycle field), which is readable and parseable. The writer MUST NOT convert minimal-format decisions to full format during supersession.

## Test Specification

### Unit Tests (specific input → expected output)
- New decision with all fields → appears under Key Decisions with WHAT, WHY, WHEN, ALTERNATIVES CONSIDERED
- Decision date → always YYYY-MM-DD format using local timezone
- Supersede an active decision → old decision has strikethrough, "(superseded)" label, SUPERSEDED BY field; new has REPLACES field
- Supersede a minimal-format decision → lifecycle field added without restructuring body to full format
- Attempt to supersede an already-superseded decision → error naming the current active head
- Replaces parameter matching multiple decisions → error listing all matches with disambiguation info
- Replaces parameter matching no decisions → error with suggestion
- Title with markdown formatting and zero-width characters → matching still succeeds after normalization
- Title exceeding 500 characters → validation error
- Date in non-ISO format → validation error
- Supersession targeting decision in a different file → error indicating single-file scope
- Chain of three supersessions → all links correct, only latest is active
- Circular supersession chain detected → warning with involved titles, results returned up to cycle
- New decision with same title as existing active → warning about duplicate title
- Decision with REPLACES referencing exact title → bidirectional links created

### Property Tests (invariants that hold for ALL inputs)
- forAll(decision title, rationale): new decision always parseable after write
- forAll(supersession pair): old decision always marked with all three indicators (strikethrough, label, field)
- forAll(valid date string): WHEN field always in YYYY-MM-DD format
- forAll(active decision): supersession produces exactly one new active head
- forAll(title with mixed formatting): matched decision title is identical regardless of Unicode zero-width chars or markdown formatting variation

## Tier 4 Criteria

Tier 4 criteria: JC-03, JC-10
