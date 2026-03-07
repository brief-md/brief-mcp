# TASK-23: Workspace — Re-Entry & Tutorial

## Metadata
- Priority: 25
- Status: pending
- Dependencies: TASK-06, TASK-18, TASK-24, TASK-30
- Module path: src/workspace/
- Type stubs: src/types/workspace.ts
- Also read: src/types/hierarchy.ts, src/types/config.ts
- Test file: tests/workspace/reentry.test.ts
- Estimated context KB: 45

## What To Build

Implement `brief_reenter_project`, `brief_start_tutorial`, and `brief_set_tutorial_dismissed` MCP tools. The re-entry tool generates a structured summary of a project's current state for returning users — including identity, status, time since last update, key decisions, open questions, tensions, sub-projects, ontology tags, and conflicts. The tutorial tools manage a 5-topic conversational tutorial that is woven into first-project creation and available on demand.

## Implementation Guide

1. `src/workspace/reentry.ts` — re-entry summary generation.

2. `brief_reenter_project` handler: accept project identifier (name or path) and optional `include_history` parameter. Implicitly sets the active project. Read the full hierarchy via T18's context assembly. Assemble a structured summary containing:
   - Project identity (name, type, status)
   - Time since last update (human-readable: "3 days ago", "2 weeks ago")
   - Key decisions (active only by default, newest first; superseded count shown)
   - Open questions (To Resolve and To Keep Open, with counts)
   - Recent changes (based on Updated timestamps)
   - Intentional tensions
   - Sub-project listing (via T19's downward scan)
   - Ontology tag summary
   - Conflict detection results (via T30)
   - External session prompt: "Did you work in any external tools since [last_update]?"

3. `include_history` parameter: when true, include full decision chains (superseded decisions) in the summary. Default false.

4. `src/workspace/tutorial.ts` — tutorial management.

5. `brief_start_tutorial` handler: return the 5-topic tutorial structure (Decisions, Open Questions, Deferral, To Keep Open, Re-entry). Always works regardless of tutorial_dismissed config state.

6. `brief_set_tutorial_dismissed` handler: accept `permanent` boolean. Set `tutorial_dismissed` in config.json via T06. When true, the auto-trigger on first project creation is suppressed.

7. Tutorial trigger: when `brief_create_project` response includes `first_project: true`, the AI offers the tutorial. The tutorial content is woven into the setup conversation — topics are narrated as they arise naturally, never blocking progress.

8. **Zero open questions and conflicts (positive state):** When `brief_reenter_project` assembles the re-entry summary and finds zero open questions and zero conflicts, include a structured signal in the response: `{ open_questions_count: 0, conflicts_count: 0, positive_state: true }`. The re-entry summary is still rich with decision history and project context — a planning session is never a no-op. Reference OQ-090c.

## Exported API

Export from `src/workspace/reentry.ts`:
- `generateReentrySummary(options: { projectPath: string; includeHistory?: boolean; simulateEmpty?: boolean }) → { identity: object; status: string; timeSinceUpdate: string; decisions: any; openQuestions: { toResolveCount: number; toKeepOpenCount: number }; decisionHistory?: any; supersededCount?: number; externalSessionPrompt: any; subProjects: any; activeProjectSet: boolean; positiveState?: boolean; conflicts: any; ontologyTagSummary: { taggedEntries: number; packsUsed: number }; recentChanges: any; intentionalTensions: any }`
- `startTutorial() → { topics: any[] }` — returns exactly 5 topics
- `setTutorialDismissed(options: { permanent: boolean }) → { tutorialDismissed: boolean }`

## Rules

### TUT-01: First-Project Trigger
When `brief_create_project` is called and the server response includes `"first_project": true` (set when no other projects exist in any workspace root), the AI MUST offer the tutorial before beginning the setup conversation:

> "Before we set this up — want a quick 2-minute tour of how this works? I can show you how decisions, open questions, and deferral work as we go. Or we can just dive straight in."

The offer is made once, conversationally. It is not a formal prompt or wizard step.

**Skip response:** If the user says "skip", "no", "just start", or any equivalent: the AI MUST ask "Want me to never show this again?" If yes, call `brief_set_tutorial_dismissed(permanent=true)`. If no, the tutorial will offer again next session.

**Accept response:** If the user says "yes" or "sure": run the tutorial inline as the project is being set up (TUT-03).

### TUT-02: On-Demand Access
The tutorial is always available via `brief_start_tutorial`. Users who dismissed it can access it any time. Calling this tool returns the tutorial structure for the AI to walk through conversationally.

There is no "reset" needed — `brief_start_tutorial` always works regardless of `tutorial_dismissed` config state.

### TUT-03: Tutorial Content and Flow
The tutorial is not a separate script — it is woven into the first project creation conversation. As the AI sets up the project, it narrates what each concept means when it first appears. The topics and their natural trigger points:

| Topic | When narrated | What to say |
|---|---|---|
| **Decisions** | When the user first commits to something | "I just noticed you made a decision — [X]. I'll record that in your BRIEF.md. Decisions are permanent choices that shape the project going forward." |
| **Open questions** | When the user first says "not sure" | "No problem — I can note that as an open question. These are things you haven't decided yet but don't want to forget. You'll see them at re-entry." |
| **Deferral** | After the first open question is created | "Any question I ask, you can always say 'not sure yet' and I'll save it for later. You don't have to have everything figured out to start." |
| **To Keep Open** | After 3–4 decisions have been made | "Some things in creative work are intentionally unresolved — they're tensions you want to keep, not problems to solve. Want me to show you how to mark something as 'keep open'?" (QUEST-09 offer) |
| **Re-entry** | At the end of project setup | "When you come back to this project later, I'll give you a summary of where you left off — decisions made, questions still open, anything that needs attention." |

The AI delivers each topic in 1–2 sentences maximum. This is orientation, not a manual.

### TUT-04: Tutorial Completion
After all five topics have been introduced (or at the end of the first setup session), the AI says:

> "That's the basics. You can always ask me 'how does this work?' or run a tutorial any time with 'start tutorial'. Want to keep going with [project name]?"

If the tutorial was triggered automatically (not via `brief_start_tutorial`), the AI MUST ask: "Want me to stop showing this intro for new projects?" If yes: call `brief_set_tutorial_dismissed(permanent=true)`.

### TUT-05: Tutorial Does Not Block Progress
The tutorial MUST NOT delay, pause, or interrupt the actual setup work. Topics are introduced as they arise naturally. If the user is on a roll describing their project, the AI captures it and introduces tutorial context in the same response — not as a separate step that waits for acknowledgement.

Tutorial narration appears after the operational response, not before it. The project always moves forward.

### TUT-06: Tutorial State in Config
The server maintains tutorial state in `~/.brief/config.json`:
- `"tutorial_dismissed": false` — default; tutorial is offered on first project
- `"tutorial_dismissed": true` — set when user says "never show again"; tutorial is never auto-triggered again

`brief_start_tutorial` always works regardless of this flag. The flag only controls the automatic first-project trigger (TUT-01). `brief_set_tutorial_dismissed(permanent)` sets the flag.

## Test Specification

### Unit Tests (specific input → expected output)
- Re-enter project → summary includes identity, status, time since last update
- Re-enter project with decisions → active decisions listed newest first, superseded count shown
- Re-enter project with open questions → To Resolve and To Keep Open counts and items included
- Re-enter project with include_history → full decision chains included
- Re-enter project without include_history → only active decisions, superseded count only
- Re-enter project → external session prompt included
- Re-enter project with sub-projects → sub-project listing included
- Re-enter project → implicitly sets active project
- Start tutorial → returns 5-topic structure regardless of dismissed state
- Start tutorial after dismissal → still works, returns full structure
- Set tutorial dismissed with permanent=true → config updated, flag is true
- Set tutorial dismissed with permanent=false → config updated, flag is false
- Re-entry summary with conflicts → conflict detection results included
- Re-entry project with zero open questions and zero conflicts → response indicates a positive project state, with zero counts for both open questions and conflicts

### Property Tests (invariants that hold for ALL inputs)
- forAll(project): re-entry always produces a structured summary, never throws
- forAll(tutorial dismissed state): brief_start_tutorial always returns tutorial structure
- forAll(config modification): tutorial_dismissed flag persists to disk immediately

## Tier 4 Criteria

Tier 4 criteria: JC-02, JC-07, JC-09
