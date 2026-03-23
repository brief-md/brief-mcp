# Decision Recognition Rules

Nine rules (DR-01 through DR-09) govern how decisions are detected, elicited, and recorded in BRIEF.md files.

## DR-01: Decision Signal Detection

Detect commitment language in the user's statements. Common signals include:

- **Definitive statements**: "Let's go with X", "We'll use X", "I've decided on X"
- **Comparative conclusions**: "X is better than Y because..."
- **Elimination language**: "We can rule out X", "X is off the table"
- **Commitment phrases**: "Locked in", "Final answer", "That's the plan"
- **Implicit decisions**: "We need X" (when stated as fact, not question)

Not all statements are decisions. Distinguish between:
- **Exploring** -- "I'm thinking about X" (not a decision)
- **Deciding** -- "Let's go with X" (a decision)
- **Wondering** -- "What if we used X?" (a question, not a decision)

## DR-02: Elicitation Sequence

When a decision signal is detected, follow this four-step sequence:

1. **Confirm** -- "It sounds like you've decided to use PostgreSQL. Should I record that as a key decision?"
2. **Elicit rationale** -- "What's driving that choice?" or "What makes PostgreSQL the right fit here?"
3. **Elicit alternatives** -- "What other options did you consider?" or "Was anything else on the table?"
4. **Record** -- Call `brief_add_decision` with the structured WHAT/WHY/WHEN/ALTERNATIVES CONSIDERED format

Do not skip steps. If the user has already provided rationale or alternatives in their statement, confirm rather than re-ask.

## DR-03: Ambiguity Threshold

When it is unclear whether the user is exploring or committing, ask directly:

> "Are you locked in on that, or still exploring?"

This single question resolves the ambiguity without being pushy. If the user is still exploring, note it as a potential decision to revisit later.

## DR-04: Avoid Over-Logging

Apply the "two weeks" test: Would this decision still matter if someone re-read the BRIEF.md in two weeks?

Do not log:
- Trivial implementation details ("Use camelCase for variable names")
- Temporary workarounds that will be replaced
- Preferences with no meaningful alternatives ("Use UTF-8 encoding")

Do log:
- Technology choices (databases, frameworks, languages)
- Architecture decisions (monolith vs microservices, sync vs async)
- Design tradeoffs (consistency vs availability, performance vs simplicity)
- Scope decisions (what is in scope, what is explicitly excluded)

## DR-05: Retroactive Capture

Sometimes decisions are mentioned in passing without triggering DR-01 signals. When you notice a past decision that was not captured:

1. Acknowledge it: "Earlier you mentioned using Redis for caching. That sounds like a key decision."
2. Follow the elicitation sequence (DR-02) to fill in rationale and alternatives
3. Record it with the `WHEN` field set to when the decision was actually made, not when it was recorded

## DR-06: External Session Decisions

When the user reports decisions made outside the current session (in meetings, coding sessions, design reviews):

1. Ask the user to narrate what happened
2. Listen for decision signals within the narration
3. For each detected decision, apply DR-02 (elicitation sequence)
4. Record with a note that the decision originated from an external session
5. Use `brief_capture_external_session` to record the session context

## DR-07: Decision Format

Every recorded decision uses this structure:

```markdown
- **WHAT**: [Clear statement of the decision]
  **WHY**: [Rationale -- what drove this choice]
  **WHEN**: [Date the decision was made]
  **ALTERNATIVES CONSIDERED**: [What else was considered and why it was rejected]
```

Guidelines:
- **WHAT** should be a single, clear sentence
- **WHY** should explain the reasoning, not restate the decision
- **WHEN** should be a date (ISO format preferred)
- **ALTERNATIVES CONSIDERED** should list each alternative with a brief reason for rejection

## DR-08: Deliberation State

Not every discussion needs to end in a decision. Support active thinking by:

- Acknowledging when the user is deliberately exploring without committing
- Recording the exploration as an open question (QUEST-09) if it represents an intentional tension
- Not pressuring the user to decide prematurely
- Summarizing the tradeoffs discussed so the exploration is not lost

## DR-09: Post-Section Decision Sweep

After completing a section of collaborative authoring (Pattern 8), sweep the preceding conversation for any decisions that were made but not captured.

Steps:
1. Review the conversation since the last decision capture
2. Identify any commitment language that was not flagged
3. For each missed decision, apply DR-02
4. Present all discovered decisions at once for batch confirmation

This prevents decisions from falling through the cracks during extended authoring sessions.
