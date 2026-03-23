# Core Concepts

## BRIEF.md File Format

A BRIEF.md file is a markdown document that captures the intent, decisions, and context of a project. It is:

- **Human-readable** -- Plain markdown, viewable in any editor or on GitHub
- **Machine-parseable** -- Structured sections with consistent formatting
- **Project-scoped** -- One BRIEF.md per project, living in the project root

## Core Sections

Every BRIEF.md contains these foundational sections:

| Section | Purpose |
|---------|---------|
| **What This Is** | Clear statement of what the project does |
| **What This Is NOT** | Explicit boundaries and out-of-scope items |
| **Why This Exists** | Motivation and problem being solved |
| **Key Decisions** | Recorded decisions with rationale |
| **Open Questions** | Unresolved questions and intentional tensions |

Additional sections may be added by extensions or through direct editing.

## Metadata

The BRIEF.md header contains structured metadata:

```markdown
<!-- BRIEF META
Project: My App
Type: web-app
Created: 2025-01-15
Extensions: SYSTEM DESIGN, STRATEGIC PLANNING
Status: Design
Updated: 2025-01-20
Version: 3
-->
```

| Field | Description |
|-------|-------------|
| **Project** | Project name |
| **Type** | Project type (maps to type guides) |
| **Created** | Creation date |
| **Extensions** | Comma-separated list of active extensions |
| **Status** | Current lifecycle phase |
| **Updated** | Last modification date |
| **Version** | Incremented on each write |

## Project Hierarchy

Projects can be nested in a folder-based hierarchy:

```
~/projects/
  platform/
    BRIEF.md          <- parent project
    api-service/
      BRIEF.md        <- child project
    web-frontend/
      BRIEF.md        <- child project
```

Key principles:

- **Parent advisory, not prescriptive** -- A parent project's decisions inform but do not override children. Child projects can make different choices with explicit rationale.
- **Context walks upward** -- When reading context, the server walks up the directory tree to gather parent context, giving child projects awareness of the broader system.
- **Depth limit** -- Hierarchy depth is limited to 10 levels by default.

## Lifecycle Phases

Projects progress through three lifecycle phases:

| Phase | Description |
|-------|-------------|
| **Design** | Capturing intent, making architectural decisions, exploring the problem space |
| **Scaffold** | Generating initial structure, task packets, and implementation stubs |
| **Build** | Active implementation, with the BRIEF.md serving as living reference |

The lifecycle phase is tracked in the `Status` metadata field.

## Setup Phases

When a project is first created, it goes through four setup phases before entering the Design lifecycle:

1. **needs_identity** -- Establish what the project is, what it is not, and why it exists
2. **choose_type_guide** -- Select a domain-specific type guide or use the generic fallback
3. **explore_type** -- Review the selected guide's dimensions, workflows, and tensions
4. **review_suggestions** -- Approve or skip suggested extensions and ontology packs

## Decisions

Decisions are the backbone of a BRIEF.md. Each decision follows a structured format:

```markdown
### Key Decisions

- **WHAT**: Use PostgreSQL for the primary data store
  **WHY**: Need relational queries and ACID transactions
  **WHEN**: 2025-01-15
  **ALTERNATIVES CONSIDERED**: MongoDB (rejected: schema flexibility not needed), SQLite (rejected: concurrent access limitations)
```

Key concepts:

- **Supersession** -- A new decision can supersede an earlier one. The old decision is preserved with a note pointing to the replacement.
- **Exceptions** -- A child project can declare an exception to a parent decision with explicit rationale.

## Questions

Questions come in two categories:

### To-Resolve Questions

Questions that need answers before the project can proceed:

```markdown
### Open Questions

- [ ] How will we handle authentication for the API?
  - Options: JWT tokens, OAuth2, session cookies
  - Impact: Affects all endpoint security
```

### To-Keep-Open Questions

Intentional tensions that should remain unresolved -- they represent ongoing tradeoffs:

```markdown
- [~] How much consistency vs availability do we prioritize?
  - This is an inherent tension in distributed systems
  - Keeping this open forces per-feature evaluation
```

## Extensions

Extensions add domain-specific sections to a BRIEF.md. They provide structured vocabulary for specific project types.

- **Built-in extensions** include SONIC ARTS, NARRATIVE CREATIVE, LYRICAL CRAFT, VISUAL STORYTELLING, STRATEGIC PLANNING, and SYSTEM DESIGN.
- **Custom extensions** can be designed collaboratively and added to any project.

Each extension defines subsections that can be either:
- **Freeform** -- Free-text content for narrative descriptions
- **Structured** -- Linked to ontology datasets, rendered as markdown tables

## Ontology Packs

Ontology packs provide shared vocabulary for specific domains. They contain entries organized in parent/child relationships.

Example: A "music-theory" ontology pack might contain entries for scales, modes, chord types, and instruments, each with properties and relationships.

Packs can be:
- Installed from a local path, URL, or Hugging Face
- Searched by keyword
- Browsed by navigating parent/child relationships
- Used to tag BRIEF.md sections with specific domain terms

## Type Guides

Type guides are domain-specific project templates that provide:
- **Key Dimensions** -- Important aspects to consider for that project type
- **Suggested Workflow** -- Recommended order of operations
- **Known Tensions** -- Common tradeoffs in that domain
- **Anti-patterns** -- Mistakes to avoid
- **Extension Guidance** -- Which extensions suit that project type
- **Ontology Guidance** -- Relevant ontology packs

Type guides are resolved by project type: exact type match, then alias match, then generic fallback.

## References

References are bibliographic entries linked to BRIEF.md sections and ontology entries. They provide external sources that support decisions, inform design choices, or offer additional context.

References include structured fields for creator, title, year, type, URL, and relevance annotations linking them to specific sections or ontology entries.
