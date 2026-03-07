# TASK-54: Cross-Cutting — Integration Tests for Interaction Patterns

## Metadata
- Priority: 56
- Status: pending
- Dependencies: TASK-20, TASK-21, TASK-22, TASK-23, TASK-24, TASK-25, TASK-26, TASK-27, TASK-28, TASK-29, TASK-30, TASK-31, TASK-32a, TASK-33, TASK-34, TASK-35, TASK-36, TASK-37, TASK-38, TASK-39, TASK-40, TASK-41, TASK-42, TASK-43, TASK-44, TASK-46
- Module path: tests/integration/
- Type stubs: none
- Also read: src/types/parser.ts, src/types/writer.ts, src/types/ontology.ts, src/types/reference.ts, src/types/hierarchy.ts
- Test file: tests/integration/patterns.test.ts
- Estimated context KB: 45

## What To Build

Build end-to-end integration tests that validate the 8 documented interaction patterns from the spec, plus cross-cutting invariant tests. The interaction patterns test multi-tool flows where several tools are called in sequence to complete a user workflow. Cross-cutting tests verify: idempotency (all write tools called twice produce the same result), round-trip integrity (parse → write → parse produces identical structure), and consistent normalisation across all matching operations. Also includes test categories from TEST-01 through TEST-08: parser round-trip, lenient corpus, hierarchy walking, decision lifecycle, ontology search, write preservation, conflict detection, and the 8 documented interaction patterns. The integration tests validate all four progressive integration levels from Design Pattern 29: parser round-trip tests cover Level 1 (Read/Display), hierarchy tests cover Level 2 (Hierarchy-Aware), write preservation tests cover Level 3 (Write Support), and interaction pattern tests cover Level 4 (AI Integration).

## Implementation Guide

1. `tests/integration/patterns.test.ts` — interaction pattern integration tests.

2. Pattern 1 — Ontology matching flow: search for ontology entries → rank results → browse a specific entry → tag content with that entry. Verify the full chain from search to tag produces correct BRIEF.md output.

3. Pattern 2 — Reference suggestion flow: tag content with ontology entries → get reference suggestions for those tags → user selects references → record references in BRIEF.md. Verify suggestions exclude already-tagged entries and references are written correctly.

4. Pattern 3 — Reverse reference flow: add a reference → look it up in the reverse index → discover associated ontology tags. Verify the bidirectional flow works from reference to tags.

5. Pattern 4 — Type guide creation flow: query an unknown type → no match found (generic returned) → conversation produces guide content → create new type guide. Verify guide is created and future lookups resolve to it.

6. Pattern 5 — Extension scaffolding flow: get type guide → extract suggested extensions → present suggestions → create extension section. Verify the end-to-end flow from type to extension creation.

7. Pattern 6 — Unknown domain bootstrapping flow: generic/adaptive type guide returned → bootstrap suggestions generated → extensions created → type guide created for the new domain. Verify the full bootstrapping flow.

8. Pattern 7 — Open questions surfacing flow: create open questions during active work → questions tracked → questions surfaced at re-entry. Verify questions persist and appear in re-entry summary.

9. Pattern 8 — Planning session flow: get context + get open questions + check conflicts → produces a comprehensive summary for planning. Verify all three tools produce coherent combined output.

10. `tests/integration/invariants.test.ts` — cross-cutting invariant tests.

11. Idempotency tests: call each write tool twice with identical input. Verify second call produces no changes or returns an "already exists" flag.

12. Round-trip tests: parse a BRIEF.md → write it back → parse again → assert identical structure.

13. Normalisation consistency: verify that search/lookup inputs containing Unicode zero-width characters or bidi overrides produce identical results to their normalized equivalents — confirmed across section lookup, ontology search, and reference lookup operations.

## Exported API

No new module exports. This task verifies cross-module integration patterns. Tests import from existing modules and verify end-to-end workflows (parse → write → re-parse roundtrip, context read → decision write → conflict check, etc.).

## Rules

### TEST-01: Parser Round-Trip Tests
Every parser feature MUST have a round-trip test: parse a BRIEF.md → write it back → parse again → assert identical parsed output.

### TEST-02: Lenient Parser Corpus
Maintain a corpus of intentionally messy BRIEF.md files (wrong case, wrong heading levels, mixed metadata formats, unusual section names) and verify they all parse without errors.

### TEST-03: Hierarchy Walker Tests
Test hierarchy walking with:
- Single-level (project root only)
- Two-level (album → song)
- Three-level (artist → album → song)
- Four-level (artist → album → song → music-video)
- Missing BRIEF.md at intermediate levels
- Workspace root boundary

### TEST-04: Decision Lifecycle Tests
Test all three evolution types:
- Supersession: old marked, new linked, chain is traversable
- Exception: both active, original annotated, exception linked
- Override: parent constraint + child contradiction flagged

### TEST-05: Ontology Search Tests
Test with:
- Direct keyword match
- Synonym-expanded match
- Alias match
- Label match
- No match (verify signal returned, not error)
- Multi-term queries
- Field priority ordering

### TEST-06: Write Preservation Tests
After any write operation, verify:
- Untouched sections are byte-for-byte identical
- HTML comments are preserved
- Unknown sections are preserved
- Newline style is consistent

### TEST-07: Conflict Detection Tests
Test with:
- Two clearly conflicting active decisions (should be flagged)
- Two active decisions with exception link (should NOT be flagged)
- Superseded + replacement pair (should NOT be flagged)
- Parent constraint + child override (should be flagged)

### TEST-08: Integration Tests for Interaction Patterns
Test the eight documented interaction patterns end-to-end:
1. Ontology matching flow (search → rank → browse → tag)
2. Reference suggestion flow (tags → references → user selection → record)
3. Reverse reference flow (reference → lookup → tags)
4. Type guide creation flow (unknown type → conversation → guide)
5. Extension scaffolding flow (type → guide → suggest → create)
6. Unknown domain bootstrapping flow (generic type → bootstrap suggestions → extensions created → type guide created)
7. Open questions surfacing flow (questions created → tracked → surfaced at re-entry)
8. Planning session flow (get context + get open questions + check conflicts → comprehensive summary)

## Test Specification

### Unit Tests (specific input → expected output)
- Ontology matching flow end-to-end → search results tagged in BRIEF.md
- Reference suggestion flow → references recorded with correct deduplication
- Reverse reference flow → ontology tags discovered from reference
- Type guide creation flow → new guide created and resolvable
- Extension scaffolding flow → extension section created from type guide suggestion
- Unknown domain bootstrapping → full adaptive flow produces working project
- Open questions surfacing → questions appear in re-entry summary
- Planning session flow → combined context + questions + conflicts output
- Write tool called twice → idempotent (no duplicate content)
- Parse → write → parse round-trip → identical structure
- Lenient corpus file → parsed without errors
- Hierarchy walk at all depth levels → correct context assembled
- Decision supersession lifecycle → chain traversable
- Decision exception lifecycle → both active, linked correctly
- Write operation → untouched sections byte-for-byte identical
- Conflict detection → conflicting decisions flagged, exceptions excluded

### Property Tests (invariants that hold for ALL inputs)
- forAll(write tool, same input twice): result is idempotent
- forAll(BRIEF.md): parse → write → parse produces identical structure
- forAll(lenient corpus file): parser never throws
- forAll(write operation): untouched content preserved byte-for-byte

## Tier 4 Criteria

Tier 4 criteria: none
