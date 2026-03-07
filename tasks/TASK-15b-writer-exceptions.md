# TASK-15b: Writer — Exceptions, Amendments & Question Resolution

## Metadata
- Priority: 17
- Status: pending
- Dependencies: TASK-15a
- Module path: src/writer/
- Type stubs: src/types/writer.ts, src/types/decisions.ts
- Also read: src/types/parser.ts
- Test file: tests/writer/exceptions.test.ts
- Estimated context KB: 45

## What To Build

Build the remaining decision and question write operations: exception creation (annotating originals with HTML comments and linking new decisions), nested exceptions, in-place decision amendments, question resolution (checkbox marking and section movement), question-decision bidirectional linking, and intentional tension suppression entries. Also handles the `was_keep_open` warning and `suggest_decision` response flag.

## Implementation Guide

1. `src/writer/exceptions.ts` — exception and amendment write operations.

2. Exception write: when `exception_to` is provided, (a) find the original decision/constraint using normalized matching (same utility as T15a), (b) annotate the original with `<!-- brief:has-exception "{new title}" {date} -->` HTML comment, (c) add `EXCEPTION TO: {original title}` to the new decision. Both the original and new remain active.

3. Nested exceptions: an exception can reference another exception as its parent. No depth limit. Each references its parent via EXCEPTION TO.

4. Amendment write: when `amend` parameter is provided with a decision title, find the existing active decision and update specified fields in-place. The WHEN date is NOT changed — only the file's `**Updated:**` timestamp is refreshed.

5. Question resolution: (a) find the question using cascading match (exact → substring → fuzzy with Levenshtein ≤ 3), (b) mark checkbox `[x]`, (c) move the item from `## To Resolve` (or `## To Keep Open`) to `## Resolved` sub-section (create if absent), (d) return response with `resolution_summary` and `suggest_decision` flag.

6. `suggest_decision` logic: default `true` when the question had `options` or `impact` sub-fields, `false` otherwise. Include `was_keep_open: true` warning when resolving a To Keep Open question.

7. Bidirectional linking: when question resolution leads to a decision (separate user-confirmed step), add `RESOLVED FROM: [question text]` to the decision and `DECIDED AS: [decision title]` to the resolved question.

8. Intentional tension write: append entry to `## Intentional Tensions` sub-section within Key Decisions (create if absent). Format: `- [Item A title] vs. [Item B title]: intentional` with optional reason.

## Exported API

Export from `src/writer/exceptions.ts`:
- `addException(input: string, options: { title: string; why: string; exceptionTo: string }) → Promise<{ content: string; annotationAdded?: boolean }>`
  Original decision: annotated with `<!-- brief:has-exception ... -->` comment. New exception: has `EXCEPTION TO:` field. Both remain active (no strikethrough).
- `amendDecision(input: string, options: { title: string; why: string }) → Promise<{ content: string; whenDatePreserved?: boolean }>`
  Updates WHY field in-place. WHEN date unchanged. Updated timestamp refreshed.
- `resolveQuestion(input: string, options: { question: string; resolution: string }) → Promise<{ content: string; resolutionSummary: string; suggestDecision: boolean; wasKeepOpen: boolean }>`
  Moves to Resolved section, marks `[x]`. `suggestDecision: true` if question had Options/Impact. Does NOT auto-create a Key Decision.
- `addBidirectionalLink(input: string, options: { questionText: string; decisionTitle: string }) → Promise<{ content: string }>`
  Question gets `DECIDED AS:` field. Decision gets `RESOLVED FROM:` field.
- `addIntentionalTension(input: string, options: { itemA: string; itemB: string; reason?: string }) → Promise<{ content: string }>`
  Format: `- [itemA] vs. [itemB]: intentional`

## Rules

### DEC-02: Exceptions Annotate the Original
When `brief_add_decision` is called with `exception_to`, the original constraint/decision MUST be annotated with `<!-- brief:has-exception "{new title}" {date} -->`. Both items remain active.

### DEC-06: Question Resolution Flow
`brief_resolve_question` MUST: mark the question as resolved by checking its checkbox (`[x]`) and moving it to a `## Resolved` sub-section within `# Open Questions`. It MUST NOT automatically create a Key Decision entry — not every resolved question warrants a formal decision record.

After marking the question resolved, the server response MUST include a `resolution_summary` field and a `suggest_decision` flag (default: `true` when the question had `options` or `impact` fields, `false` otherwise). When `suggest_decision` is `true`, the AI SHOULD offer: "Want me to also add this as a Key Decision?" — but only if the user accepts.

This is a two-step process, not a compound automatic operation. The resolution is always recorded; the Key Decision is optional and user-confirmed.
- Use cascading match strategy: exact match first, then substring. If substring returns multiple results, return `user_error` listing all matches. If no match, try fuzzy matching (Levenshtein ≤ 3) and suggest. (OQ-215)

### DEC-07: Decision Amendment (In-Place Edit)
When a user wants to update the rationale, alternatives, or other fields of an existing active decision without superseding it, the server MUST support in-place editing of existing decisions. This is distinct from supersession (DEC-01), which replaces the decision entirely.

`brief_add_decision` SHOULD accept an `amend` parameter with the title of the existing decision to update. The writer updates the specified fields in-place. The `**Updated:**` timestamp of the BRIEF.md is refreshed but the decision's `WHEN` date remains unchanged.

### DEC-08: Question–Decision Bidirectional Link
When `brief_resolve_question` leads to a Key Decision (via user confirmation per DEC-06), the link between them MUST be bidirectional:
- The new decision SHOULD include `RESOLVED FROM: [question text]`
- The resolved question SHOULD include `DECIDED AS: [decision title]`

This enables tracing from a decision back to the question that prompted it, and from a resolved question forward to the resulting decision.

### DEC-12: Nested Exceptions Are Allowed
A decision MAY be an exception to another exception. Each exception references its parent via `EXCEPTION TO`. The chain is traversable: constraint → exception → exception-to-exception. There is no depth limit on exception nesting. `brief_check_conflicts` treats any decision with an `EXCEPTION TO` link as resolved — nested or not.

### DEC-16: External Session Conflict Awareness
After `brief_capture_external_session` writes narrated decisions, auto-run conflict detection. If conflicts found, include in response: `"conflicts_detected": [...]`. AI can then ask user about supersession. (OQ-185)

### WRITE-14: Write Tool Section Matching Uses Parser's Lenient Resolution
When a write tool accepts a `section` parameter (e.g., `brief_update_section`), the target section MUST be resolved using the same section alias map (PARSE-03) and case-insensitive matching (PARSE-02) as the read parser. Write target resolution and read section detection use identical matching logic.

## Test Specification

### Unit Tests (specific input → expected output)
- Exception to active decision → original annotated with HTML comment, new has EXCEPTION TO field, both remain active
- Exception to another exception (nested) → chain traversable through EXCEPTION TO links
- Amend an active decision's rationale → field updated in-place, WHEN date unchanged, file Updated timestamp refreshed
- Amend a non-existent decision → error with suggestion
- Resolve a To Resolve question → checkbox marked, item moved to Resolved sub-section
- Resolve a To Keep Open question → resolves with `was_keep_open` warning
- Resolve question that had Options and Impact sub-fields → response includes `suggest_decision: true`
- Resolve question with no sub-fields → response includes `suggest_decision: false`
- Resolution with exact match → resolves the correct question
- Resolution with substring match hitting multiple → error listing all matches
- Resolution with no match but fuzzy candidate within distance 3 → suggestion returned
- Bidirectional link after question-to-decision → decision has RESOLVED FROM, question has DECIDED AS
- Intentional tension entry written → appears in Intentional Tensions sub-section with correct format
- Intentional Tensions sub-section missing → created automatically on first tension write
- Write to section using alias → resolved via parser's lenient matching

### Property Tests (invariants that hold for ALL inputs)
- forAll(active decision): exception always leaves both original and new as active
- forAll(question text): resolution never throws, always returns resolution summary
- forAll(amendment fields): WHEN date never changes, Updated timestamp always refreshes
- forAll(nested exception depth): chain is always traversable without errors

## Tier 4 Criteria

Tier 4 criteria: JC-03, JC-10
