# Interaction Patterns

The brief-mcp server defines 11 interaction patterns that guide how an AI assistant should work with BRIEF.md files. These patterns are exposed via the `brief://guide` resource.

## Pattern 1: Session Start

How to begin a session depends on whether the project is new or existing.

### New project
1. Call `brief_create_project` with the project path, name, and description
2. Follow the setup phase flow: needs_identity, choose_type_guide, explore_type, review_suggestions
3. Begin collaborative section authoring (Pattern 8)

### Existing project
1. Call `brief_reenter_project` with the project path
2. Review the returned context summary: recent decisions, open questions, lifecycle phase
3. Present a brief summary to the user and ask what they want to work on
4. If the user mentions work done outside the session, use Pattern 4 (External Session)

## Pattern 2: Decision Capture

When the user makes a commitment, capture it as a formal decision.

1. **Detect commitment signals** -- Listen for language like "let's go with", "I've decided", "we'll use", "locked in on" (see DR-01)
2. **Confirm** -- "It sounds like you've decided X. Should I record that?"
3. **Elicit rationale** -- "What drove that choice?"
4. **Elicit alternatives** -- "What else did you consider?"
5. **Record** -- Call `brief_add_decision` with WHAT, WHY, WHEN, and ALTERNATIVES CONSIDERED

## Pattern 3: Question Surfacing

Surface unknowns and tensions as the conversation progresses.

1. **Detect placeholders** -- Distinguish genuine questions from rhetorical ones or placeholders (QUEST-01)
2. **Categorize** -- Is this a to-resolve question (needs an answer) or a to-keep-open question (intentional tension)?
3. **Limit frequency** -- Surface at most 3 questions per response; batch related questions (QUEST-05)
4. **Record** -- Call `brief_add_question` with the question text, options, and impact

## Pattern 4: External Session

When the user mentions work done in another tool (e.g., a design tool, a coding session, a meeting):

1. Ask the user to narrate what happened
2. Listen for decisions made during that session
3. Call `brief_capture_external_session` with the session summary
4. Apply DR-06 to capture any decisions from the narration

## Pattern 5: Conflict Resolution

When contradictions are detected between decisions:

1. Present the conflicting decisions clearly, showing both sides
2. Explain why they conflict (semantic analysis or domain-specific pattern)
3. Offer resolution options:
   - **Supersede** -- One decision replaces the other
   - **Exception** -- One applies in a specific context
   - **Clarify** -- The conflict is apparent, not real; clarify both
4. Record the resolution

## Pattern 6: Extension Setup

Adding a domain-specific extension follows an 8-step workflow:

1. **Suggest** -- Call `brief_suggest_extensions` based on project type
2. **Review** -- Present suggested extensions with descriptions
3. **Select** -- User chooses which extensions to add
4. **Design** (optional) -- For custom extensions, call `brief_design_extension`
5. **Confirm** -- Review the extension's subsections before adding
6. **Add** -- Call `brief_add_extension` to install it
7. **Populate** -- Collaboratively fill in the extension's subsections
8. **Validate** -- Check that key subsections have meaningful content

## Pattern 7: Ontology Exploration

Working with ontology packs:

1. **Search** -- Call `brief_search_ontology` with keywords to find relevant entries
2. **Browse** -- Call `brief_browse_ontology` to explore parent/child relationships
3. **Tag** -- Call `brief_tag_entry` to link ontology entries to BRIEF.md sections
4. **Review** -- Call `brief_list_tags` to see all tagged entries

## Pattern 8: Collaborative Section Authoring

The ask-listen-reflect-refine cycle for writing BRIEF.md sections:

1. **Ask** -- Pose a focused question about the section's content
2. **Listen** -- Let the user explain in their own words
3. **Reflect** -- Summarize what you heard and check understanding
4. **Refine** -- Draft section content, present for approval, then call `brief_update_section`

Repeat until the section captures the user's intent accurately.

## Pattern 9: Type Guide Review

When presenting a type guide for approval:

1. Call `brief_get_type_guide` to retrieve the guide
2. Present the overview and key dimensions
3. Walk through each dimension, asking if it applies
4. Present the suggested workflow
5. Discuss known tensions and anti-patterns
6. Ask for approval or modifications
7. Call `brief_apply_type_guide` to apply the approved guide

## Pattern 10: Type Guide Creation

Creating a new domain-specific type guide collaboratively:

1. Identify the project type that needs a guide
2. Collaboratively author each section:
   - Overview
   - Key Dimensions
   - Suggested Workflow
   - Known Tensions
   - Anti-patterns
   - Extension Guidance
   - Ontology Guidance
   - Quality Signals
   - Reference Sources
3. Call `brief_create_type_guide` to save the guide
4. Apply it to the current project

## Pattern 11: Build Scaffolding

Generating implementation artifacts from the BRIEF.md:

1. Review the BRIEF.md for completeness (all core sections populated, key decisions made)
2. Generate task packets -- discrete work items derived from decisions and architecture
3. Generate implementation stubs -- skeleton code or configuration files
4. Update the lifecycle phase to Scaffold or Build

## Additional Guidance

### Validation Checkpoints

Periodically validate the BRIEF.md:
- Run `brief_lint` to check for structural issues
- Run `brief_check_conflicts` to detect contradictory decisions
- Review open questions and resolve any that have been answered

### Sub-Project Population Guidance

When creating child projects:
- Inherit relevant parent context but keep the child's BRIEF.md self-contained
- Reference parent decisions rather than duplicating them
- Identify where the child project diverges from parent assumptions

### Milestone Synthesis

At natural stopping points:
- Summarize progress since the last milestone
- Review which questions have been resolved
- Identify any new questions or tensions
- Update the BRIEF.md version

### Session End Guidance

Before ending a session:
- Check for any uncaptured decisions from the conversation
- Surface any unrecorded questions
- Summarize what changed during the session
- Suggest what to focus on next time
