# TASK-18: Hierarchy — Context Assembly & Formatting

## Metadata
- Priority: 20
- Status: pending
- Dependencies: TASK-17, TASK-09, TASK-11
- Module path: src/hierarchy/
- Type stubs: src/types/hierarchy.ts
- Also read: src/types/parser.ts
- Test file: tests/hierarchy/context.test.ts
- Estimated context KB: 45

## What To Build

Build the context assembly and formatting layer that takes the raw list of BRIEF.md files collected by the upward walker (T17) and produces a structured, formatted context output. This includes broadest-first ordering, level labeling with project names, hierarchy override detection (child decisions contradicting parent constraints), size bounding with truncation signals, sections filtering, additive extension/ontology inheritance with opt-out syntax, and active-only default decision views.

## Implementation Guide

1. `src/hierarchy/context.ts` — context assembly and formatting engine.

2. Accept the ordered list of BRIEF.md paths from the walker, parse each with T09/T10 parser. Reorder to broadest-first (reverse of walker's bottom-to-top output).

3. Level labeling: for each level, extract the Project name and Type from metadata. Format as `[Type: ProjectName]` (e.g., `[Artist: The Wanderers]`, `[Album: Midnight Train]`).

4. Override detection: compare child active decisions against parent constraints (What This Is NOT section). When a child decision contradicts a parent constraint, attach an inline flag: "Note: this [child type] overrides the [parent type]'s [constraint description]."

5. Parent context is advisory: present parent context as framing information. The child's own declarations always take precedence. Do not merge or override child content with parent content.

6. Size bounding: include full content for the immediate scope and its direct parent. For levels above that, include metadata-only summaries (project name, type, status, newest 3 decisions). Cap total output at configurable size limit (default 50KB). When truncated, include a signal indicating where truncation occurred and how to access full content at that level.

7. `context_depth` parameter: allow the caller to limit how many levels of context are returned (default: full walk up to size cap).

8. `sections` filter parameter: accept an array of filter values (`identity`, `constraints`, `motivation`, `decisions`, `questions`, `extensions`, `references`). When provided, return only matching sections. When omitted, return all sections. Multiple values are OR'd.

9. Extension/ontology inheritance: compute additive inheritance — parent extensions and ontologies are inherited by children. Respect `excludes:` syntax in the Ontologies metadata field for opt-out.

10. Decisions: return only active (non-superseded) decisions by default. Include superseded when explicitly requested.

## Exported API

Export from `src/hierarchy/context.ts`:
- `assembleContext(levels: HierarchyLevel[], options?: { sizeCap?: number; contextDepth?: number; includeSuperseded?: boolean }) → { levels: any[]; mergedMetadata: Record<string, unknown>; mergedSections: Section[]; allDecisions: Decision[]; allQuestions: Question[]; truncated?: boolean; truncationSignal?: string }`
  Reorders to broadest-first. Labels each level.
- `labelLevel(type: string, name: string) → string` — format: `[Type: Name]`
- `detectOverrides(parent: any, child: any) → string[]` — lists overridden fields
- `filterSections(sections: any[], filter?: string[]) → any[]`
  Filter values: `'identity'`, `'constraints'`, `'motivation'`, `'decisions'`, `'questions'`
- `computeInheritance(parent: any, child: any) → { extensions: string[]; ontologies: string[] }`

## Rules

### HIER-03: Accumulate Broadest First
When assembling context from multiple levels, the walker MUST order content from broadest (top-level parent) to most specific (active scope). This ensures the AI reads general context before specific overrides.

### HIER-04: Label Each Level
Every piece of context from the hierarchy MUST be labelled with its source level: e.g., `[Artist: The Wanderers]`, `[Album: Midnight Train]`, `[Song: Echo Valley]`.

### HIER-05: Flag Hierarchy Overrides
When a child decision contradicts a parent constraint, the context formatter MUST flag it inline: "Note: this track overrides the album's [constraint description]."

### HIER-06: Parent Context Is Advisory
The hierarchy walker MUST present parent context as context, not as binding constraints on the child. The child's own declarations take precedence.

### HIER-13: Context Block Size Limits
When assembling context from a deep hierarchy, the total output size MUST be bounded to prevent context window exhaustion in the AI. Implementation:
- Include full content for the immediate scope and its direct parent
- Include metadata-only (project name, type, status, newest 3 decisions) for levels above that
- Cap total context output at a configurable size limit (default: configurable, suggest 50KB)
- When truncation occurs, include a clear signal: "Context truncated at [level] due to size limit. Call brief_get_context with scope=[path] for full content at that level."
- `brief_get_context` MUST support a `context_depth` parameter (default: full walk, limited by size cap)

### HIER-15a: `brief_get_context` Sections Filter (GAP-S03)
`brief_get_context` accepts an optional `sections` array parameter to return only specific section categories. Valid filter values and their section mappings:
- `"identity"` — What This Is, What This Is NOT
- `"constraints"` — What This Is NOT (constraint-specific content)
- `"motivation"` — Why This Exists
- `"decisions"` — Key Decisions (active by default; include superseded if `include_superseded: true`)
- `"questions"` — Open Questions (excludes Resolved sub-section by default)
- `"extensions"` — all extension sections (SONIC ARTS, NARRATIVE CREATIVE, etc.)
- `"references"` — References section

When `sections` is omitted or empty, all sections are returned. Multiple filter values are OR'd (any matching section is included).

Down-walk is always a separate, explicitly requested operation — it never happens as part of context accumulation.

## Test Specification

### Unit Tests (specific input → expected output)
- Three-level hierarchy → output ordered broadest-first (artist → album → song)
- Each level in output → labeled with its project type and name
- Child decision contradicts parent constraint → override flag present in output
- Parent and child have same section → child content takes precedence, parent shown as advisory
- Deep hierarchy (5+ levels) → scope and direct parent have full content, higher levels metadata-only
- Output exceeding size cap → truncation signal included with instructions for accessing full content
- `context_depth` set to 2 → only 2 levels returned regardless of available depth
- `sections` filter with `["decisions"]` → only Key Decisions sections returned from each level
- `sections` filter with multiple values → all matching section types included (OR logic)
- `sections` omitted → all sections returned
- Parent has extensions, child does not → child inherits parent's extensions
- Child ontologies field with `excludes:` syntax → excluded parent ontology not inherited
- Decisions in output → only active decisions shown by default
- Superseded decisions requested → included when explicitly flagged
- Single-level hierarchy (no parents) → scope content returned without level comparison

### Property Tests (invariants that hold for ALL inputs)
- forAll(hierarchy): output is always broadest-first ordering
- forAll(hierarchy): every level in output has a type:name label
- forAll(hierarchy, size cap): total output size never exceeds cap
- forAll(sections filter): only requested section categories appear in output
- forAll(hierarchy): child declarations always take precedence over parent

## Tier 4 Criteria

Tier 4 criteria: JC-04
