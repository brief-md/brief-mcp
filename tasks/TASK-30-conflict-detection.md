# TASK-30: Validation — Conflict Detection

## Metadata
- Priority: 32
- Status: pending
- Dependencies: TASK-11, TASK-18, TASK-08
- Module path: src/validation/
- Type stubs: src/types/validation.ts
- Also read: src/types/parser.ts, src/types/hierarchy.ts
- Test file: tests/validation/conflicts.test.ts
- Estimated context KB: 40

## What To Build

Implement the `brief_check_conflicts` MCP tool — a heuristic cross-section conflict detection engine. It finds potential contradictions between active decisions, between decisions and constraints, and across sections. It supports hierarchy-level detection (child decisions vs parent constraints). Superseded decisions and exceptions with EXCEPTION TO links are excluded. Intentional tensions are suppressed. Each conflict includes resolution guidance. The v1 implementation uses keyword overlap and negation detection (not semantic AI analysis).

## Implementation Guide

1. `src/validation/conflicts.ts` — conflict detection engine.

2. Register `brief_check_conflicts` tool handler. Accept optional `include_hierarchy` parameter (default true — hierarchy checking enabled by default).

3. Pairwise conflict detection — compare these pairs:
   - Active decisions vs active decisions (within Key Decisions)
   - Active decisions vs constraints (What This Is NOT)
   - Constraints vs constraints within What This Is NOT — if two constraints have overlapping or contradictory language, list both. Apply the same disambiguation logic used for duplicate decision titles (DEC-13). Reference OQ-213.
   - Cross-section semantic conflicts (e.g., genre in What This Is contradicting content in an extension section)
   - When `include_hierarchy` is true: child active decisions vs parent active decisions/constraints

4. Exclusions: skip superseded decisions (resolved history). Skip decisions with an `EXCEPTION TO` link (the link IS the resolution). Skip pairs listed in `## Intentional Tensions` sub-section.

5. v1 detection algorithm: keyword overlap with negation detection. Extract significant keywords from each item. Compare pairwise for contradictory signals (e.g., one says "minimal" and another says "complex"). Err on the side of over-reporting (false positives acceptable, false negatives are bugs).

6. Severity: same-level conflicts = WARNING, parent-child hierarchy overrides = INFO.

7. Resolution guidance: each conflict includes specific options: (a) supersede one decision, (b) create exception linking them, (c) update What This Is NOT, (d) dismiss as intentional tension — when the user selects this option, write a one-line suppression entry to the `## Intentional Tensions` sub-section within `# Key Decisions` (create the sub-section if absent). Format: `- [Item A title] vs. [Item B title]: intentional` (with optional reason appended). Future conflict detection runs MUST skip any pair already listed in `## Intentional Tensions`. Reference DEC-09.

8. Conflict detection is never automatic — `brief_get_context` does NOT trigger it. However, the conflict detection engine IS called by three other tools: `brief_lint` (TASK-29) runs it as part of its checks; `brief_reenter_project` (TASK-23) runs it to surface conflicts at session re-entry; and `brief_capture_external_session` (TASK-28) auto-runs it after writing narrated decisions (per DEC-16). Design the conflict engine as a callable module so these callers can invoke it directly.

## Exported API

Export from `src/validation/conflicts.ts`:
- `checkConflicts(params: { decisions: Array<{ text: string; status: string; section?: string; exceptionTo?: string }>; constraints: string[]; includeHierarchy?: boolean; hierarchyOverride?: boolean; intentionalTensions?: Array<{ itemA: string; itemB: string }> }) → { conflicts: Array<{ type?: string; source?: string; severity: string; items: Array<{ text: string; status: string }>; resolutionOptions: string[] }>; hierarchyIncluded?: boolean; filesModified: number }`
  Resolution options always: `['supersede', 'exception', 'update', 'dismiss']`. `filesModified` always `0`.
  Intentional tensions suppress known conflicts. `hierarchyOverride` includes hierarchy-sourced conflicts with `source: 'hierarchy'`.

## Rules

### DEC-04: Conflict Detection Is Heuristic and Cross-Section
`brief_check_conflicts` uses heuristic matching to find potential contradictions across the full BRIEF.md, not only within a single section. It MUST err on the side of over-reporting (false positives acceptable, false negatives are bugs). Conflicts are surfaced as suggestions, never as errors that block operations.

Conflict detection scope:
- Active decisions vs. active decisions (within Key Decisions)
- Active decisions vs. What This Is NOT
- Cross-section semantic conflicts (e.g., genre or audience described in "What This Is" contradicting content in a domain extension)
- Hierarchy overrides (child active decisions vs. parent active decisions/constraints)

Explicitly excluded from detection:
- Superseded decisions (resolved history)
- Exception decisions with an `EXCEPTION TO` link (the link IS the resolution)

### DEC-09: Conflict Resolution Guidance
When `brief_check_conflicts` surfaces a conflict, the AI MUST offer specific resolution options to the user:
1. **Supersede** one of the conflicting decisions (creates a new decision via DEC-01)
2. **Create an exception** linking the two (via DEC-02)
3. **Update "What This Is NOT"** to remove the contradiction
4. **Dismiss as intentional tension** — writes a suppression entry to a `## Intentional Tensions` subsection within `# Key Decisions`. Format: `- [Item A title] vs. [Item B title]: intentional` (with optional reason). `brief_check_conflicts` MUST skip any pair already listed in `## Intentional Tensions` — the conflict will NOT be re-flagged in future calls.

The user chooses the resolution path; the AI executes the appropriate tool calls. The AI MUST NOT resolve conflicts autonomously — all conflict resolution requires explicit user direction.

**Conflict detection is NEVER automatic.** `brief_check_conflicts` runs only when called explicitly. `brief_get_context` does NOT trigger conflict detection. The AI SHOULD suggest running `brief_check_conflicts` after the user makes significant decision or constraint changes.

### DEC-16: External Session Conflict Awareness
After `brief_capture_external_session` writes narrated decisions, auto-run conflict detection. If conflicts found, include in response: `"conflicts_detected": [...]`. AI can then ask user about supersession. (OQ-185)

## Test Specification

### Unit Tests (specific input → expected output)
- Two contradictory active decisions → conflict detected with both titles
- Active decision contradicting a constraint → conflict detected
- Cross-section contradiction (What This Is vs extension) → conflict detected
- Superseded decision → excluded from detection
- Decision with EXCEPTION TO link → excluded from detection
- Pair listed in Intentional Tensions → not re-flagged
- Each conflict → includes resolution options (supersede, exception, update, dismiss)
- Same-level conflict → WARNING severity
- Parent-child hierarchy override → INFO severity
- include_hierarchy enabled → child vs parent conflicts detected
- include_hierarchy disabled → only single-file conflicts
- Two constraints in What This Is NOT with overlapping language → conflict detected listing both
- No conflicts found → empty result, not an error
- Conflict detection → never modifies files
- Conflict detection → never runs automatically from get_context

### Property Tests (invariants that hold for ALL inputs)
- forAll(conflict): resolution guidance always includes all four options
- forAll(superseded decision): never appears in conflict results
- forAll(exception decision): never appears in conflict results
- forAll(intentional tension pair): never re-flagged in subsequent checks

## Tier 4 Criteria

Tier 4 criteria: JC-02, JC-07, JC-09
