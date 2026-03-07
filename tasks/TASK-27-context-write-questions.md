# TASK-27: Context Write — Questions & Constraints

## Metadata
- Priority: 29
- Status: pending
- Dependencies: TASK-15b, TASK-08
- Module path: src/context/
- Type stubs: src/types/context.ts
- Also read: src/types/writer.ts, src/types/decisions.ts
- Test file: tests/context/write-questions.test.ts
- Estimated context KB: 40

## What To Build

Implement three MCP tools: `brief_add_question`, `brief_resolve_question`, and `brief_add_constraint`. `brief_add_question` writes to the To Resolve or To Keep Open sub-section with optional structured sub-fields (options, impact) and priority ordering. `brief_resolve_question` marks a question as resolved using cascading match strategy and optionally auto-creates a linked Key Decision. `brief_add_constraint` appends to the What This Is NOT section.

## Implementation Guide

1. `src/context/write-questions.ts` — question and constraint tool handlers.

2. `brief_add_question` handler: accept parameters `question` (required), `keep_open` (boolean, default false — false = To Resolve, true = To Keep Open), `options` (optional string array), `impact` (optional string), `priority` ("high" or "normal", default "normal"). For To Resolve (`keep_open=false`): write as checkbox item `- [ ] question` with optional `**Options:**` and `**Impact:**` sub-fields. For To Keep Open (`keep_open=true`): write as plain list item. High priority prepends to top of sub-section; normal appends.

3. `brief_resolve_question` handler: accept `question` (required text to match), `decision` (optional title for auto-creating Key Decision), `why` (optional, for auto-decision), `resolution` (optional text summarising the resolution outcome — stored alongside the resolved question). Use cascading match: exact match first → substring match (if multiple, return error listing all) → fuzzy match (Levenshtein ≤ 3, suggest candidates). Mark checkbox `[x]`, move to Resolved sub-section. Return `resolution_summary`, `suggest_decision` flag (true when question had options or impact), `was_keep_open` warning when resolving a To Keep Open question.

4. Auto-decision creation: when `decision` and `why` parameters are provided, write a Key Decision entry linked to the resolved question. Create bidirectional links (RESOLVED FROM on decision, DECIDED AS on question). If original question had Options, convert to ALTERNATIVES CONSIDERED in the decision.

5. `brief_add_constraint` handler: accept `text` (required), `reason` (optional). Append to "What This Is NOT" section. Create the section if it doesn't exist.

6. All handlers: validate inputs via MCP-03, run requireActiveProject() guard.

## Exported API

Export from `src/context/write-questions.ts`:
- `handleAddQuestion(options: { text?: string; question?: string; keep_open?: boolean; options?: string[]; impact?: string; priority?: 'high' | 'normal'; _noActiveProject?: boolean }) → { success: boolean; format: string; optionsWritten?: boolean; impactWritten?: boolean; position: 'first' | 'last'; content: any; isError?: boolean }`
  Format: `'- [ ] ...'` for to-resolve, `'- ...'` for keep-open.
- `handleResolveQuestion(options: { question: string; resolution: string; createDecision?: boolean; decisionWhy?: string; decision?: string; why?: string; _noActiveProject?: boolean }) → { success: boolean; resolutionSummary: string; suggestDecision: boolean; wasKeepOpen: boolean; decisionCreated?: boolean; bidirectionalLinks?: boolean; alternativesConsidered?: any; resolvedFrom?: string; decidedAs?: string; matchSuggestions?: any; isError?: boolean; content?: any }`
- `handleAddConstraint(options: { text: string; reason?: string; sectionMissing?: boolean; _noActiveProject?: boolean }) → { success: boolean; sectionPlaced: string; reason?: string; sectionCreated?: boolean; content: any; isError?: boolean }`

## Rules

### DEC-06: Question Resolution Flow
`brief_resolve_question` MUST: mark the question as resolved by checking its checkbox (`[x]`) and moving it to a `## Resolved` sub-section within `# Open Questions`. It MUST NOT automatically create a Key Decision entry — not every resolved question warrants a formal decision record.

> **Spec divergence note:** SPECIFICATION.md (line 265) says "When 'To Resolve' questions get answered, move them to Key Decisions with rationale." The MCP implementation intentionally refines this into a two-step process: resolving a question is always recorded; creating a Key Decision is optional and user-confirmed. The spec text is simplified guidance for humans writing BRIEF.md by hand; the MCP server adds a structured workflow around the same concept.

After marking the question resolved, the server response MUST include a `resolution_summary` field and a `suggest_decision` flag (default: `true` when the question had `options` or `impact` fields, `false` otherwise). When `suggest_decision` is `true`, the AI SHOULD offer: "Want me to also add this as a Key Decision?" — but only if the user accepts.

This is a two-step process, not a compound automatic operation. The resolution is always recorded; the Key Decision is optional and user-confirmed.
- Use cascading match strategy: exact match first, then substring. If substring returns multiple results, return `user_error` listing all matches. If no match, try fuzzy matching (Levenshtein ≤ 3) and suggest. (OQ-215)

### DEC-08: Question–Decision Bidirectional Link
When `brief_resolve_question` leads to a Key Decision (via user confirmation per DEC-06), the link between them MUST be bidirectional:
- The new decision SHOULD include `RESOLVED FROM: [question text]`
- The resolved question SHOULD include `DECIDED AS: [decision title]`

This enables tracing from a decision back to the question that prompted it, and from a resolved question forward to the resulting decision.

### MCP-03: Input Validation
All tool inputs MUST be validated against their schema before execution. Invalid inputs return a structured error, not a crash. Validate empty/whitespace-only strings: for required parameters (title, query, path, name), treat empty or whitespace-only strings as missing and return `user_error`. For `brief_update_section(content: "")`, empty string is valid (means "clear section"). Centralise in `validateRequiredString()`. Validate parameter length limits: titles/names 500 chars, section content 100KB, search queries 1000 chars, labels 200 chars, paths 4096 chars. Configurable via config.json. Check mutually exclusive parameters: `replaces` and `exception_to` cannot both be provided. `direction` without `entry_id` is invalid. Return clear `user_error` listing the conflict. Decision field validation: `title` required, 1-500 chars. `why` recommended but not required. `date` defaults to today if missing, rejected if present but not parseable.

## Test Specification

### Unit Tests (specific input → expected output)
- Add question to To Resolve → checkbox item written with text
- Add question with options and impact → sub-fields present in written output
- Add question to To Keep Open → plain list item, no checkbox
- Add question with high priority → prepended to top of sub-section
- Add question with normal priority → appended to end
- Resolve question with exact match → checkbox marked, moved to Resolved
- Resolve question with substring matching multiple → error listing all matches
- Resolve question with no match, fuzzy candidate exists → suggestion returned
- Resolve To Keep Open question → resolved with a warning indicating the question was in keep-open state
- Resolve question that had options → response indicates a decision should be created from this resolution
- Resolve question without sub-fields → response indicates no decision suggestion
- Resolve with decision and why params → Key Decision auto-created with bidirectional links
- Auto-decision from question with Options → ALTERNATIVES CONSIDERED populated
- Add constraint → appended to What This Is NOT section
- Add constraint with reason → reason included
- Add constraint when section missing → section created then content appended
- Empty question text → validation error

### Property Tests (invariants that hold for ALL inputs)
- forAll(question text): add question never throws, always returns structured response
- forAll(resolve operation): response always includes a resolution summary
- forAll(bidirectional link): both RESOLVED FROM and DECIDED AS are set
- forAll(constraint text): append to What This Is NOT never throws

## Tier 4 Criteria

Tier 4 criteria: JC-02, JC-06, JC-07, JC-09
