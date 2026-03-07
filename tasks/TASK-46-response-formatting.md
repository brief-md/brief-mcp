# TASK-46: MCP Server — Tool Response Formatting & Context Blocks

## Metadata
- Priority: 48
- Status: pending
- Dependencies: TASK-24, TASK-08
- Module path: src/server/
- Type stubs: src/types/responses.ts
- Also read: src/types/context.ts
- Test file: tests/server/response-formatting.test.ts
- Estimated context KB: 40

## What To Build

Finalize all tool response formatting across the server. Implement consistent structured response formatting for all 38 tools, "Suggestions for AI" signal blocks on insufficient data, active/historical decision separation in context blocks, response size limiting with truncation signals, and confirmation messages for write tools. Tool descriptions embed DR (Decision Recording) and QUEST (Open Questions) guidance so the AI client knows how to use each tool correctly. Four documented signal scenarios handle degraded data: no ontology matches, sparse references, no pack data, no type guide. All responses include absolute paths and explicit decision status fields.

## Implementation Guide

1. `src/server/response-formatting.ts` — response formatting utilities and middleware.

2. Structured response format: define a consistent response structure used by all tools. Field names and formats must be consistent across the entire tool surface. Every response is parseable and machine-readable.

3. Insufficient data signals: implement a "Suggestions for AI" block that tools include when they have insufficient local data. The block indicates what's missing and what the AI can do about it. Define the four standard signal scenarios: (a) no ontology matches — suggest AI knowledge, (b) sparse references — suggest broadening search or AI knowledge, (c) no pack data — suggest manual entry, (d) no type guide — suggest generic guide.

4. Decision separation: any context block response that includes decisions MUST separate active decisions from historical (superseded) decisions. Active decisions go in `active_decisions` section. Superseded decisions go in `decision_history` section. The two are never mixed. Each decision item carries a `status` field (active, superseded, exception).

5. Response size limiting: implement a configurable per-tool response size limit (default 32KB text). When exceeded, truncate with a signal: "Response truncated. [N] additional items not shown." The limit is configurable via config.json.

6. Write tool confirmations: all write tools return confirmation of what was changed, including the file path and a summary of modifications.

7. Absolute paths: all file paths in tool responses are absolute. No relative paths, no `~` shorthand.

8. Read tool purity: enforce that tools categorised as "Read" never modify files. This is a structural guarantee, not just convention.

9. Tool descriptions: embed behavioural guidance in tool descriptions so the AI client knows how to orchestrate decision recording and open question management correctly. Tool description length constraint: each tool description MUST be under 500 characters. Full workflow documentation belongs in the `brief://guide` resource (TASK-25), not in tool descriptions. Use tool descriptions for: what the tool does (one sentence), when to call it (key trigger), and critical constraints. Link to the guide resource for extended patterns. (OQ-055) Specific per-tool description requirements:
   - `brief_add_decision`: Note that the AI MUST complete the DR-02 elicitation sequence (confirm → elicit rationale → elicit alternatives) before calling this tool. Note DR-01 commitment signal detection. Note DR-04 (avoid over-logging non-decisions).
   - `brief_add_question`: Note QUEST-01 (placeholder vs question distinction), QUEST-02 (capture during creation), QUEST-04 (priority=high for blocking questions), QUEST-08 (always provide options and impact when available), QUEST-09 (offer "To Keep Open" concept once per setup).
   - `brief_resolve_question`: Note that resolving automatically surfaces DR-02 (the options field becomes alternatives considered if `decision` param is provided).
   - `brief_get_questions`: Note QUEST-06 (present "To Resolve" as action items and "To Keep Open" as creative tension — never frame "To Keep Open" as blockers).
   - `brief_reenter_project`: Note DR-06 (ask about external tool sessions: "Did you work in any external tools since we last spoke?"). Note QUEST-07 (planning session trigger).
   - `brief_check_conflicts`: Note QUEST-07 (run as part of planning session flow: `brief_get_context` + `brief_get_questions` + `brief_check_conflicts`).
   - `brief_capture_external_session`: Note DR-06 (AI must not claim to know what happened in sessions it didn't witness — only capture what the user narrates). Note DR-02 (still apply elicitation sequence to extracted decisions).
   - `brief_get_context`: Note DR-05 (if user mentions past decisions not yet logged, offer retroactive capture). Note "Call this at the start of every session."

10. Truncation notification: the response format includes a standardised truncation signal that the AI client can detect and relay to the user.

## Exported API

Export from `src/server/response-formatting.ts`:
- `formatResponse(params: { type?: string; data?: any; signal?: string; simulateLargeData?: boolean; filePath?: string }) → { content: Array<{ type: 'text'; text: string }> }` — MCP-compliant response
- `formatWriteConfirmation(params: { filePath: string; changes: string[] }) → { content: Array<{ type: 'text'; text: string }> }`
- `separateDecisions(decisions: Array<{ text: string; status: string }>) → { activeDecisions: any[]; decisionHistory: any[] }`
- `truncateResponse(data: string, options: { maxSize: number }) → { truncated: boolean; signal?: string }`
- `buildInsufficientDataSignal(signal: 'no_ontology_matches' | 'sparse_references' | 'no_pack_data' | 'no_type_guide') → { suggestionsForAI: string }`

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

## Test Specification

### Unit Tests (specific input → expected output)
- Tool response with all required fields → structured and parseable
- Read tool response → no file modifications occur
- Write tool response → includes file path and change summary
- Context block with active and superseded decisions → separated into distinct sections
- Decision item → always includes status field (active, superseded, or exception)
- Tool with insufficient data → "Suggestions for AI" block included
- Response exceeding 32KB → truncated with signal indicating items omitted
- Response under 32KB → no truncation signal
- Truncation signal → includes count of omitted items
- File path in response → always absolute, never relative or ~
- No ontology matches scenario → correct signal emitted
- Sparse references scenario → correct signal emitted
- Config with custom max_response_size → custom limit applied

### Property Tests (invariants that hold for ALL inputs)
- forAll(tool response): structured and parseable format
- forAll(write tool): confirmation always includes file path
- forAll(context block with decisions): active and historical never mixed
- forAll(decision item): status field always present
- forAll(file path in response): always absolute

## Tier 4 Criteria

Tier 4 criteria: JC-02, JC-07, JC-09
