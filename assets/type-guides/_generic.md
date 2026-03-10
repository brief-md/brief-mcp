---
type: _generic
bootstrapping: true
source: bundled
version: "2.0"
conflict_patterns:
  - ["creativity", "constraints"]
  - ["quality", "speed"]
  - ["scope", "timeline"]
  - ["vision", "feasibility"]
---

# Generic Project Guide

This is the adaptive bootstrapping guide for BRIEF. It activates during the `explore_type` setup phase when no domain-specific type guide exists. Its purpose is to help the AI gather the data needed to collaboratively create a domain-specific type guide with the user.

This guide does NOT handle extensions or ontologies — those are suggested later in the lifecycle (during `review_suggestions`) after the type guide is created.

## Domain Discovery

Use these questions to understand the project's domain deeply. The answers feed directly into the type guide template sections (Overview, Key Dimensions, Suggested Workflow).

### Medium & Discipline

What medium or discipline does this project operate in? Examples: music production, film, fiction writing, software engineering, product strategy, game design, visual art, education, research.

### Primary Activities

What are the core creative or technical activities involved? Examples: composing, recording, editing, coding, designing, writing, planning, prototyping, performing.

### Outputs & Deliverables

What tangible artifacts does this project produce? Examples: tracks, albums, screenplays, applications, reports, prototypes, publications, performances.

### Audience & Expectations

Who will experience or use the project's output? What do they expect in terms of quality, format, and delivery?

### Success Criteria

What does a successful outcome look like for this type of project? What benchmarks or standards does the domain use to evaluate quality?

## Domain Project Hierarchy Template

Understand how projects of this type are typically structured. This shapes the BRIEF project's component organization and feeds into `common_parent_types` and `common_child_types` in the type guide metadata.

### Questions to Explore

- Is this a standalone project or part of a larger body of work?
- What are the typical components or sub-projects?
- What parent/child relationships exist between components?
- Which components are sequential (must happen in order) vs. parallel (can happen simultaneously)?
- Are there standard phases or stages the domain recognizes?

### Example Hierarchy Patterns

**Music Release:**
Artist Development > Album > Tracks > (Lyrics, Arrangement, Recording, Mixing, Mastering) + Artwork + Marketing

**Film Production:**
Film > (Pre-production, Production, Post-production) > Screenplay, Casting, Shooting, Editing, VFX, Sound Design, Distribution

**Software Product:**
Product > Features > (Design, Implementation, Testing, Deployment) + Documentation + Infrastructure

**Business Strategy:**
Initiative > Workstreams > (Research, Analysis, Planning, Execution, Review) + Stakeholder Communications

**Creative Writing:**
Series/Collection > Individual Works > (Drafting, Revision, Editing, Publication) + World-building + Character Development

Use these as starting points — discuss with the user how their specific project maps to or differs from the standard pattern.

## Domain Information Resources

Help identify where domain knowledge can be found. This information helps populate the type guide's reference sections and informs later ontology/extension suggestions.

### Questions to Explore

- What reference material exists for this domain? (canonical works, textbooks, industry standards)
- Are there established frameworks, methodologies, or best practices?
- What exemplar projects in this domain could serve as reference points?
- What terminology or vocabulary is specific to this domain?
- Are there professional communities, organizations, or standards bodies?

### Discovery Actions

- Use `brief_discover_ontologies` with domain keywords to find relevant knowledge packs
- Ask the user about influential works, tools, or standards in their domain
- Note any domain-specific vocabulary — this helps with ontology tagging later

## Known Tensions

Universal trade-offs that apply to any project. During the domain discovery conversation, surface **domain-specific tensions** as well — these become the `## Known Tensions` section and `conflict_patterns` metadata in the created type guide.

### Universal Tensions

- **Creativity vs. Constraints** — Artistic freedom often conflicts with technical, budget, or time limitations
- **Quality vs. Speed** — Thoroughness and polish compete with delivery timelines
- **Scope vs. Timeline** — Ambition must be balanced against available time and resources
- **Vision vs. Feasibility** — The ideal outcome may not be achievable with current capabilities

### Domain-Specific Tensions to Surface

Ask the user: "What trade-offs or tensions are common in your domain?" Examples by domain:
- Music: authenticity vs. commercial appeal, artistic vision vs. audience taste
- Software: innovation vs. stability, features vs. maintainability
- Film: creative vision vs. budget, pacing vs. completeness
- Business: short-term gains vs. long-term strategy, growth vs. sustainability

## Quality Signals

The setup conversation has gathered enough data to create a good domain-specific type guide when:

- [ ] Domain and medium clearly identified — the AI can name the project type
- [ ] Key activities and deliverables described — the workflow is understood
- [ ] Project hierarchy pattern established — components and their relationships are clear
- [ ] Domain-specific tensions surfaced — at least 2-3 trade-offs identified
- [ ] Reference material or resources identified — the domain has context
- [ ] User has reviewed and agreed on scope boundaries

## Bootstrapping Workflow

Follow these steps in order when this guide is active:

1. **Review identity** — Read the completed identity sections (What This Is, What This Is Not, Why This Exists) to understand what the user has already established
2. **Domain Discovery** — Ask the questions in the Domain Discovery section above. Don't rush — understand the domain deeply before moving on
3. **Project hierarchy** — Discuss how projects of this type are structured. Use the example patterns as conversation starters
4. **Domain resources** — Explore what reference material, standards, and exemplar works exist. Run `brief_discover_ontologies` with relevant keywords
5. **Surface tensions** — Identify domain-specific trade-offs beyond the universal ones
6. **Check quality signals** — Verify enough data has been gathered (see checklist above)
7. **Create type guide** — Call `brief_create_type_guide` with body **omitted** to get the template. Present each section (Overview, Key Dimensions, Suggested Workflow, Known Tensions, Quality Signals) to the user for collaborative input — do NOT pre-write the guide (Pattern 10)
8. **Advance lifecycle** — After the type guide is created, call `brief_reenter_project`. The lifecycle will advance to `review_suggestions` where extensions and ontologies are handled by the existing flow
