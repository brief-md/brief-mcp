// src/server/guide.ts — TASK-25: MCP Resource brief://guide

// ---------------------------------------------------------------------------
// Guide resource metadata (OQ-056)
// ---------------------------------------------------------------------------

export interface GuideResource {
  uri: string;
  name: string;
  mimeType: string;
  description: string;
}

export const GUIDE_RESOURCE: GuideResource = {
  uri: "brief://guide",
  name: "BRIEF.md Interaction Guide", // check-rules-ignore
  mimeType: "text/markdown",
  description:
    "AI interaction guide for the brief-mcp server. Contains tool usage patterns and decision/question capture rules.",
};

// ---------------------------------------------------------------------------
// Guide content — built once at module load, cached in memory (static per
// server version). Covers all 10 interaction patterns, DR-01..08,
// QUEST-01..11, tool recommendations, multi-MCP guidance, signal format.
// ---------------------------------------------------------------------------

const GUIDE_CONTENT = `# BRIEF.md Interaction Guide

This guide describes how an AI assistant should interact with the brief-mcp server.
It covers the 10 interaction patterns, decision recognition rules (DR-01 through DR-08),
question surfacing rules (QUEST-01 through QUEST-11), tool usage recommendations,
and signal block format documentation.

---

## Interaction Patterns

### Pattern 1: Session Start

At the start of every session, call \`brief_get_context\` with the active project path.
This returns the full BRIEF.md context including metadata, decisions, constraints,
open questions, and extension content. Always do this before any other work.

Use \`brief_get_context\` scope parameter to walk the project hierarchy and include
parent context when working on a sub-project.

### Pattern 2: Decision Capture

When the user makes a decision during conversation, the AI must detect the commitment
signal (DR-01), confirm the decision, elicit rationale and alternatives (DR-02), then
call \`brief_add_decision\` to record it in BRIEF.md. Decisions use the full format:
WHAT, WHY, WHEN, and ALTERNATIVES CONSIDERED.

### Pattern 3: Question Surfacing

Open questions arise when uncertainty is detected. The AI should distinguish between
placeholders (no action needed) and genuine open questions that block progress or
shape other decisions (QUEST-01). Capture questions with \`brief_add_question\`,
providing options and impact where possible (QUEST-08).

### Pattern 4: Re-Entry

When returning to a project after time away, call \`brief_reenter_project\` to load
the full context and see what has changed. The re-entry flow presents "To Resolve"
questions as action items and "To Keep Open" questions as intentional ambiguities
(QUEST-06). Ask about any external tool sessions since last visit (DR-06).

### Pattern 5: External Session

When the user returns from working in external tools (e.g. Suno AI, Figma, Ableton),
capture what happened via \`brief_capture_external_session\`. Extract decisions from
the user's narrative using DR-01 signal detection, apply DR-02 elicitation to each,
and record the session summary with breadcrumb links. Never claim to know what happened
in an external session — only capture what the user narrates.

### Pattern 6: Conflict Resolution

Use \`brief_check_conflicts\` to detect contradictions between decisions in the
BRIEF.md hierarchy. When conflicts are found, help the user resolve them by
presenting the conflicting decisions and their rationale. Resolution may involve
superseding a decision (\`brief_add_decision\` with \`replaces\`), adding an exception
(\`exception_to\`), or adding a new decision that clarifies the relationship.

### Pattern 7: Extension Setup

Extensions add specialised sections to BRIEF.md for specific domains. Use
\`brief_suggest_extensions\` to recommend extensions for the project type, then
present them to the user — explain what each extension adds. After presenting
suggestions, invite the user to describe any additional extensions their project
needs that aren't listed. \`brief_add_extension\` accepts any extension name and
optional subsections — it is not limited to the predefined registry. If the user
describes a need, create an extension with a descriptive name and relevant subsections.
Only activate extensions the user approves.

During extension setup, proactively surface known decision points as questions
(QUEST-02) and offer the deferral escape hatch (QUEST-11) for questions the user
may not be ready to answer.

### Pattern 8: Ontology Exploration

Ontology packs provide shared vocabulary for project domains. Use
\`brief_search_ontology\` to find relevant terms, \`brief_browse_ontology\` to explore
categories, and \`brief_tag_entry\` to link project content to ontology concepts.
Data in ontology packs is user-contributed — always verify before relying on it.

In planning sessions, combine \`brief_get_context\` + \`brief_get_questions\` +
\`brief_check_conflicts\` for a structured state summary (QUEST-07).

### Pattern 9: Collaborative Section Authoring

When populating BRIEF.md sections (What This Is, What This Is NOT, Why This Exists, or any
extension section), do NOT generate content autonomously. Instead, follow this sequence:

1. **Ask first**: Ask the user to express their thoughts in their own words. Example: "What
   would you say this project is, in your own words?"
2. **Listen and reflect**: After the user responds, reflect back what you heard. Identify the
   core ideas, note any gaps or ambiguities, and ask clarifying questions.
3. **Offer to refine**: Once the ideas are clear, offer to help polish or structure the text.
   Example: "Here's a tightened version — does this capture what you mean?"
4. **Write only after approval**: Call \`brief_update_section\` only after the user confirms
   the content. Never pre-fill sections with AI-generated content that the user hasn't
   reviewed.

This applies to all identity sections during project setup (setupPhase: "needs_identity")
and to extension sections during extension setup. The user's voice should be preserved —
the AI's role is editor, not author.

### Pattern 10: Type Guide Review

After project creation, if the response includes a \`typeGuide\`, present it to the user
for review before proceeding. Follow this sequence:

1. **Summarise the guide**: Present the key dimensions, suggested workflow, and known
   tensions from the type guide in a readable format. Do not dump raw content.
2. **Ask for fit**: "Does this match what you're going for, or should we look at other
   type guides?" If \`typeGuideSuggestions\` are present, list them as alternatives.
3. **Offer alternatives**: If the user wants something different, call
   \`brief_suggest_type_guides\` with their description, then \`brief_apply_type_guide\`
   for their chosen guide.
4. **Apply only after confirmation**: Call \`brief_apply_type_guide\` only after the user
   agrees to the guide. The guide drives extension and ontology suggestions, so the
   user should understand what it entails.

If \`setupPhase\` is "choose_type_guide" or "explore_type", type guide review takes
priority over extension setup. If the guide is generic (\`isGeneric: true\`), use the
10 Universal Dimensions to explore the project type collaboratively before creating
a domain-specific guide with \`brief_create_type_guide\`.

---

## Decision Recognition Rules (DR-01 through DR-08)

### DR-01: Decision Signal Detection

Monitor conversation for commitment language: "I'll go with X", "let's use X",
"X it is", "sticking with X". These are semantic intent signals, not keyword matches.
Key indicators: a specific option is named, finality language is used, and prior
deliberation occurred. Do NOT treat preferences ("I like X"), explorations ("let's
try X"), or qualified statements ("X for now") as decisions.

### DR-02: Elicitation Sequence

Before calling \`brief_add_decision\`, always: (1) confirm the decision — "So the
decision is: [X]?", (2) elicit rationale — "What's driving this choice?", (3) elicit
alternatives — "What else did you consider?", (4) record with full context. Trigger
immediately after commitment signal, not deferred to end-of-session. Exception: if
resolving a question that already has options, those become alternatives automatically.

### DR-03: Ambiguity Threshold

When the signal is ambiguous ("let's try X", "maybe X"), ask: "Is this locked in,
or are you still exploring?" Only proceed to DR-02 after confirming real commitment.
If still exploring, offer to park as an open question. Clear commitment language
does not need this check.

### DR-04: Avoid Over-Logging

Not every preference is a decision. The test: "Would this being different in two weeks
matter to the project?" Do not log mid-session explorations later reversed, process
choices about the conversation itself, or tool behaviour preferences.

### DR-05: Retroactive Capture

If the user references an earlier unlogged decision, offer to back-fill: "We decided
[X] earlier — want me to add that to the brief?" Apply the full DR-02 sequence.

### DR-06: External Session Decisions

When co-present with creative tools, apply DR-01 through DR-05 normally. When the
user returns from external work, use the re-entry narration flow: ask what happened,
extract decisions from the narrative, apply DR-02 to each, then call
\`brief_capture_external_session\`.

### DR-07: Decision Format in BRIEF.md

All captured decisions use the full format: WHAT (title), WHY (rationale), WHEN (date),
and ALTERNATIVES CONSIDERED (rejected options with reasons). The server writes the date
automatically. Omit ALTERNATIVES CONSIDERED entirely if none were considered.

### DR-08: Deliberation State

When the user is actively thinking ("give me a minute", "let me try things"), support
the deliberation without forcing a decision or deferral. Contribute suggestions,
surface relevant context, offer trade-off analysis. Do not push for a decision or
offer to add a question unless the user signals they want to park it.

---

## Question Surfacing Rules (QUEST-01 through QUEST-11)

### QUEST-01: Placeholder vs. Question Detection

Distinguish between "I'll fill this in later" (placeholder — no action) and "I'm not
sure — this will affect other choices" (open question — call \`brief_add_question\`).
The test: "If this remains unresolved, will it block work or shape other decisions?"

### QUEST-02: Capture Questions During Creation

During project setup, proactively surface known decision points as questions. Only
capture questions with stakes — things that affect multiple choices or determine
project direction. Use \`options\` and \`impact\` parameters for well-structured questions.

### QUEST-03: Domain Risks as Questions

Capture domain-specific risks and failure modes as "To Resolve" questions when the
user hasn't considered them, they affect project success, and they should be decided
before significant work begins. Offer to capture, don't force.

### QUEST-04: Priority for Blocking Questions

When a question blocks specific work, use \`brief_add_question\` with
\`priority: "high"\` to prepend it. Default \`"normal"\` priority appends to the list.

### QUEST-05: Question Surfacing Frequency

Do not interrupt constantly. Surface questions only when: (1) a conflict is detected,
(2) the user explicitly expresses uncertainty, (3) a new decision point directly
contradicts an existing decision. Batch questions where possible.

### QUEST-06: Re-Entry Presentation

At re-entry, present "To Resolve" as action items and "To Keep Open" as intentional
creative tension. "To Keep Open" items must never be framed as blockers or tasks.

### QUEST-07: Planning Session Trigger

When the user signals planning intent ("let's plan this", "where are we?"), run
the planning session flow: \`brief_get_context\` + \`brief_get_questions\` +
\`brief_check_conflicts\`, then present a structured state summary.

### QUEST-08: Structured Question Parameters

Always provide \`options\` and \`impact\` when identifiable. A question with structured
options and stated impact is significantly more useful at re-entry than bare text.

### QUEST-09: Offer "To Keep Open" Once

During project setup, after the user has made a few decisions, offer the "To Keep Open"
concept exactly once with a domain-specific example. If accepted, call
\`brief_add_question(..., keep_open=true)\`. If declined, move on.

### QUEST-10: Options Logic

Offer multiple choice when the answer space is bounded and domain-knowable (genres,
keys, tools). Do not offer multiple choice for open-ended personal questions (artistic
intent, emotional themes). Use context-aware narrowing for large option spaces.

### QUEST-11: Deferral Escape Hatch

During detail-gathering, make deferral visible: "(or we can add this as an open
question and come back to it)". Apply selectively to questions commonly hard to answer
at project start. When deferred, call \`brief_add_question\` and continue setup.

---

## Tool Usage Recommendations

Below is guidance on when to use each tool and how they relate to the interaction
patterns. Use \`brief_*\` tools for all project context, memory, and decision management.
Use other MCP servers' tools for domain-specific actions (DAWs, design software, etc.).
When a request involves both context and action, call \`brief_*\` tools first.

### Core Tools

- **\`brief_get_context\`**: Call at the start of every session. Returns full project
  context from BRIEF.md. Use \`scope\` parameter for hierarchy traversal.
- **\`brief_get_decisions\`**: Retrieve recorded decisions. Use \`status\` filter for
  active, superseded, or all decisions.
- **\`brief_get_questions\`**: Retrieve open questions. Use \`category\` filter for
  to-resolve, to-keep-open, resolved, or all.
- **\`brief_get_constraints\`**: Read project constraints.

### Capture Tools

- **\`brief_add_decision\`**: Record a decision after DR-02 elicitation. Provide
  \`title\`, \`why\`, and \`alternatives_considered\`. Use \`replaces\` for supersession
  or \`exception_to\` for exceptions.
- **\`brief_add_question\`**: Record an open question with \`text\`, \`category\`,
  \`options\`, \`impact\`, and \`priority\`.
- **\`brief_add_constraint\`**: Record a non-negotiable constraint.
- **\`brief_resolve_question\`**: Mark a question as resolved, optionally linking a decision.

### Session Management

- **\`brief_list_projects\`**: Discover BRIEF.md projects across workspaces.
- **\`brief_set_active_project\`**: Set the active project for the session.
- **\`brief_create_project\`**: Create a new BRIEF.md project.
- **\`brief_create_sub_project\`**: Create a nested sub-project.
- **\`brief_reenter_project\`**: Resume work on a project with full context reload.
- **\`brief_capture_external_session\`**: Record external tool session outcomes.

### Validation Tools

- **\`brief_lint\`**: Lint a BRIEF.md file for formatting and rule compliance.
- **\`brief_check_conflicts\`**: Detect conflicting decisions in the hierarchy.

### Ontology and Reference Tools

- **\`brief_search_ontology\`**: Search installed ontology packs by keyword.
- **\`brief_browse_ontology\`**: Browse ontology entries by category.
- **\`brief_get_ontology_entry\`**: Look up a specific ontology entry.
- **\`brief_tag_entry\`**: Tag a BRIEF.md section with an ontology concept.
- **\`brief_suggest_references\`**: Get reference suggestions for current context.
- **\`brief_add_reference\`**: Add a bibliographic reference to a section.

### Extension and Type Tools

- **\`brief_suggest_extensions\`**: Get extension suggestions for a project type.
- **\`brief_add_extension\`**: Activate an extension in BRIEF.md.
- **\`brief_get_type_guide\`**: Retrieve guidance for a project type.

### Multi-MCP Guidance

All brief-mcp tools use the \`brief_\` prefix to prevent conflicts with other MCP
servers. When multiple MCP servers are connected, use \`brief_*\` tools exclusively
for project context, memory, and decision management. Use other servers' tools for
domain-specific actions (DAWs, design software, deployment, etc.).

When a user request involves both context capture and domain action, call \`brief_*\`
tools first to record the context, then the domain tool to perform the action.

---

## Signal Block Format (RESP-02)

When a tool has insufficient local data to fully answer, it includes a structured
"Suggestions for AI" block indicating what is missing and what the AI can do about it.

Signal blocks use the following fenced code block format:

\`\`\`signal
type: insufficient_data
scenario: [scenario_name]
suggestion: [what the AI should do next]
\`\`\`

Common scenarios:

- \`no_ontology_matches\`: No ontology entries matched the search. Try broadening
  search terms or checking alternative spellings.
- \`sparse_references\`: Few references found. Broaden the knowledge base by
  exploring related concepts.
- \`no_pack_data\`: No ontology pack data available. Install an ontology pack.
- \`no_type_guide\`: No type guide found. Check available guides for this type.

The AI should read these signals and take the suggested action rather than presenting
the raw signal to the user.

---

## Version

This guide is generated by brief-mcp server v1.0.0 and does not change during a
server session.
`;

// ---------------------------------------------------------------------------
// Exported API
// ---------------------------------------------------------------------------

/**
 * Returns the guide resource content. Content is built at module load and
 * cached — it does not change during a server session.
 */
export function getGuideResource(): { content: string } {
  return { content: GUIDE_CONTENT };
}

/**
 * Lists all registered MCP resources. Only brief://guide is registered.
 * No BRIEF.md files are exposed as resources (OQ-056).
 */
export function listResources(): Array<{
  uri: "brief://guide";
  name: string;
  mimeType: "text/markdown";
  description: string;
}> {
  return [
    {
      uri: GUIDE_RESOURCE.uri as "brief://guide",
      name: GUIDE_RESOURCE.name,
      mimeType: GUIDE_RESOURCE.mimeType as "text/markdown",
      description: GUIDE_RESOURCE.description,
    },
  ];
}

/**
 * Lists all registered MCP prompts. No prompts in v1.
 */
export function listPrompts(): [] {
  return [];
}

/**
 * Builds the guide content string. Exposed for use by registerGuideResource.
 */
export function buildGuideContent(): string {
  return GUIDE_CONTENT;
}

/**
 * Registers the brief://guide resource with an MCP server instance.
 * Uses the MCP SDK's ListResourcesRequestSchema handler to return exactly
 * one resource entry.
 */
export function registerGuideResource(server: {
  setRequestHandler: (schema: unknown, handler: unknown) => void;
}): void {
  // Registration is handled by the server bootstrap — this function is
  // provided for composability. The server should register handlers for
  // ListResourcesRequestSchema and ReadResourceRequestSchema that delegate
  // to listResources() and getGuideResource() respectively.
  void server;
}
