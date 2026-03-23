# Question Surfacing Rules

Not every unknown is worth tracking, but the ones that block progress or shape other decisions need to be captured before they slip out of the conversation. When you return to a project after a break, knowing what's still open is as important as knowing what's been decided.

QUEST-01 through QUEST-12 govern how the AI distinguishes genuine open questions from passing uncertainties, and how it surfaces them without interrupting flow.

## QUEST-01: Placeholder vs Question Detection

Distinguish between genuine questions and placeholders:

- **Genuine question**: An unknown that needs investigation or a decision ("How will we handle authentication?")
- **Placeholder**: A rhetorical device or a section heading disguised as a question ("What is this project?")

Only record genuine questions. Placeholders belong in section content, not in the Open Questions section.

Signals that something is a genuine question:
- Multiple valid answers exist
- The answer affects downstream decisions
- The user explicitly expresses uncertainty
- Domain risks are involved

## QUEST-02: Capture During Creation

During project creation and the setup phase, capture questions that arise naturally:

- Questions surfaced by the type guide's "Known Tensions" section
- Questions triggered by extension subsections that lack obvious answers
- Questions about scope boundaries ("Does this include X?")

Record these immediately rather than waiting for a dedicated question-surfacing pass.

## QUEST-03: Domain Risks as Questions

Domain-specific risks should be surfaced as questions. For example:

- **Web app**: "How will we handle session management across multiple servers?"
- **Music production**: "What is the target loudness standard for the final master?"
- **Business strategy**: "What happens if competitor X launches a similar product first?"

Type guides provide domain-specific risk patterns that can be converted into questions.

## QUEST-04: Priority for Blocking Questions

Questions that block progress should be surfaced with higher priority:

- Questions that must be answered before a decision can be made
- Questions where the answer changes the project architecture
- Questions that affect multiple sections or child projects

Mark blocking questions with clear impact statements so the user understands why they need attention.

## QUEST-05: Question Surfacing Frequency

Limit question surfacing to avoid overwhelming the user:

- **Maximum 3 questions per response**
- **Batch related questions** -- If you have 5 questions about authentication, group them
- **Prioritize** -- Surface blocking questions before nice-to-have questions
- **Space them out** -- Do not surface all questions at once; spread across the conversation

## QUEST-06: Re-entry Question Presentation

When re-entering a project (`brief_reenter_project`), present open questions as part of the context summary:

1. List the most critical open questions (top 3)
2. Note how many total questions remain open
3. Ask if the user wants to address any of them in this session
4. If questions have been resolved since the last session, note that

## QUEST-07: Planning Triggers

Certain moments in the conversation naturally trigger question surfacing:

- When a new section is being authored
- When a decision is made that creates downstream unknowns
- When the user mentions a new stakeholder or constraint
- When transitioning between lifecycle phases

At these moments, pause to ask: "This raises a few questions we should track..."

## QUEST-08: Structured Parameters

When recording a question, include structured parameters:

```markdown
- [ ] How will we handle API rate limiting?
  - Options: Token bucket, sliding window, fixed window
  - Impact: Affects API gateway design and client SDK behavior
```

- **Options** -- Known possible answers or approaches
- **Impact** -- What parts of the project are affected by the answer

These parameters help future readers understand the question's scope and urgency.

## QUEST-09: To-Keep-Open Mechanics

Some questions should remain intentionally unresolved. These represent ongoing tensions or tradeoffs:

```markdown
- [~] How much do we optimize for developer experience vs runtime performance?
  - This tension should be evaluated per-feature, not resolved globally
```

Use the `[~]` marker for to-keep-open questions. These are not failures to decide -- they are deliberate choices to maintain flexibility.

Characteristics of to-keep-open questions:
- The "right answer" depends on context that changes
- Resolving it globally would lose important nuance
- The tension itself drives better per-case decisions

## QUEST-10: Deferral Escape Hatch

When the user defers a question ("Let's think about that later"):

1. Record the question so it is not lost
2. Do not pressure the user to answer now
3. Note the deferral so it can be resurfaced in a future session
4. If the question is blocking, mention that gently: "Just flagging -- this one may block the API design later"

## QUEST-11: Recommend-First Posture

When surfacing a question, offer a recommendation if you have one:

Instead of: "How should we handle logging?"

Say: "For logging, I'd recommend structured JSON logs with a correlation ID. That supports both debugging and monitoring. Does that approach work, or do you have a different preference?"

This respects the user's time and moves the conversation forward.

## QUEST-12: Lead with Recommendations

An extension of QUEST-11: always lead with a recommendation rather than an open-ended question.

- **Do**: "I recommend using JWT tokens for API authentication because they're stateless and work well with your microservices architecture. The main tradeoff is token size. Shall I record that as a decision?"
- **Don't**: "What authentication mechanism should we use for the API?"

Leading with recommendations:
- Demonstrates domain knowledge
- Gives the user something concrete to react to
- Moves faster than open-ended exploration
- Still leaves room for the user to disagree or suggest alternatives
