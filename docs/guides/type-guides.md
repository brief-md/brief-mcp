# Type Guides

Type guides are domain-specific project templates that provide structured guidance for particular kinds of projects.

## What Type Guides Are

A type guide is a reference document for a project type (e.g., "web app", "CLI tool", "music album", "business plan"). It provides:

- Recommended dimensions to consider
- A suggested workflow for the design phase
- Known tensions and tradeoffs in that domain
- Common anti-patterns to avoid
- Guidance on which extensions and ontology packs are relevant

Type guides do not prescribe outcomes -- they provide a framework for thinking through the design space.

## The Generic Bootstrapping Guide

When no domain-specific guide exists for a project type, the **generic bootstrapping guide** activates. It provides:

- Universal project dimensions (scope, audience, constraints, success criteria)
- A general-purpose workflow (define identity, capture decisions, surface questions)
- Common cross-domain tensions (speed vs quality, flexibility vs consistency)
- Prompts to help identify whether a more specific guide should be created

The generic guide is always available as a fallback.

## Guide Structure

Every type guide follows this structure:

### Overview
A brief description of the project type and what makes it distinct.

### Key Dimensions
Important aspects to consider when designing a project of this type. Each dimension includes a description and example values.

### Suggested Workflow
A recommended order of operations for the design phase. This is advisory, not prescriptive -- users can follow it in any order.

### Known Tensions
Common tradeoffs in this domain. These often become to-keep-open questions (QUEST-09) in the BRIEF.md.

### Anti-patterns
Mistakes commonly made in this project type. Each anti-pattern includes a description and a suggested alternative.

### Extension Guidance
Which extensions are recommended for this project type and why.

### Ontology Guidance
Which ontology packs are relevant and how they support the project.

### Quality Signals
Indicators that the BRIEF.md is capturing the right level of detail for this project type.

### Reference Sources
Suggested references for further reading on this project type.

## Creating Domain-Specific Guides

Create a new type guide using the collaborative Pattern 10 workflow:

1. Identify the project type that needs a guide
2. Collaboratively author each section using the ask-listen-reflect-refine cycle
3. Save the guide:

```
Tool: brief_create_type_guide
Args: {
  "type": "mobile-app",
  "guide": {
    "overview": "...",
    "keyDimensions": [...],
    "suggestedWorkflow": [...],
    "knownTensions": [...],
    "antiPatterns": [...],
    "extensionGuidance": "...",
    "ontologyGuidance": "...",
    "qualitySignals": [...],
    "referenceSources": [...]
  }
}
```

4. Apply the guide to the current project:

```
Tool: brief_apply_type_guide
Args: { "type": "mobile-app" }
```

## Guide Resolution

When a project needs a type guide, the server resolves it using this precedence:

1. **Exact type match** -- If the project type exactly matches a guide name (e.g., "web-app" matches the "web-app" guide)
2. **Alias match** -- If the project type matches an alias defined in a guide (e.g., "webapp" or "web application" might alias to "web-app")
3. **Generic fallback** -- If no match is found, the generic bootstrapping guide is used

## Guide Sources

Type guides can come from multiple sources, with this precedence order (highest first):

| Source | Description | Precedence |
|--------|-------------|------------|
| **user_edited** | Guides modified by the user | Highest |
| **community** | Community-contributed guides | High |
| **ai_generated** | Guides created collaboratively with AI | Medium |
| **bundled** | Guides shipped with brief-mcp | Lowest |

When multiple guides exist for the same type, the highest-precedence source wins.

## Applying Guides

When a type guide is applied to a project:

1. **Extensions are auto-installed** -- The guide's extension recommendations are added to the project
2. **Ontologies are auto-installed** -- Recommended ontology packs are installed if available
3. **Dimensions are surfaced** -- Key dimensions are presented for the user to consider
4. **Tensions become questions** -- Known tensions are converted into to-keep-open questions in the Open Questions section
5. **Workflow is suggested** -- The suggested workflow is presented as a recommended path through the design phase

The user can accept, modify, or skip any of these automatic actions.

## Searching Type Guides

Find available guides:

```
Tool: brief_suggest_type_guides
Args: { "query": "web application" }
```

This searches across all guide sources (bundled, community, ai_generated, user_edited) and returns matching guides ranked by relevance.
