---
type: ralph-loop-software-dev
type_aliases:
  - ralph-loop
  - task-packet-dev
  - automated-build-loop
source: bundled
version: "1.0"
common_parent_types:
  - software-product
  - developer-tool
  - library
common_child_types:
  - feature-module
  - parser-module
  - server-module
  - cli-module
suggested_extensions:
  - slug: build_infrastructure
    description: "Build loop configuration, safety nets, rule tiers, agent instructions"
    subsections:
      - name: Loop Configuration
        mode: freeform
      - name: Rule Tiers
        mode: freeform
      - name: Safety Nets
        mode: freeform
      - name: Agent Instructions
        mode: freeform
  - slug: task_architecture
    description: "Task packet design, rule clustering, dependency graph, context budgeting"
    subsections:
      - name: Rule Clustering Strategy
        mode: freeform
      - name: Dependency Graph
        mode: freeform
      - name: Context Budget
        mode: freeform
suggested_ontologies: []
conflict_patterns:
  - ["task granularity", "context overhead"]
  - ["test blindness", "debugging efficiency"]
  - ["automation", "human oversight"]
  - ["rule strictness", "development speed"]
  - ["fresh context", "retry cost"]
  - ["spec completeness", "build start"]
reference_sources:
  - ENHANCED_BUILD_PROCESS_GUIDE.md
  - BRIEF.md specification
  - Vitest documentation
  - Biome documentation
  - Claude Code CLI documentation
  - tsup documentation
  - fast-check documentation
---

# Ralph Loop Software Development Guide

This guide shapes BRIEF.md files for software projects built using the Enhanced Ralph Loop — an autonomous, multi-agent development process where specialised agents audit, build, continue, and review one task at a time, with fresh context per iteration, test-blind implementation, four-tier rule enforcement, and structured bug memory across retries.

## Overview

A Ralph Loop software project separates planning from building into two distinct phases:

- **Phase 1 (Planning)** — Humans and AI collaborate to create task packets (self-contained work orders), write all tests before any implementation exists, create type stubs, and set up build infrastructure. Every planning artefact is reviewed before building starts. Planning can start from an existing specification (spec-available path) or from scratch through structured requirements extraction (no-spec path) — both produce the same artefacts.
- **Phase 2 (Building)** — An automated loop (`loop.sh`) orchestrates four specialised agents per iteration. The **audit agent** validates cross-file consistency and test readiness (it CAN read tests). The **build agent** implements from the task packet (it CANNOT read tests). If the build agent runs out of turns, a **continuation agent** finishes. If a test is flagged as suspect, a **test-review agent** arbitrates. Each iteration starts with a fresh context window — all orientation files are pre-injected into the prompt by the loop script to avoid wasting agent turns on file reads.

The build agent never sees test source code — it implements from spec rules and receives only pass/fail feedback. Property tests (random-input invariants) make reverse-engineering impossible. This produces code that is genuinely spec-compliant, not just test-compliant.

## Project Structure

**Product → Feature Modules → Task Packets / Tests / Stubs**

- **Product** — The software being built (root project BRIEF.md)
- **Feature Modules** — Functional areas grouped by domain (e.g., parser, writer, ontology-engine, server, CLI). Each feature module is a sub-project with its own BRIEF.md
- **Within each feature:**
  - **Task packets** — Self-contained work orders in `tasks/` (~5-7KB each, read-only during build)
  - **Tests** — Written before implementation, in separate `tests/` directory (build agent never reads; audit agent does)
  - **Stubs** — Function signatures in `src/` that throw "Not implemented" (replaced during build)
  - **Type interfaces** — Shared contracts in `src/types/` (modules communicate through these, never through internals). Once implemented, type files are added to `LOCKED_FILES.txt` and become append-only

Each task maps to a specific sub-file within a module (e.g., `src/parser/sections.ts`) with a corresponding test file (e.g., `tests/parser/sections.test.ts`). Tasks are ordered by priority and declare dependencies on other tasks.

### BRIEF.md Hierarchy (folder layout)

The root BRIEF.md describes the product. Each feature module gets a sub-project BRIEF.md co-located with its source code. Shared type contracts get their own BRIEF.md. Tasks and infrastructure files live at the project root.

```
project-root/
  BRIEF.md                            ← type: ralph-loop-software-dev (product root)
  src/
    types/
      BRIEF.md                        ← type: feature-module (shared type contracts)
      index.ts                        ← re-exports all type interfaces
      parser.ts                       ← parser module types
      server.ts                       ← server module types
    parser/
      BRIEF.md                        ← type: parser-module (feature module)
      index.ts                        ← stub → implementation
      sections.ts                     ← stub → implementation
    server/
      BRIEF.md                        ← type: server-module (feature module)
      index.ts
    cli/
      BRIEF.md                        ← type: cli-module (feature module)
      index.ts
  tests/
    parser/
      sections.test.ts                ← written before implementation
    server/
      index.test.ts
  tasks/
    TASK_INDEX.md                     ← master task list with priorities and dependencies
    task-001-parser-core.md           ← task packet (~5-7KB)
    task-002-parser-sections.md
    ...
  scripts/
    check-rules.sh                    ← Tier 2 architecture rules
    llm-judge.sh                      ← Tier 4 design intent checks
    format-log.js                     ← human-readable log formatter
  .claude/
    settings.json                     ← build agent permissions (Bash grep only)
    settings.test-review.json         ← test-review agent permissions
  .husky/
    pre-commit                        ← Tier 1+2 on staged files
  loop.sh                             ← build loop orchestrator
  AGENTS.md                           ← key rules and module boundaries
  BUGS.md / BUGS_RESOLVED.md          ← active and resolved bug entries
  LEARNINGS.md                        ← curated insights across iterations
  DESIGN_REVIEW.md                    ← Tier 4 findings and test fix audit log
  LOCKED_FILES.txt                    ← append-only type files
  ERROR_CONVENTIONS.md                ← canonical error formats per module
  PROMPT_audit.md                     ← audit agent prompt
  PROMPT_build_v2.md                  ← build agent prompt
  PROMPT_continue_v2.md               ← continuation agent prompt
  PROMPT_test_review.md               ← test-review agent prompt
```

When creating sub-projects via `brief_create_sub_project`, use the `src/[module]/` path as the sub-project location. The root BRIEF.md is the parent of all feature module BRIEFs. The `src/types/` BRIEF is also a direct child of the root — it describes the shared contract layer, not a feature module.

## Key Dimensions

### 1. Multi-Agent Architecture

Four specialised agents collaborate within each iteration, each with distinct permissions enforced via `.claude/settings.json`:

- **Audit Agent** (`PROMPT_audit.md`) — Runs before the first attempt on each task. CAN read test files — this is its primary job. Runs 8 phases: fixture completeness, cross-file consistency, test isolation, assertion quality, test hook removal, error convention enforcement, property test strengthening, and verdict signalling. Writes fixes to spec/stub/test files, signals AUDIT_READY or AUDIT_BLOCKED via `.loop-signal`.
- **Build Agent** (`PROMPT_build_v2.md`) — The implementation agent. CANNOT read tests (enforced by settings.json restricting Bash to `grep:*` only). Receives all context pre-injected in the prompt — task packet, module files, sibling modules, type interfaces, BUGS.md, LEARNINGS.md, LOCKED_FILES.txt. Implements, tests (two-phase: targeted then regression), commits or logs bug.
- **Continuation Agent** (`PROMPT_continue_v2.md`) — Spawned when the build agent hits max-turns with uncommitted changes in the working tree. Receives the git diff of uncommitted changes. Assesses completeness, finishes implementation if partial, runs tests, commits or logs bug. Up to 2 continuation agents can chain.
- **Test-Review Agent** (`PROMPT_test_review.md`) — Spawned when a `[SUSPECT-TEST]` bug entry exists. CAN read test source. Applies a source-of-truth hierarchy: task packet rules > type interfaces > implementation > test expectations. Delivers one of three verdicts: TEST BUG (fixes the test, re-tags as [Tier 3]), IMPLEMENTATION BUG (clears the flag, lets build agent retry), or AMBIGUOUS (escalates to human). Has a decision deadline — must verdict by turn 12 or default to IMPLEMENTATION BUG.

### 2. Context Pre-Injection

The loop script pre-loads ALL orientation files directly into each agent's prompt — task packet, TASK_INDEX.md, module files, sibling modules, type interfaces, BUGS.md, LEARNINGS.md, LOCKED_FILES.txt. Agents are instructed to NEVER re-read pre-loaded files. This eliminates 5-10 turns of file reading per iteration, keeping agents focused on implementation. The prompt includes markers like "PRE-LOADED CONTEXT — Do NOT re-read these files."

### 3. Test-First Blindness (Build Agent Only)

The build agent structurally cannot access test source: `.claude/settings.json` allows only `Bash(grep:*)`, blocking all file reads of `tests/`. The audit agent and test-review agent CAN read tests — they have different settings files (`.claude/settings.test-review.json`). This asymmetry is intentional: the audit agent ensures test quality before the build agent sees only pass/fail output.

Property tests (fast-check) add further protection: invariants like "never throws for any input" cannot be reverse-engineered from expected values.

### 4. Four-Tier Rule Enforcement

Different rules need different enforcement mechanisms:

- **Tier 1 — Static Analysis** (Biome + tsc): code style, type safety. Runs in Husky pre-commit only (staged files via `--staged`). Fast (~5s), auto-fixable.
- **Tier 2 — Architecture Rules** (grep-based `check-rules.sh --staged`): structural violations (no external HTTP calls, no console.log, atomic writes, module boundaries). Runs in Husky pre-commit only. Grows organically as violations are discovered.
- **Tier 3 — Behavioural Tests** (Vitest): the main quality gate. Runs in the loop in two phases — targeted (one test file) then regression (full suite). One in-context fix attempt on failure, then log bug and exit.
- **Tier 4 — Design Intent** (LLM-as-judge subagent): subtle design violations checked against yes/no criteria. Warning only — findings logged to DESIGN_REVIEW.md, never blocks commits.

Tier 1+2 run only in Husky (no redundancy with the loop). Tier 3 runs only in the loop (not in Husky). Tier 4 runs only in the loop as advisory.

### 5. Fresh Context Retry System

Every attempt gets a completely new process with an empty context window (~156KB budget). Failed attempt clutter never accumulates — instead, a structured bug entry (~500 bytes) in BUGS.md captures the approach tried, why it failed, and a suggested different approach. Even after 5 retries, bug data is only ~2.5KB vs 40-60KB of raw context accumulation. The agent always has full reasoning capacity.

Four tier tags on bug entries guide the next attempt:
- `[Tier 3]` — tests failed, try a different implementation approach
- `[Husky]` — lint/architecture failed but tests passed, keep the approach, fix the mechanical issue
- `[SUSPECT-TEST]` — agent believes the test contradicts the spec. Requires either 2+ failed attempts with different approaches, OR attempt-1 fast path (exactly 1 test fails AND it matches a named anti-pattern from LEARNINGS.md "Known Test Anti-Patterns" section). Triggers the test-review agent
- `[REGRESSION]` — implementing the current task broke a previously-passing test from an earlier task

### 6. Append-Only File Locking

After a task successfully implements type interfaces in `src/types/`, those files are added to `LOCKED_FILES.txt` by the loop script. Locked files are append-only — agents may add new interfaces, types, and exports but MUST NOT modify or delete existing code. The loop enforces this by checking `git diff` for deletions in locked files and rejecting the commit if violations are found. This protects completed contracts from being broken by later tasks.

## Suggested Workflow

The MCP lifecycle phases (`needs_identity` → `needs_type` → `review_suggestions` → design complete → scaffold → build) map to the Ralph Loop's three phases. The MCP handles initial setup automatically; the type guide drives behavior from design onward.

### Design Phase

The Design Phase produces the same artefacts regardless of starting point: task packets, tests, stubs, type interfaces, and error conventions. How you get there depends on whether a spec exists.

#### Path A: Spec Available

When a specification, design document, or detailed requirements doc already exists:

1. **Spec analysis** *(Pattern 8: collaborative authoring + DR-01..09 decision capture)* — Read the full specification and extract atomic rules (constraints, behaviours, invariants). Cluster rules by module affinity into ~40-60 tasks. Each task covers 3-8 related rules that naturally belong together (e.g., "parser core safety" = PARSE-01 + PARSE-05 + PARSE-06 + SEC-17). As module boundaries and clustering choices emerge, capture them as decisions via `brief_add_decision` (apply DR-02 elicitation for each). Surface uncertainties as open questions via `brief_add_question` (QUEST-01, QUEST-03).
2. **Write task packets** *(Pattern 8: collaborative authoring)* — One self-contained markdown file per task. Inline all rule text in full. Write implementation guide as a suggested approach. Include Exported API section with function signatures. Describe test expectations without showing test code. After completing each cluster, run DR-09 (post-section decision sweep) to catch uncaptured decisions.

#### Path B: No Spec (Requirements Extraction)

When no spec exists and requirements must be discovered through conversation:

1. **Domain discovery** *(Pattern 8: collaborative authoring + QUEST-02, QUEST-03)* — Structured conversation to understand: what the software does, who uses it, what it integrates with, what constraints exist (performance, security, compliance). Use the BRIEF lifecycle's identity sections (What This Is, What This Is Not, Why This Exists) as the starting scaffold. Surface domain-specific risks as open questions (QUEST-03). Offer the deferral escape hatch (QUEST-11) for questions the user can't answer yet.
2. **Decision harvesting** *(DR-01..09 applied systematically)* — For each functional area, surface choices the user must make. Frame as trade-offs, not open questions: "Should the parser reject malformed input (strict, safer) or accept anything (lenient, more resilient)?" Each confirmed choice = `brief_add_decision` with full DR-02 elicitation (rationale + alternatives). Number rules as they emerge (e.g., PARSE-01: "Parser never rejects input"). Unresolved trade-offs = `brief_add_question` (QUEST-01). Known unknowns the user wants to defer = `brief_add_question` with `keep_open: true` (QUEST-09).
3. **Interface sketching** *(Pattern 8 + DR-01..09)* — As rules accumulate, sketch module boundaries and type interfaces collaboratively. "Based on these 12 parser rules, here's a proposed module boundary with these 4 exported functions — does this match your mental model?" Module boundary agreements are decisions — capture them before creating sub-projects.
4. **Rule clustering** *(DR-09: post-section sweep)* — Group harvested rules by module affinity into tasks, same as Path A. The difference is that rules were extracted from conversation rather than read from a doc. Aim for 3-8 rules per task. After clustering, sweep the conversation for decisions discussed but not yet captured (DR-09).
5. **Write task packets** *(Pattern 8)* — Same format as Path A. Each packet inlines the harvested rules in full, includes the implementation guide, exported API, and test expectations.

#### Both Paths Continue

3. **Write all tests** *(Pattern 8)* — AI writes test files from task packets, human reviews. Unit tests (~70%) for specific behaviours, property tests (~20%) for invariants, critical rules get both (~10%). Tests import from stub files that throw "Not implemented."
4. **Create type stubs** — Function signatures in `src/types/` (shared interfaces) and `src/[module]/` (module stubs). Must compile cleanly with `npx tsc --noEmit`.
5. **Create ERROR_CONVENTIONS.md** *(Pattern 8)* — Document canonical error formats per module (what is thrown vs returned, regex patterns for matching). The audit agent enforces consistency against this.
6. **Human reviews all planning artefacts** *(Pattern 5: conflict resolution + QUEST-07: planning session)* — Task packets accurate? Tests cover the right rules? Stubs have correct signatures? Error conventions consistent? Rule clustering makes sense? Run `brief_check_conflicts` to detect contradictions between decisions. Run `brief_get_questions` to surface any unresolved blocking questions.

**Decision gates before Scaffold:** Tech stack locked? Module boundaries defined? Rule clustering stable? Test coverage reviewed and approved? Error conventions documented? (For Path B: all key decisions captured and confirmed by user?)

**Phase transition:** The MCP does not automatically advance from design to scaffold — the user signals readiness (e.g., "let's scaffold" or "ready to build"). Before proceeding, the AI should verify the "Project readiness" Quality Signals checklist below and run `brief_lint` + `brief_check_conflicts` on all sub-project BRIEFs. Flag any incomplete items to the user.

### Scaffold Phase

7. **Bootstrap repo** *(Pattern 11: build scaffolding)* — Read the full BRIEF.md hierarchy via `brief_get_context` with `scope: "tree"`. Generate all infrastructure files from the BRIEF data and extension content (see Extension Guidance for the mapping):
   - Agent prompts: `PROMPT_build_v2.md`, `PROMPT_audit.md`, `PROMPT_continue_v2.md`, `PROMPT_test_review.md`
   - Management files: `AGENTS.md`, `TASK_INDEX.md`, `BUGS.md`, `BUGS_RESOLVED.md`, `LEARNINGS.md`, `DESIGN_REVIEW.md`, `LOCKED_FILES.txt`, `ERROR_CONVENTIONS.md`
   - Scripts: `scripts/check-rules.sh`, `scripts/llm-judge.sh`, `scripts/format-log.js`
   - Settings: `.claude/settings.json` (build agent permissions), `.claude/settings.test-review.json` (test-review agent permissions)
   - Git hooks: `.husky/pre-commit` (Tier 1+2 on staged files only)
   - Loop: `loop.sh`
8. **Create build branch** — `git checkout -b build/sprint-1`. All loop commits go here; merge to main after review.
9. **Verify readiness** — `npx tsc --noEmit` passes (stubs compile). `npx vitest run` runs (tests fail with "Not implemented" — expected). `./scripts/check-rules.sh` passes (stubs don't violate architecture rules). `npx biome check src/` passes (stubs are lint-clean).
10. **Run pre-launch checklist** — Every item confirmed: task index complete, infrastructure files present, config files correct, git hooks installed, `.claude/settings.json` restricts build agent appropriately.

**Decision gates before Build:** All checklist items verified? First run will be human-monitored? LEARNINGS.md initialized? LOCKED_FILES.txt exists (even if empty)?

**Phase transition:** The user confirms the pre-launch checklist is complete and initiates the first build run. The AI should verify every "Project readiness" Quality Signal is checked before proceeding.

### Build Phase

11. **First run (human in the loop)** — Watch the first 3-5 iterations. Is the audit agent clearing tasks correctly? Is the build agent following task packet instructions? Are error messages informative enough? Answer agent questions. Capture learnings. Watch token-log.tsv for context budget trends.
12. **Review and refine** — Update task packets if instructions were unclear. Improve tests if error messages were unhelpful. Add new `check-rules.sh` entries for violations that slipped through. Promote best LEARNINGS.md entries to AGENTS.md. Add discovered anti-patterns to LEARNINGS.md "Known Test Anti-Patterns" section.
13. **Autonomous runs** — Run overnight. Review in the morning: `TASK_INDEX.md` (progress), `BUGS.md` (active blockers), `BUGS_RESOLVED.md` (build history), `DESIGN_REVIEW.md` (Tier 4 findings + test fix audit log), `git log --oneline` (commit trail), `.loop-logs/token-log.tsv` (cost/context trends).

## Known Tensions

- **Task granularity vs context overhead** — Too-small tasks waste the ~30KB orientation overhead on ~10KB of work. Too-large tasks (20+ rules) push past the smart zone and degrade reasoning quality. The sweet spot is 3-8 rules producing 30-50KB of work context, keeping total usage at 50-80KB.
- **Test blindness vs debugging efficiency** — The build agent cannot read test source, so it cannot shortcut to the answer. Bug entries must describe approach flaws ("section count wrong because trailing content missed"), not expected values ("expected 3, got 2"). The audit agent compensates by ensuring cross-file consistency BEFORE the build agent runs.
- **Fresh context vs retry cost** — A clean context window gives full reasoning capacity but costs a complete iteration reload. In-context fixes (1 attempt for Tier 3, up to 3 for Husky) avoid wasting iterations on simple mistakes while preserving the fresh-context escape hatch for genuine rethinking. Continuation agents recover work when max-turns is hit.
- **Automation vs human oversight** — The first run requires monitoring to calibrate the framework. Autonomous runs risk undetected systemic issues. Safety nets mitigate: 3 different tasks failing consecutively stops the loop. Per-task 5-attempt limit escalates to human review. Context overflow detection reverts unreliable output automatically.
- **Rule strictness vs development speed** — More grep checks and stricter architecture rules catch more violations but slow iteration. Start with ~8 critical rules in `check-rules.sh` and grow organically — add a new check only when an actual violation slips through review. The script is an immune system that strengthens with each infection.
- **Spec completeness vs build start** — With no pre-made spec (Path B), there's a temptation to start building before all requirements are surfaced. Each undiscovered rule risks rework or a task packet rewrite mid-build. But over-specifying delays building and may produce rules that don't survive contact with implementation. Aim for "complete enough" — all module boundaries defined, all inter-module interfaces agreed, known unknowns documented as deferred questions rather than hidden gaps.

## Anti-patterns

- **Reading test source code (build agent)** — Defeats the test-blind design that ensures spec compliance. The build agent implements from task packet rules, not test assertions. Enforced by `.claude/settings.json` restricting Bash to `grep:*` only. The audit agent and test-review agent CAN read tests — that's their job.
- **Re-reading pre-loaded files** — All context is pre-injected into the prompt by loop.sh. Agents that re-read these files waste turns and context budget. Prompts include explicit "Do NOT re-read these files" instructions. The loop adds "PRE-LOADED CONTEXT" markers.
- **Retrying in same context window** — Failed-attempt clutter accumulates 15-20KB per retry, crowding the desk and degrading reasoning quality. The build agent should try ONE in-context fix for simple failures (off-by-one, wrong variable), then exit to fresh context. Never attempt a second fix — if the first didn't work, fresh thinking is needed.
- **Modifying locked type files** — Type contracts in `src/types/` are append-only once implemented. Agents that modify or delete existing code in locked files have their commits rejected by the loop. If a locked type doesn't match expectations, the agent's implementation is wrong — fix the implementation, not the type.
- **Copying expected values into bug entries** — Writing "expected 3, got 2" in the bug entry lets the next attempt hardcode the answer. Instead, describe the approach flaw: "section count incorrect because the split logic requires a trailing newline but the final section ends at EOF." Property tests provide additional protection — random-input invariants cannot be reverse-engineered from expected values.
- **Designing around external dependencies without researching their constraints** — If the software integrates with external APIs, SDKs, or services, research their rate limits, data formats, authentication requirements, and breaking change policies during the Design phase. Include official documentation in Reference Sources. Do not defer dependency research to the Build phase where it becomes a blocker.
- **Starting the build with implicit requirements (Path B)** — When requirements were extracted through conversation rather than read from a spec, some decisions feel "obvious" and go unwritten. Every rule must be explicit in a task packet. If the build agent doesn't have it inlined, it doesn't exist. After decision harvesting, review all task packets against the conversation transcript — look for assumptions that were discussed but never formalised into numbered rules.

## Extension Guidance

Two extensions capture the build methodology's configuration. During scaffolding (Pattern 11), the freeform content in these extensions is the primary input for generating build artifacts. Each subsection maps to specific scaffold outputs.

### build_infrastructure
Captures the operational setup of the build loop:
- **Loop Configuration** (freeform) — iteration limits, failure thresholds, branch strategy, token budget targets, max-turns per agent type
  → Scaffold outputs: `loop.sh` parameters, branch naming, `.loop-logs/` structure
- **Rule Tiers** (freeform) — which rules go in each tier, what the grep patterns check, LLM judge criteria
  → Scaffold outputs: `scripts/check-rules.sh` grep patterns (Tier 2), `.husky/pre-commit` hook (Tier 1+2), `scripts/llm-judge.sh` criteria (Tier 4)
- **Safety Nets** (freeform) — per-task attempt limits, consecutive failure stops, max iterations, context overflow thresholds, crash recovery behaviour
  → Scaffold outputs: `loop.sh` safety logic (attempt counters, consecutive failure detection, overflow thresholds)
- **Agent Instructions** (freeform) — prompt conventions for each agent type (audit, build, continue, test-review), AGENTS.md key rules, LEARNINGS.md curation policy, settings.json permission profiles
  → Scaffold outputs: `PROMPT_audit.md`, `PROMPT_build_v2.md`, `PROMPT_continue_v2.md`, `PROMPT_test_review.md`, `AGENTS.md`, `.claude/settings.json`, `.claude/settings.test-review.json`

### task_architecture
Captures how the spec is decomposed into buildable units:
- **Rule Clustering Strategy** (freeform) — how rules are grouped into tasks by module affinity and dependency
  → Scaffold outputs: `tasks/task-NNN-*.md` packet files (one per cluster)
- **Dependency Graph** (freeform) — task execution order, which tasks must complete before others can start
  → Scaffold outputs: `tasks/TASK_INDEX.md` with priorities, statuses, and dependency declarations
- **Context Budget** (freeform) — estimated context KB per task, orientation overhead, work zone targets, pre-injection size calculations
  → Scaffold outputs: `context_kb` metadata field in each task packet, max-turns values in `loop.sh`

The AI should read the extension content via `brief_get_context` before scaffolding and use the freeform descriptions as specifications for generating each artifact.

## Ontology Guidance

No ontologies are suggested by default — all extension subsections use freeform mode, and the Ralph Loop methodology is domain-agnostic. Project-specific ontologies (e.g., MCP protocol vocabulary, database schema terms) belong in the project's own type guide or BRIEF.md, not in this methodology guide.

If a project later needs structured vocabulary for architecture patterns (e.g., module-boundary, atomic-write, state-machine, lenient-parser), create a custom `software-architecture` ontology during extension setup and link it to relevant subsections. Use `brief_design_extension` to check for ontology matches before defaulting to freeform.

## Typical Decision Points and Questions

During the Design phase, proactively surface these decision points (QUEST-02) and domain-specific risks (QUEST-03). Frame each as a trade-off with a recommendation (QUEST-12).

### Decisions to surface early (use `brief_add_decision` after DR-02 elicitation)
- **Tech stack** — Language, test runner, linter, build tool, CI provider. Lock before writing stubs.
- **Module boundaries** — Where to draw the line between parser, server, CLI, etc. Affects all task packets.
- **Task granularity** — How many rules per task? (Recommend 3-8 for the 50-80KB sweet spot.)
- **Test strategy ratio** — Unit (~70%) vs property (~20%) vs dual-coverage (~10%). Adjust per project risk profile.
- **Dependency ordering** — Which modules must complete first? (Types → core modules → higher-level modules.)
- **Error handling strategy** — Throw vs return errors, error message format, which module owns which error types.

### Questions to surface (use `brief_add_question`)
- **Safety net thresholds** — How many retries per task before escalation? (Default: 5.) How many consecutive failures stop the loop? (Default: 3.) These can be deferred (QUEST-11) and adjusted after the first run.
- **Context budget targets** — What's the KB sweet spot for this project? (Default: 50-80KB total.) Depends on task complexity and module size.
- **External dependency constraints** — Rate limits, auth requirements, breaking change policies for any external APIs or services. Research during Design, not Build (QUEST-03 risk).
- **Max-turns per agent type** — How many turns before the build agent is cut off and a continuation agent spawns? Depends on task size and model speed.
- **Overnight cost control** — Maximum total iterations for autonomous runs? Token budget ceiling?
- **Human review cadence** — How often should the human check in during autonomous runs?

## Quality Signals

### Project readiness (Design phase complete)
- [ ] All task packets written with rules inlined in full text (not just rule IDs)
- [ ] All tests written from task packets and human-reviewed
- [ ] All stubs compile cleanly (`npx tsc --noEmit` passes)
- [ ] `check-rules.sh` passes against stubs (no architecture violations)
- [ ] `npx biome check src/` passes (stubs are lint-clean)
- [ ] TASK_INDEX.md complete with priorities, statuses, and dependency graph
- [ ] ERROR_CONVENTIONS.md documents canonical error formats per module
- [ ] All four agent prompts written: PROMPT_audit.md, PROMPT_build_v2.md, PROMPT_continue_v2.md, PROMPT_test_review.md
- [ ] `.claude/settings.json` restricts build agent (Bash grep only); `.claude/settings.test-review.json` allows test reads but denies src/ writes
- [ ] Infrastructure files in place: loop.sh, AGENTS.md, BUGS.md, BUGS_RESOLVED.md, LEARNINGS.md, DESIGN_REVIEW.md, LOCKED_FILES.txt
- [ ] scripts/format-log.js provides human-readable log output from stream-json
- [ ] Module boundaries clearly defined in AGENTS.md
- [ ] Context budget estimated per task packet (metadata field present)
- [ ] Pre-launch checklist fully verified

### Requirements extraction readiness (Path B only)
- [ ] All functional areas identified and named as modules
- [ ] All key trade-off decisions made and captured as numbered rules
- [ ] Inter-module interfaces sketched and agreed (function signatures, data shapes)
- [ ] Known unknowns documented as deferred questions (not hidden gaps)
- [ ] Decision rationales recorded (why this choice, not just what was chosen)
- [ ] User has reviewed the full rule set and confirmed nothing is missing
- [ ] Rules are clustered into task packets (same format as Path A output)

### Scaffolding readiness per sub-project (feature module)
- [ ] Identity sections filled (What This Is, Direction, Why This Exists)
- [ ] Blocking questions resolved or explicitly deferred with rationale
- [ ] Key architectural decisions captured (module interfaces, error handling strategy, data flow)
- [ ] Interface dependencies documented in `src/types/` files
- [ ] Task packets reference correct module paths and also-read files
- [ ] Estimated context KB is within smart zone (total < 80KB including orientation)

## Reference Sources

These are human reference materials for authoring task packets, agent prompts, and build infrastructure. They are NOT MCP-searchable ontology or reference packs — use `brief_discover_references` with keywords from these sources to build web search queries when researching tooling during setup.

- **ENHANCED_BUILD_PROCESS_GUIDE.md** — Primary methodology reference. Contains the complete loop design, retry system, bug memory format, infrastructure file templates, safety net rationale, and pre-launch checklist.
- **BRIEF.md specification** — Context file format that task packets and project BRIEFs follow.
- **Vitest documentation** — Test runner used for Tier 3 behavioural tests. Property tests use fast-check integration.
- **fast-check documentation** — Property-based testing library. Generates random inputs to verify invariants (e.g., "parser never throws for any string").
- **Biome documentation** — Linter and formatter used for Tier 1 static analysis. Auto-fixable with `npx biome check --write src/`.
- **tsup documentation** — Build tool (esbuild-based) producing CJS + ESM output.
- **Claude Code CLI documentation** — Agent runtime. Key flags: `--dangerously-skip-permissions` (autonomous operation), `--output-format stream-json` (structured logging for format-log.js), `--max-turns N` (turn limits per agent type), `--model` (model selection).

## Build Process

The Enhanced Ralph Loop is what "Build" means for this project type. It orchestrates four specialised agents per iteration, with the loop script (`loop.sh`) managing context pre-injection, agent sequencing, failure detection, and safety enforcement.

### Iteration Steps

Each iteration follows an Audit → Build → (optional Continuation) → (optional Test-Review) pipeline:

**Phase A: Audit (first attempt only — skipped on retries)**

1. Loop pre-injects: task packet, module stubs, sibling modules, type interfaces, LEARNINGS.md
2. Audit agent reads the test file (its primary job — it CAN read tests)
3. Runs 8 phases: fixture completeness, cross-file consistency (function names, parameter shapes, return values, import paths, error message strings), test isolation, assertion quality, test hook removal, error convention enforcement, property test strengthening
4. Writes fixes directly to spec/stub/test files. Does NOT write implementation logic — stubs stay as stubs
5. Signals verdict to `.loop-signal`: AUDIT_READY (proceed to build) or AUDIT_BLOCKED (mark task needs-human-review, skip to next task)
6. Loop commits any audit fixes automatically

**Phase B: Build**

1. Loop pre-injects ALL context into the build prompt: TASK_INDEX.md, task packet, BUGS.md, LEARNINGS.md, LOCKED_FILES.txt, module files, sibling modules, type interfaces. Build agent skips straight to implementation
2. Agent checks task dependencies. If unmet, writes NO_WORKABLE_TASKS to `.loop-signal` and exits
3. Updates TASK_INDEX.md status from "pending" to "in-progress"
4. Implements from task packet rules and implementation guide. If BUGS.md has prior failures, tries a DIFFERENT approach
5. **Two-phase testing:**
   - Phase A (targeted): `npx vitest run [test file]` — only the current task's tests. If clear error, ONE targeted fix. If unclear, add diagnostic logging, observe, fix. If still failing, log bug and exit
   - Phase B (regression): `npx vitest run` — full suite. Earlier tasks must still pass. If regression, ONE fix attempt, then log bug with [REGRESSION] tag
6. Commits src/ files only (NEVER management files — they're gitignored). Husky runs Tier 1+2 on staged files
7. On success: updates TASK_INDEX.md to "completed", moves bugs to BUGS_RESOLVED.md, writes LEARNINGS.md
8. On failure: writes structured bug entry to BUGS.md with tier tag, approach analysis, suggested next approach. Loop reverts `src/` changes via `git checkout HEAD -- src/`

**Phase C: Continuation (if build agent hits max-turns)**

If the build agent exhausts its turn limit with uncommitted changes in the working tree, loop.sh spawns a continuation agent. It receives the git diff of uncommitted code, assesses completeness (complete, partial, or broken), finishes if partial, tests, and commits or logs bug. Up to 2 continuation agents can chain if needed.

**Phase D: Test-Review (if SUSPECT-TEST flagged)**

If BUGS.md contains a `[SUSPECT-TEST]` entry, loop.sh spawns the test-review agent with different permissions (can read tests, cannot write src/). It applies the source-of-truth hierarchy, delivers a verdict, and either fixes the test (TEST BUG), clears the flag (IMPLEMENTATION BUG), or escalates (AMBIGUOUS). Safety check: loop.sh verifies the test-review agent only modified `tests/` and management files — any src/ changes are reverted.

### Loop Orchestration

`loop.sh` manages the full pipeline:
- **Task detection** — Reads TASK_INDEX.md to find the next "pending" or "in-progress" task
- **Context pre-injection** — Reads module files, siblings, types, and management files, injects them into agent prompts
- **Agent sequencing** — Audit → Build → Continuation (if needed) → Test-Review (if needed)
- **Success detection** — Checks if a new git commit was made since iteration start
- **Failure handling** — Reverts src/ changes, writes crash bug entries if agent died without logging a bug
- **Token tracking** — Extracts input/output tokens per agent step, logs to `.loop-logs/token-log.tsv` with cumulative totals
- **Context budget enforcement** — Monitors input token count against smart zone limit and hard limit. Overflow triggers automatic src/ revert
- **Type file locking** — After successful commits, any new/changed `src/types/` files are added to LOCKED_FILES.txt (append-only from that point)
- **Lock violation detection** — Checks git diff for deletions in locked files; rejects the commit if found

### Completion Criteria

The build is complete when all tasks in TASK_INDEX.md are either "completed" or "needs-human-review." The human then reviews DESIGN_REVIEW.md for Tier 4 findings and test fix audit log, merges the build branch to main, and curates LEARNINGS.md.

### Safety Nets

- **5 iterations per task** — After 5 consecutive iterations on the same task without a commit, loop.sh marks it `needs-human-review` and moves to the next task
- **3 different tasks failing consecutively** — If 3 different tasks fail with no successful commit between them, the loop stops. Something systemic is wrong
- **Context overflow** — If input tokens exceed the hard limit, the iteration's output is considered unreliable. loop.sh reverts src/ changes and the next iteration retries fresh
- **Crash recovery** — If the build agent crashes without writing a bug entry (API rate limit, connection error, OOM, max-turns), loop.sh writes a crash bug entry automatically and pauses before retrying
- **Lock violation rejection** — If an agent modifies locked type files, the commit is reverted
- **Test-review safety** — After the test-review agent runs, loop.sh checks that it only modified `tests/` and management files. Any src/ changes are reverted; any src/ commits are rolled back
- **Max iteration cap** — Optional limit on total iterations (e.g., `./loop.sh 50`) for overnight cost control
- **Duration warnings** — Iterations exceeding 20 minutes are logged to `duration-warnings.log` (possible agent spiral)
