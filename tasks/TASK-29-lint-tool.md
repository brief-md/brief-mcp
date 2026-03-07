# TASK-29: Validation — Lint Tool

## Metadata
- Priority: 31
- Status: pending
- Dependencies: TASK-09, TASK-10, TASK-11, TASK-12, TASK-13, TASK-08, TASK-30
- Module path: src/validation/
- Type stubs: src/types/validation.ts
- Also read: src/types/parser.ts
- Test file: tests/validation/lint.test.ts
- Estimated context KB: 45

## What To Build

Implement the `brief_lint` MCP tool — a comprehensive two-tier validation system for BRIEF.md files. The first tier checks for "valid" (minimum viable: required metadata + at least one core section). The second tier checks for "well-formed" (all five core sections, consistent headings, four-part structure). Each finding has a severity (error, warning, info). The lint tool also performs logical consistency checks (dangling references, invalid dates, orphaned tags), style checks (CRLF, file size, non-canonical formatting), and orphaned reference detection. The tool is strictly read-only — it never modifies files.

## Implementation Guide

1. `src/validation/index.ts` — barrel re-exporting public API.

2. `src/validation/lint.ts` — lint engine.

3. Parse the target BRIEF.md using the full parser pipeline (T09-T13). Collect findings as an array of { severity, code, message, line?, section? } objects.

4. Error-level checks (fails "valid"): missing Project metadata field, missing Type metadata field, missing Created metadata field, zero core sections present.

5. Warning-level checks (fails "well-formed"): missing recommended core sections (any of the five absent), inconsistent heading levels (mix of H1 and H2 for sections), decision conflicts (delegate to T30's conflict detection), logical consistency: REPLACES pointing to non-existent decision, EXCEPTION TO pointing to non-existent constraint, SUPERSEDED BY mismatches, ontology tags referencing uninstalled packs, invalid dates in WHEN fields.

6. Info-level checks (style): CRLF line endings detected, file size > 1000 lines, non-canonical formatting (plain text metadata instead of bold), Setext headings detected, H5/H6 within Key Decisions, duplicate active decision titles, orphaned references (ref-link pointing to untagged entry), non-conformant extension names (not matching [A-Z0-9 ]+), double-dash in HTML comments, unrecognised brief: comment types, available bundled guide notification, pack names in the `Ontologies` metadata field that do not conform to `[a-z0-9][a-z0-9-]*` (PARSE-23 format) — warning-level. Reference PARSE-23.

7. Return structured lint response with total counts per severity and the full findings list. Never modify the file.

## Exported API

Export from `src/validation/lint.ts`:
- `lintBrief(content: string, options?: { installedPacks?: string[]; checkBundledGuides?: boolean }) → { findings: LintFinding[]; errorCount: number; warningCount: number; infoCount: number; filesModified: number; readOnly: boolean }`
  `findings` use: `severity` (`'error'`|`'warning'`|`'info'`), `message`, `code?`, `fields?`.
  `filesModified` always `0`. `readOnly` always `true`. Error-severity: required metadata/sections. Warning: completeness/format. Info: style suggestions.

## Rules

### VALID-01: Valid BRIEF.md Criteria
A **valid** BRIEF.md requires:
- Three required metadata fields: `Project`, `Type`, `Created`
- At least one core section (What This Is, What This Is NOT, Why This Exists, Key Decisions, or Open Questions)

### VALID-02: Well-Formed BRIEF.md Criteria
A **well-formed** BRIEF.md additionally requires:
- All five core sections present
- Consistent heading levels
- Four-part structure: metadata → core → extensions → project-specific

### VALID-03: Lint Severity Mapping
`brief_lint` MUST map the two-tier validation model to its severity levels:
- **Error**: file fails "valid" criteria (missing Project, Type, or Created; zero core sections)
- **Warning**: file fails "well-formed" criteria (missing recommended core sections; inconsistent heading levels)
- **Info**: non-standard formatting, style suggestions, CRLF line endings

### VALID-04: File Size Warning
`brief_lint` SHOULD warn when a BRIEF.md file exceeds 1000 lines. Per IMPLEMENTATION_GUIDE.md (lines 390-394), typical BRIEF.md files are 100-500 lines. Files exceeding 1000 lines suggest the content should be split (e.g., into sub-projects with their own BRIEF.md files) or that excessive detail is being stored in the BRIEF.md rather than in external documents.

This is an info-level lint finding, not a blocking error — large files are valid, just unwieldy.

### VALID-05: Orphaned Reference Detection
`brief_lint` MUST check for references whose `<!-- brief:ref-link -->` comments point to ontology tags that are no longer present in the file. These orphaned references are reported as info-level findings: "Reference [title] links to ontology entry [pack:id] which is no longer tagged in this file." The reference itself is valid — only the ontology link is orphaned.

### VALID-06: Available Bundled Guide Notification
`brief_lint` SHOULD report an info-level finding when a bundled type guide exists for a type that has an installed guide with `source: ai_generated` or `source: community`. The finding suggests the user compare guides: "A bundled [type] guide is now available and may have richer guidance than your [source] guide. Run `brief_upgrade_type_guide [type]` to compare."

### VALID-07: Logical Consistency Lint Pass
`brief_lint` includes a cross-reference check: `REPLACES` pointing to non-existent decisions, `EXCEPTION TO` pointing to non-existent constraints, `SUPERSEDED BY` mismatches, ontology tags referencing uninstalled packs, invalid dates. All at warning level. (OQ-186)

## Test Specification

### Unit Tests (specific input → expected output)
- File missing Project metadata → error-level finding
- File missing Type metadata → error-level finding
- File missing Created metadata → error-level finding
- File with zero core sections → error-level finding
- File with all required metadata and one core section → passes "valid" tier
- File missing two core sections → warning-level findings for each
- File with inconsistent heading levels → warning-level finding
- File with REPLACES pointing to non-existent decision → warning-level finding
- File with orphaned ontology tag → warning-level finding
- File with CRLF line endings → info-level finding
- File exceeding 1000 lines → info-level finding
- File with duplicate active decision titles → info-level finding
- File with orphaned ref-link → info-level finding about orphaned ontology link
- Ontologies field containing pack name with uppercase letters → warning-level finding (non-conformant format)
- Well-formed file (all sections, consistent headings, correct order) → no findings
- Lint operation → never modifies the file
- Response → structured with severity counts and findings list

### Property Tests (invariants that hold for ALL inputs)
- forAll(BRIEF.md): lint never throws, always returns structured response
- forAll(BRIEF.md): lint never modifies the file
- forAll(finding): severity is always one of error, warning, info
- forAll(valid file): no error-level findings

## Tier 4 Criteria

Tier 4 criteria: JC-02, JC-05, JC-07, JC-09
