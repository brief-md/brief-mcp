# TASK-11: Parser — Decisions & Questions

## Metadata
- Priority: 12
- Status: pending
- Dependencies: TASK-10
- Module path: src/parser/decisions.ts
- Type stubs: src/types/parser.ts
- Also read: none
- Test file: tests/parser/decisions.test.ts
- Estimated context KB: 45

## What To Build

Build a parser module that extracts Key Decisions and Open Questions from BRIEF.md into normalized data structures. Decisions support two formats: minimal (heading IS the decision, paragraph is rationale) and full (structured WHAT/WHY/WHEN/ALTERNATIVES CONSIDERED fields). The module detects superseded decisions through three indicators, assigns statuses (active/superseded/exception), and parses Open Questions across sub-sections (To Resolve, To Keep Open, Resolved, Intentional Tensions, External Tool Sessions) with structured sub-field extraction.

## Implementation Guide

1. `src/parser/decisions.ts` — accepts pre-parsed section content from T10. Returns structured decision and question collections.

2. **Minimal format:** Heading text under `# Key Decisions` with no structured field markers in body → heading = decision text, first paragraph = rationale.

3. **Full format:** Scan body for field markers (`WHAT:`, `WHY:`, `WHEN:`, `ALTERNATIVES CONSIDERED:`, `REPLACES:`, `EXCEPTION TO:`, `SUPERSEDED BY:`, `RESOLVED FROM:`). Extract each value up to next marker or end of body. Detect format by presence of any marker.

4. **Superseded detection:** Three independent indicators — `~~strikethrough~~` on heading, `(superseded)` in heading text, `SUPERSEDED BY:` field. Any one is sufficient. Status: `superseded` if any indicator, `exception` if `EXCEPTION TO:` field present, `active` otherwise. Superseded takes precedence over exception.

5. **To Resolve parsing:** Checkbox format (`- [ ]`/`- [x]`). Extract text, checked state, and optional `**Options:**` (split on `/`, trim each) and `**Impact:**` (single prose string) sub-fields.

6. **To Keep Open:** Plain list items, no checkbox. **Resolved/Intentional Tensions/External Tool Sessions:** Parse as structured entries within the Open Questions section.

7. Both formats produce identical normalized output shapes. Trim all extracted text values.

## Exported API

Export from `src/parser/decisions.ts`:
- `parseDecisions(content: string) → Decision[]`
  Each Decision: `{ text, status, rationale?, format ('minimal'|'full'), what?, why?, when?, alternativesConsidered? (string[]), replaces?, exceptionTo?, supersededBy? }`.
  Minimal format: `### Title\nRationale...`. Full format: `### Title\nWHAT: ...\nWHY: ...\nWHEN: ...\nALTERNATIVES CONSIDERED: ...`.
  Superseded: `### ~~Title (superseded)~~\nSUPERSEDED BY: ...`. Exception: `EXCEPTION TO: ...`.
- `parseQuestions(content: string) → { toResolve: Question[]; toKeepOpen: Question[]; resolved: Question[] }`
  Groups questions by `## To Resolve`, `## To Keep Open`, `## Resolved` sub-sections. `- [ ]` = unchecked, `- [x]` = checked.
- `detectSupersessionStatus(decisions: Decision[]) → void` — annotates status on decision array
- `parseToResolveItem(item: string) → { text: string; checked: boolean; options?: string[]; impact?: string }`
  Parses `- [ ] Question **Options:** A / B / C` and `**Impact:** ...` inline fields

## Rules

### PARSE-08: Superseded Decision Detection
The parser MUST detect superseded decisions by:
- ~~Strikethrough~~ text on the heading
- "(superseded)" label in the heading
- `SUPERSEDED BY:` field in the decision body
All three indicators may be present; any one is sufficient.

### PARSE-11: Key Decisions Dual Format
The parser MUST handle both decision formats from the core spec:
- **Minimal format:** heading text IS the decision; body paragraph is rationale; no structured fields
- **Full format:** WHAT / WHY / WHEN / ALTERNATIVES CONSIDERED structured fields
Both must produce a normalised decision object. The parser must not require the full format.

### PARSE-12: Open Questions Sub-Categories
The parser MUST detect `## To Resolve` and `## To Keep Open` sub-headings within `# Open Questions`. "To Resolve" items use checkbox format (`- [ ]`) with optional `**Options:**` and `**Impact:**` sub-fields. "To Keep Open" items are plain list items.

### PARSE-16: Structured Extraction of Question Sub-Fields
Within a `## To Resolve` list item, the parser MUST extract these optional sub-fields as structured data:
- `**Options:**` — parsed as a `/`-delimited array of strings (e.g., `**Options:** A / B / C` → `["A", "B", "C"]`)
- `**Impact:**` — parsed as a single prose string

The parser returns a structured question object: `{ text, checked, options[], impact }`. Both sub-fields are optional — a bare question item (checkbox + text only) is valid. This structured extraction enables `brief_add_question` to write these sub-fields and `brief_get_questions` to return them as structured data to the AI.

## Test Specification

### Unit Tests (specific input → expected output)
- Minimal decision (heading + paragraph) → decision text from heading, rationale from paragraph
- Full decision with all structured fields → each field extracted with correct value
- Full decision with subset of fields → present fields extracted, absent fields missing, no warning
- Minimal and full decisions in same section → both normalized to same output shape
- Heading with `~~strikethrough~~` → decision marked superseded
- Heading containing "(superseded)" → decision marked superseded
- Body with `SUPERSEDED BY:` field → decision marked superseded
- All three supersession indicators together → superseded, no conflict
- Decision with `EXCEPTION TO:` field → exception status
- Both superseded and exception indicators → superseded takes precedence
- Decision with no status indicators → active
- `## To Resolve` unchecked item (`- [ ]`) → question with unchecked state
- `## To Resolve` checked item (`- [x]`) → question with checked state
- Item with `**Options:** A / B / C` → three trimmed options extracted
- Item with `**Impact:**` prose → impact string extracted
- Item with both sub-fields → both extracted
- Bare checkbox item (no sub-fields) → valid question, options and impact absent
- `## To Keep Open` plain list items → questions without checkbox state
- Empty Key Decisions or Open Questions section → empty collection, no error

### Property Tests (invariants that hold for ALL inputs)
- forAll(decision heading text): parser never throws, always returns structured result
- forAll(decision body with any field combination): output always has decision text and status
- forAll(checkbox item text): extraction always produces text and checked state
- forAll(options string with `/` delimiters): splitting produces at least one non-empty trimmed option
- forAll(mixed-format decision list): every output item has identical shape

## Tier 4 Criteria

Tier 4 criteria: JC-03
