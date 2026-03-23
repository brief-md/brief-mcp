# Conflict Detection

brief-mcp detects contradictions between decisions -- both within a single project and across the project hierarchy.

## Cross-Hierarchy Conflict Detection

When projects are nested in a hierarchy, decisions at different levels can conflict:

```
platform/BRIEF.md
  Decision: "Use REST for all inter-service communication"

platform/api-service/BRIEF.md
  Decision: "Use gRPC for the data pipeline"
```

The server detects these conflicts by:

1. Walking up the hierarchy from the current project to all ancestors
2. Comparing decisions across levels using semantic analysis
3. Flagging conflicts with the section where each decision originated

Cross-hierarchy conflicts are surfaced when:
- A new decision is added that conflicts with an ancestor's decision
- Re-entering a project (`brief_reenter_project`) triggers a conflict scan
- Explicitly running `brief_check_conflicts`

## Within-Project Conflicts

Contradictions can also occur within a single project:

```markdown
### Key Decisions
- **WHAT**: Minimize external dependencies
  **WHY**: Reduce supply chain risk
  **WHEN**: 2025-01-10

- **WHAT**: Use Redis, RabbitMQ, and Elasticsearch
  **WHY**: Best-in-class tools for each concern
  **WHEN**: 2025-01-15
```

These two decisions are in tension -- minimizing dependencies while adopting three external services. The server detects this through semantic analysis of decision content.

## Semantic Analysis

Conflict detection uses AI-powered semantic analysis via the MCP client's sampling capability:

1. **Decision pairs** are compared for semantic contradiction
2. **Domain context** from the type guide provides domain-specific conflict patterns
3. **Confidence scores** indicate how likely the conflict is genuine vs. apparent

The analysis distinguishes between:
- **Direct contradictions** -- Two decisions that cannot both be true
- **Tensions** -- Two decisions that create tradeoffs but can coexist with careful handling
- **False positives** -- Decisions that appear to conflict but are actually compatible

## Domain-Specific Conflict Patterns

Type guides define conflict patterns common in their domain. For example:

**Software projects:**
- Stateless architecture vs. session-based features
- Microservices vs. shared database
- Real-time requirements vs. eventual consistency

**Music production:**
- Lo-fi aesthetic vs. high-fidelity mastering targets
- Analog warmth vs. digital precision
- Dense arrangement vs. minimalist production

**Business strategy:**
- Growth targets vs. profitability targets
- Speed to market vs. product quality
- Broad market vs. niche focus

These patterns help the server detect conflicts that might not be obvious from the text alone.

## Resolving Conflicts

When a conflict is detected, there are three resolution paths:

### Supersession

One decision replaces the other. The superseded decision is preserved with a note:

```markdown
- **WHAT**: ~~Use REST for all inter-service communication~~ (superseded by: Use gRPC for data pipeline)
```

Use `brief_add_decision` with a reference to the superseded decision.

### Exception

The conflicting decision applies in a specific context, while the original remains the default:

```markdown
- **WHAT**: Use gRPC for the data pipeline
  **WHY**: REST overhead is too high for the data volume in this specific service
  **EXCEPTION TO**: "Use REST for all inter-service communication" (parent project)
```

Exceptions are valid in child projects that need to deviate from parent decisions.

### Clarification

The conflict is apparent, not real. Both decisions are compatible when properly understood:

```markdown
- **WHAT**: Minimize external dependencies (for application logic)
- **WHAT**: Use Redis for caching (infrastructure layer, not application dependency)
```

Add clarifying context to both decisions to explain why they do not actually conflict.

## Running Conflict Detection

### Automatic detection

Conflicts are checked automatically when:
- A new decision is added
- A project is re-entered
- A parent project's decisions change

### Manual detection

Run a full conflict scan:

```
Tool: brief_check_conflicts
```

This returns all detected conflicts with:
- The two conflicting decisions
- The sections and projects they belong to
- A confidence score
- Suggested resolution approaches
