# TASK-24: Context — Read Tools

## Metadata
- Priority: 26
- Status: pending
- Dependencies: TASK-18, TASK-08
- Module path: src/context/
- Type stubs: src/types/context.ts
- Also read: src/types/hierarchy.ts, src/types/parser.ts, src/types/writer.ts
- Test file: tests/context/read.test.ts
- Estimated context KB: 45

## What To Build

Implement four context read MCP tools: `brief_get_context`, `brief_get_constraints`, `brief_get_decisions`, and `brief_get_questions`. These are pure query tools that never modify files. They use the hierarchy walker (T18) to accumulate context from the project hierarchy and return structured, formatted responses. All include response size limiting, truncation signals, active/historical separation for decisions, and structured signals when data is insufficient.

## Implementation Guide

1. `src/context/index.ts` — barrel re-exporting public API.

2. `src/context/read.ts` — context read tool implementations.

3. `brief_get_context` handler: call T18's context assembly with the active project/scope. Pass through `sections` filter and `include_superseded` option. Format the accumulated context as a structured response with level labels. Apply response size limiting.

4. `brief_get_constraints` handler: extract "What This Is NOT" sections from all hierarchy levels, plus rejected alternatives from decision ALTERNATIVES CONSIDERED fields. Return as a structured list with source-level labels.

5. `brief_get_decisions` handler: collect decisions from all hierarchy levels. Each decision carries a `status` field (active, superseded, or exception). Sort by date, newest first. Default view: active only (DEC-03). `include_superseded` option returns full chains. Support `scope` override parameter.

6. `brief_get_questions` handler: collect open questions from all levels. Split into three categories: To Resolve, To Keep Open, Resolved. Include structured sub-fields (options, impact) where present.

7. Response formatting: separate active decisions from historical in distinct labeled sections. Include structured "Suggestions for AI" block when data is insufficient (e.g., no decisions yet → suggest asking the user about decisions made).

8. Response size limiting: cap total response size (configurable, default from config). When truncated, include a clear signal with count of omitted items and instructions for narrowing the query.

9. **Lenient scope parameter (FS-12):** When the `scope` parameter points to a path that does not exist on the filesystem, do NOT return an error. Return an empty context with a `path_not_found: true` signal in the response. This supports pre-creation scenarios where the AI is gathering context for a project directory that does not exist yet. Reference FS-12 and OQ-190.

## Exported API

Export from `src/context/read.ts`:
- `getContext(options: { projectPath: string; sections?: string[]; simulateEmpty?: boolean; simulateLargeResponse?: boolean; maxResponseSize?: number; simulateReadOnly?: boolean }) → { levels: any; filePath: string; activeDecisions: any[]; suggestions?: any; truncated?: boolean; truncationSignal?: string; filesModified?: number }`
- `getConstraints(options: { projectPath: string }) → { constraints: string[]; content: any }`
- `getDecisions(options: { projectPath: string; includeSuperseded?: boolean; scope?: string; simulateExceptionDecision?: boolean }) → { activeDecisions: any[]; decisionHistory?: any[]; decisions?: any[] }`
  Each decision: `{ text, status ('active'|'superseded'|'exception'), date }`
- `getQuestions(options: { projectPath: string; simulateSubFields?: boolean }) → { toResolve: any[]; toKeepOpen: any[]; resolved?: any[] }`
  Each question: `{ text, options?, impact? }`

## Rules

### RESP-01: Structured Responses
All tool responses MUST be structured and parseable. Use consistent field names and formats across tools.

### RESP-02: Signal on Insufficient Data
When a tool has insufficient local data to fully answer, it MUST include a structured "Suggestions for AI" block indicating what's missing and what the AI can do about it.

### RESP-03: No Side Effects on Read Tools
Tools categorised as "Read" in the tool surface table MUST NOT modify any files. Read tools are pure queries.

### RESP-04: Confirmation on Write Tools
All write tools MUST return confirmation of what was changed, including the file path and a summary of modifications.

### RESP-05: Absolute Paths in Output
All file paths in tool responses MUST be absolute paths. No relative paths, no `~` shorthand.

### RESP-06: Context Block Decision Sections Must Be Explicitly Labelled
Any context block response that includes decisions MUST separate active decisions from historical (superseded) decisions into distinct, explicitly labelled sections. Active decisions belong in an `active_decisions` section. Superseded decisions, if included (e.g., when `include_history: true`), belong in a separate `decision_history` section. The two MUST never be mixed.

Each decision item in a context block MUST carry a `status` field with one of: `active`, `superseded`, or `exception`. The AI must never need to infer a decision's status from surrounding prose or markdown formatting (e.g., strikethrough text).

This is the server-side enforcement of the human-readable filter defined in DEC-03 and Pattern 18. The AI should treat `active_decisions` as current state and `decision_history` as background context only.

### RESP-07: AI MUST Notify User of Truncated Responses
When the AI receives a tool response containing a truncation signal (e.g., `[TRUNCATED: Response exceeded 32KB limit. N items omitted.]`), the AI MUST inform the user. Suggested phrasing: "Some content was truncated — not all [context / results] were included due to the response size limit. You can increase `max_response_size` in `~/.brief/config.json`, or use the `scope` parameter to retrieve content from a specific level." The AI MUST NOT silently ignore truncation signals.

### PERF-11: Response Size Limits
Configurable per-tool response size limit (default 32KB text). If exceeded, truncate with signal: "Response truncated. [N] additional items not shown." Limit configurable via config.json. (OQ-187)

### DEC-03: Default View Is Active Only
`brief_get_context` and `brief_get_decisions` MUST return only active (non-superseded) decisions by default. Superseded decisions are only included when `include_superseded=true`.

## Test Specification

### Unit Tests (specific input → expected output)
- Get context for project with sections → structured response with level labels
- Get context with sections filter → only requested sections returned
- Get constraints → What This Is NOT content from all levels plus rejected alternatives
- Get decisions (default) → only active decisions, sorted newest first, each with status field
- Get decisions with include_superseded → both active and superseded in separate labeled sections
- Get decisions → active and historical never mixed in same section
- Get questions → split into To Resolve, To Keep Open, Resolved categories
- Get questions with sub-fields → options and impact included as structured data
- Empty project (no decisions) → response includes suggestions block for AI
- Response exceeding size limit → truncation signal with omitted count and instructions
- All paths in responses → absolute paths only
- Read tools → never modify any files (pure queries)
- Scope override on get_decisions → decisions from specified scope only

### Property Tests (invariants that hold for ALL inputs)
- forAll(context read call): no files modified on disk
- forAll(decisions response): every decision item has a status field
- forAll(decisions default view): no superseded decisions in active section
- forAll(response): all file paths are absolute
- forAll(response exceeding limit): truncation signal always present

## Tier 4 Criteria

Tier 4 criteria: JC-02, JC-07, JC-08, JC-09
