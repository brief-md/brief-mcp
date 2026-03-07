# TASK-25: Server — MCP Resource brief://guide

## Metadata
- Priority: 27
- Status: pending
- Dependencies: TASK-08
- Module path: src/server/
- Type stubs: none
- Also read: none
- Test file: tests/server/guide.test.ts
- Estimated context KB: 55

## What To Build

Implement the `brief://guide` MCP resource — a single resource that exposes the AI interaction guide. This guide contains the 8 interaction patterns from the spec, tool usage recommendations, DR-01..08 decision recognition rules, and QUEST-01..11 question surfacing rules. The content is static per server version, built at startup and cached in memory. The guide is written in markdown for AI consumption. No BRIEF.md files are exposed as resources (that would bypass server logic). No MCP prompts in v1.

## Implementation Guide

1. `src/server/guide.ts` — guide resource implementation.

2. Register `brief://guide` as an MCP resource with the server (T08). The resource returns a markdown document. Use the following exact registration fields with the MCP SDK: `uri: 'brief://guide'`, `name: 'BRIEF.md Interaction Guide'`, `mimeType: 'text/markdown'`, `description: 'AI interaction guide for the brief-mcp server. Contains tool usage patterns and decision/question capture rules.'` No other resources are registered. The MCP SDK's `ListResourcesRequestSchema` handler MUST return exactly one entry. (OQ-056)

3. Guide content assembly: build a comprehensive markdown document at startup containing:
   - 8 interaction patterns from the spec (Session Start, Decision Capture, Question Surfacing, Re-Entry, External Session, Conflict Resolution, Extension Setup, Ontology Exploration)
   - Tool usage recommendations (which tools to call when, ordering guidance)
   - DR-01..08 decision recognition rules (signal detection, elicitation sequence, ambiguity handling, retroactive capture, external sessions)
   - QUEST-01..11 question surfacing rules (placeholder detection, capture during creation, priority, surfacing frequency, re-entry presentation, planning sessions, deferral)
   - Signal block format documentation (RESP-02)

4. Cache the assembled content in memory — it does not change during a server session.

5. Constraints: no BRIEF.md files exposed as MCP resources. No MCP prompts in v1. Only this one resource.

6. Tool descriptions in the guide should help AI understand when to use each brief_* tool and how they relate to the interaction patterns.

## Exported API

Export from `src/server/guide.ts`:
- `getGuideResource() → { content: string }` — markdown content >500 chars, covers all 8 interaction patterns
- `listResources() → Array<{ uri: 'brief://guide'; name: string; mimeType: 'text/markdown'; description: string }>`
- `listPrompts() → []` — returns empty array

## Rules

### MCP-05: Tool Descriptions Guide AI Behaviour
Tool descriptions are part of the AI's prompt. They MUST be written to guide correct usage patterns. Include notes like "Call this at the start of every session" for `brief_get_context`.

### MCP-06: Tool Naming to Prevent Conflicts with Other MCPs
All brief-mcp tools MUST use the `brief_` prefix (e.g., `brief_add_decision`, `brief_get_context`). This prefix clearly scopes brief-mcp tools and reduces ambiguity when multiple MCP servers are connected simultaneously.

Tool descriptions MUST include a note clarifying the tool's scope. Example: "Use this tool to record a project decision in the BRIEF.md file. For actions on external tools (DAWs, design software, etc.), use the tools provided by those servers."

The AI agent rules (for AI clients reading those rules) MUST include guidance: use `brief_*` tools for all project context, memory, and decision management; use other servers' tools for domain-specific actions. When a user request involves both context and action, call `brief_*` tools first to get context, then the action tool.

### RESP-02: Signal on Insufficient Data
When a tool has insufficient local data to fully answer, it MUST include a structured "Suggestions for AI" block indicating what's missing and what the AI can do about it.

### QUEST-01: Placeholder vs. Question Detection
When a user expresses uncertainty or incompleteness during extension scaffolding, the AI SHOULD distinguish between:
- **Placeholder:** "I'll fill this in later" — leave the subsection empty, no action needed
- **Open Question:** "I'm not sure — this will affect other choices or block progress" — call `brief_add_question`

The test: "If this remains unresolved, will it block work or meaningfully shape other decisions?" If yes → question. If no → placeholder.

### QUEST-02: Capture Questions During Creation
When setting up a new project's extensions, the AI SHOULD proactively surface known decision points as questions. The AI does NOT need to capture every uncertainty — only those with stakes (things that affect multiple other choices or determine the project's direction).

When capturing: use `options` and `impact` parameters where the AI can identify alternatives and consequences. A well-structured question is more useful at re-entry than a bare question text.

### QUEST-03: Domain Risks as Questions
Domain-specific risks, failure modes, and edge cases SHOULD be captured as "To Resolve" questions when:
- The user hasn't already considered them
- They're likely to affect the project's success or direction
- They should be decided before significant work begins

The AI uses its domain knowledge to identify which risks are worth surfacing. It should offer to capture them, not force them: "For projects like this, [risk] is worth deciding early. Want me to add that as an open question?"

### QUEST-04: Priority for Blocking Questions
When a question blocks a specific piece of work (e.g., "can't finalize the sound design until this is answered"), the AI SHOULD call `brief_add_question` with `priority: "high"`. This prepends the question to the list, so it appears first at re-entry and in planning sessions.

The default (`"normal"`, appends to bottom) is appropriate for questions that can safely wait.

### QUEST-05: Question Surfacing Frequency During Active Work
The AI MUST NOT interrupt constantly to surface questions. Surface new questions only when:
1. A conflict is detected via `brief_check_conflicts` that requires a decision
2. The user explicitly expresses uncertainty ("I'm not sure if...", "we might...", "it depends...")
3. A new decision point arises that would directly contradict an existing decision or constraint

The AI should batch questions where possible — hold uncertainty in the conversation until it's clear the question is worth formalising.

### QUEST-06: Re-Entry Presentation of Question Categories
At re-entry and in planning sessions, the AI MUST present "To Resolve" and "To Keep Open" questions in distinct ways:
- **"To Resolve":** Action items — "You have X questions to resolve"
- **"To Keep Open":** Context and creative tension — "You're intentionally keeping Y open"

"To Keep Open" items MUST NOT be framed as blockers or tasks. They are intentional ambiguities, not oversights.

### QUEST-07: Planning Session Trigger
When the user signals planning intent ("let's plan this", "where are we?", "help me think through what needs deciding"), the AI SHOULD run the Planning Session Flow (Pattern 8): call `brief_get_context` + `brief_get_questions` + `brief_check_conflicts`, then present a structured state summary.

The planning session works even when there are no open questions — in that case, it confirms good project state and may surface new questions from the current context.

### QUEST-08: brief_add_question Parameters
The AI SHOULD always provide `options` and `impact` when it can identify them, rather than capturing bare question text. A question with structured options and stated impact is significantly more useful at re-entry than "Should we use X?" with no context.

### QUEST-09: Offer "To Keep Open" Once Per Project Setup
The AI MUST offer the "To Keep Open" concept to the user during project setup — exactly once, after the user has expressed a few concrete decisions and constraints (not as the first question).

The offer should include a domain-specific example generated from the AI's knowledge of the project type — something practitioners in that field commonly leave intentionally open. The AI should NOT use a generic example; it should reflect the actual project type and context.

If the user accepts: call `brief_add_question(..., keep_open=true)`.
If the user declines: move on. Do not repeat the offer in the same setup session.

In planning sessions (Pattern 8), if the "To Keep Open" list is empty and the project is creative in nature, the AI MAY offer the concept again — once — using a fresh example.

### QUEST-10: Options Logic — Multiple Choice vs. Open-Ended
When calling `brief_add_question`, or when offering choices to the user during detail-gathering, the AI must decide whether to generate multiple-choice options or ask open-endedly.

**Offer multiple choice when:**
- The answer space is bounded and domain-knowable from the AI's knowledge: genres (Pop, Rock, Jazz), keys (C major, F minor), time signatures, software tools (Ableton, Logic, FL Studio), art styles, output formats, distribution platforms
- The AI can enumerate 2–5 meaningful, distinct options — not so many that it becomes a menu
- Options are meaningfully different from each other (not just variations of the same answer)

**Do NOT offer multiple choice when:**
- The answer is open-ended and personally determined: emotional themes, artistic intent, "what does this project mean to you?", "what feeling do you want this to evoke?"
- The answer space is too large to enumerate meaningfully without context narrowing first
- The user has already indicated a direction and is refining rather than choosing

**When multiple choice is appropriate:**
- Generate 3–5 options from domain knowledge, with a free-text escape ("or something else")
- Present them conversationally, not as a numbered menu
- Pass options to `brief_add_question` via the `options` parameter so they are preserved in BRIEF.md and converted to `ALTERNATIVES CONSIDERED` when the question is resolved

**Context-aware narrowing for large option spaces:** The AI MUST NOT present a flat list of common options for fields with thousands of valid values. Instead: check existing context first (parent BRIEF.md, user's stated influences, ontology entries already applied); if signals exist, offer 3–5 contextually relevant options; if no signals exist, ask a narrowing question first; when ontology packs are available, use the ontology's own category hierarchy; always include a free-text escape.

### QUEST-11: Deferral Escape Hatch During Detail-Gathering
When the AI is asking the user questions during project setup or extension scaffolding — doing the type guide interview — it MUST make deferral a visible and natural option, not something the user has to figure out themselves.

**Required framing:** For questions the user might not have answered yet, the AI SHOULD flag that skipping is fine:
- Append to the question: "(or we can add this as an open question and come back to it)"
- Or after asking, if the user hesitates: "No problem — want me to note that as something to figure out later?"

**When to use the escape hatch:** Apply the framing selectively, not on every question:
- On questions the AI knows are commonly hard to answer at project start: specific tempo, final track count, release date, distribution plan, exact target audience demographics
- When the user hesitates, gives a vague answer ("maybe...", "probably...", "not sure yet"), or explicitly says "I don't know"

**When the user defers:** Call `brief_add_question` with the deferred topic. This is a non-blocking deferral — the setup continues without the answer. Confirm: "Got it — added to your open questions."

### DR-01: Decision Signal Detection
The AI MUST monitor conversation turns for commitment language that signals a decision has been made. This is **semantic intent detection, not keyword matching** — the AI uses its language understanding to detect commitment intent in context.

**Key signals for commitment:** (1) a specific option is named, (2) the language indicates finality rather than exploration, (3) the conversation context involved deliberation about alternatives. When in doubt, apply DR-03 (ambiguity check) rather than assuming commitment.

**Examples of commitment language:**
- **Commitment verbs:** "I'll go with X", "let's use X", "we're going with X", "I've chosen X", "X it is", "sticking with X", "we'll do X"
- **Present-tense declarations after deliberation:** "the tempo is 72 BPM", "the key is C minor", "the genre is Folk"
- **Explicit closure language:** "done — it's X", "final answer: X", "decided: X"
- **Casual confirmations in context:** "yeah that one", "cool, so X then", "that's sorted", "lock it in", "X works"

**These signals are NOT decisions and MUST NOT trigger logging:**
- **Preference statements:** "I like X", "X sounds good", "X feels right" — express opinion, not commitment
- **Exploratory statements:** "let's try X", "let's see how X sounds", "what if we did X" — still deliberating
- **Qualified statements:** "I'll go with X for now", "X works but..." — qualifiers signal unresolved concern
- **Questions:** "should we use X?", "would X work?" — seeking input, not committing
- **Mid-deliberation reversals:** "actually, let me try Y instead" — the previous X was never committed

### DR-02: Elicitation Sequence (Always Required)
When a decision signal is detected, the AI MUST complete this sequence before calling `brief_add_decision`:
1. **Confirm the decision:** Restate it clearly — "So the decision is: [X]?"
2. **Elicit rationale:** If not already stated — "What's driving this choice?"
3. **Elicit alternatives:** "What else did you consider, and why did you rule it out?"
4. **Record:** Call `brief_add_decision(title, why, alternatives=[...])` with the full picture.

**Timing:** Trigger the elicitation immediately after the commitment signal — do not defer to end-of-session. Decisions captured immediately are more accurate.

**Exception:** If the decision was resolved from an existing Open Question that already has an `**Options:**` field (via `brief_resolve_question`), the options become the alternatives automatically. No additional elicitation is needed — the server handles the conversion. The AI should still confirm the decision title and rationale if not already captured.

### DR-03: Ambiguity Threshold — Offer Deferral When Not Committed
If the decision signal is ambiguous — the user might be exploring rather than committing — the AI MUST ask before logging:

> "Is this locked in, or are you still exploring?"

Use this check when the user says "let's try X" or "maybe X" or any language that reads as tentative. Only proceed to the DR-02 elicitation sequence after confirming it's a real commitment.

Do not over-apply this check. Clear commitment language ("X it is", "I've decided on X", "we're going with X") does not need the ambiguity check — go directly to DR-02.

**When still exploring — offer deferral:** If the user says "still exploring" or "not sure yet", the AI MUST offer to park the uncertainty as an open question: "Want me to add [X] as an open question so we can come back to it?"

### DR-04: Avoid Over-Logging
Not every stated preference or tentative choice is a decision worth logging. The test: "Would this being different in two weeks matter to the project?" If yes → log it. If no → don't.

Do NOT log:
- Mid-session explorations that were later reversed in the same session
- Decisions about how to have the current conversation ("let's focus on X first")
- Pure process choices that leave no trace in the project ("let's try that again")
- Preferences about tool behaviour rather than the project itself

### DR-05: Retroactive Capture
If the user later references a decision from earlier in the conversation that wasn't logged at the time, the AI SHOULD offer to back-fill it:

> "We decided [X] earlier — want me to add that to the brief?"

Apply the same DR-02 elicitation sequence: confirm the decision, elicit rationale and alternatives, then log. Use the date the decision was actually made (current session date), not the date it was logged.

### DR-06: External Session Decisions
Decisions made in external tool sessions (e.g., Suno AI, a separate MCP session without Brief MCP co-loaded) are not automatically visible. The AI MUST follow these patterns:

**Preferred path — Co-present:** When the user is working with a creative tool MCP in the same session as Brief MCP, the AI witnesses exploration and decisions in real time. Apply DR-01 through DR-05 normally.

**Fallback path — Re-entry narration:** When the user returns from external tool work, `brief_reenter_project` includes the prompt: "Did you work in any external tools (Suno AI, Ableton, Figma, etc.) since we last spoke?" The AI then asks the user to describe what happened, extracts decisions from the narrative using DR-01 signal detection, applies the DR-02 elicitation sequence to each identified decision, and calls `brief_capture_external_session`.

**Important:** The AI MUST NOT claim to know what happened in an external session it did not witness. It can only capture what the user narrates.

### DR-07: BRIEF.md Schema for Captured Decisions
All decisions captured via DR-02 or DR-06 MUST use the full decision format in BRIEF.md (not the minimal format), because the elicitation sequence guarantees the structured fields are available:

```markdown
### WHAT: [Decision Title]
**WHY:** [Rationale from DR-02 step 2]
**WHEN:** YYYY-MM-DD
**ALTERNATIVES CONSIDERED:**
- [Option A] — [why rejected]
- [Option B] — [why rejected]
```

This maps directly to the `brief_add_decision` parameters: `title` → WHAT, `why` → WHY, `alternatives` → ALTERNATIVES CONSIDERED. The server writes the date automatically.

`ALTERNATIVES CONSIDERED` is optional. If the user confirms no alternatives were considered, the field is omitted entirely — do not write `**ALTERNATIVES CONSIDERED:** none`.

### DR-08: Deliberation State — Active Discussion Without Pressure
Not every question needs immediate resolution or formal deferral. When the user is actively thinking through a question — researching, listening to references, trying things in their DAW, or simply taking time to consider — the AI MUST support this **deliberation state** without forcing a decision or pushing the question into formal capture.

**Deliberation state is recognised when:**
- The user says "give me a minute", "let me think about that", "I need to try some things first"
- The user asks the AI for input: "what would you suggest?", "what are the trade-offs?"
- A multi-turn discussion is underway about options and trade-offs, without a commitment signal (DR-01)

**AI behaviour during deliberation:** Contribute actively (suggest options, surface relevant context from the BRIEF.md, offer trade-off analysis, share domain knowledge). Do NOT push for a decision. Do NOT offer to add a question unless the user signals they want to park it. Let the conversation run until a commitment signal or explicit deferral emerges.

## Test Specification

### Unit Tests (specific input → expected output)
- Request brief://guide resource → returns markdown content
- Guide content → contains all 8 interaction pattern descriptions
- Guide content → contains decision recognition guidance (signal detection, elicitation)
- Guide content → contains question surfacing guidance (placeholder detection, categories)
- Guide content → contains tool usage recommendations
- Guide content → mentions brief_ prefix scope and multi-MCP guidance
- Guide content → includes signal block format documentation
- Resource is static → same content returned on repeated requests within a session
- No BRIEF.md files exposed as resources → only brief://guide registered
- No MCP prompts registered → prompt list is empty

### Property Tests (invariants that hold for ALL inputs)
- forAll(guide request): response is always non-empty markdown
- forAll(guide request): content is identical across multiple calls (cached)

## Tier 4 Criteria

Tier 4 criteria: none
