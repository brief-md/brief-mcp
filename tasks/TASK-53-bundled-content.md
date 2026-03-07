# TASK-53: Cross-Cutting — Bundled Content

## Metadata
- Priority: 55
- Status: pending
- Dependencies: TASK-40, TASK-48
- Module path: assets/
- Type stubs: none
- Also read: src/types/config.ts
- Test file: tests/assets/bundled-content.test.ts
- Estimated context KB: 25

## What To Build

Create the `assets/` directory at the project root and build the generic type guide that ships with the npm package. The generic guide (`assets/type-guides/_generic.md`) has `bootstrapping: true`, `source: bundled`, includes the 10 Universal Project Dimensions, and a Notes for AI section. Build the copy step to include `assets/` in `dist/assets/` for the npm package (tsup does not copy non-TS assets automatically — use `copyfiles` or equivalent). Implement installer logic to copy the generic guide to `~/.brief/type-guides/_generic.md` on first run and verify/regenerate it on every startup. Ontology packs, domain type guides, synonym dataset, and MCP registry content are deferred to v1.1 (they require external data sourcing).

## Implementation Guide

1. Create `assets/` directory at project root.

2. Create `assets/type-guides/_generic.md` — the generic/adaptive type guide. YAML frontmatter: `type: _generic`, `bootstrapping: true`, `source: bundled`, `version: 1.0`. Markdown body: the 10 Universal Project Dimensions from the spec, plus a Notes for AI section explaining adaptive mode behaviour.

3. Build step: configure the build pipeline to copy `assets/` into `dist/assets/` so the npm package includes bundled files. Since tsup does not copy non-TS assets automatically, add a post-build step using `copyfiles` or a custom script.

4. Installer logic: on first run (no `~/.brief/type-guides/` directory), create the directory and copy `_generic.md` from `dist/assets/type-guides/`. On every startup, verify `_generic.md` exists in `~/.brief/type-guides/`. If missing or corrupted, regenerate from the `dist/assets/` copy.

5. The generic guide is always overwritten on server update — it has `source: bundled` and is not intended for user modification.

6. Create a stub `LICENSES-THIRD-PARTY.md` — no third-party data ships in v1, but the file establishes the convention for v1.1 when ontology packs with external data are added.

7. v1.1 deferred items (not built in this task): genre/style ontology pack, themes ontology pack, global synonym dataset, domain-specific type guides, compatible MCP registry JSON entries.

8. Extension definitions JSON: create `assets/extensions/extensions.json` — a JSON file containing all six spec-defined extensions: SONIC ARTS, NARRATIVE CREATIVE, LYRICAL CRAFT, VISUAL STORYTELLING, STRATEGIC PLANNING, SYSTEM DESIGN. Each entry must include: `name` (metadata format, e.g., "SONIC ARTS"), `heading` (ALL CAPS display heading), `description`, `abstract_capability_descriptors` (array of domain-agnostic descriptors for cross-domain matching in Tier 2 of `brief_suggest_extensions`), `typical_subsections` (array of default section names), and `commonly_associated_ontologies` (array of ontology names). Include this file in the build step so it is copied to `dist/assets/extensions/`. This is the bundled extension registry required by COMPAT-05. (OQ-068)

9. Size discipline: monitor the cumulative size of `assets/` as content is added. The total npm package size target is under 10 MB (OQ-125, also specified in TASK-55). The generic type guide should be under 20 KB. The extension definitions JSON should be under 50 KB. When adding v1.1 content (ontology packs, synonym dataset), consider compression or lazy extraction. Add a CI check (coordinated with TASK-56) that fails if the published package exceeds 10 MB. (OQ-057)

10. Bedrock fallback: embed the 10 Universal Project Dimensions directly as a constant string in `src/type-intelligence/generic-guide-fallback.ts`. This serves as the absolute last-resort fallback — if BOTH `~/.brief/type-guides/_generic.md` AND `dist/assets/type-guides/_generic.md` are missing or corrupt, regenerate from this hardcoded constant. This ensures bootstrapping can never fail regardless of filesystem state. (OQ-173; OQ-225)

11. This task implements Design Pattern 37 (Domain Bootstrapping). The full adaptive flow is: (1) `brief_get_type_guide` returns the generic guide with `is_generic: true`, (2) the AI uses the 10 Universal Dimensions for the setup conversation, (3) within the first session `brief_create_type_guide` is called to produce a domain-specific guide, (4) future lookups for this type find the specific guide (the generic guide is self-replacing for that domain). The bundled generic guide is the entry point of this flow.

## Exported API

This task creates bundled content assets (type guides, ontology packs, language packs). The test file (`tests/assets/bundled-content.test.ts`) validates that bundled files exist and have correct structure. No new function exports — this is a content/asset task.

## Rules

### COMPAT-05: Full Extension List with Abstract Capabilities
The server MUST know about all six spec-defined extensions: SONIC ARTS, NARRATIVE CREATIVE, LYRICAL CRAFT, VISUAL STORYTELLING, STRATEGIC PLANNING, SYSTEM DESIGN. The bundled extension registry must include all six with descriptions, **abstract capability descriptors** (for cross-domain matching), typical subsections, and commonly associated ontologies. The abstract capability descriptors enable the three-tier `brief_suggest_extensions` algorithm to match extensions across domains (e.g., SONIC ARTS matching "sensory qualities" for a food project).

### COMPAT-08: Generic Guide Always Available
The bundled generic guide (`_generic.md`) with `bootstrapping: true` MUST always be installed and available. If it is missing or corrupted, the server MUST regenerate it from bundled defaults on startup. When returning the generic guide, the response MUST include `"is_generic": true` and `"mode": "adaptive"`.

## Test Specification

### Unit Tests (specific input → expected output)
- Generic guide file exists in assets/ → valid YAML frontmatter with bootstrapping: true
- Generic guide YAML → includes type, source: bundled, version fields
- Generic guide markdown body → includes 10 Universal Project Dimensions
- Build step → assets/ copied to dist/assets/
- First run with no ~/.brief/type-guides/ → directory created, generic guide installed
- Startup with generic guide present → no action needed
- Startup with generic guide missing → regenerated from dist/assets/
- Startup with generic guide corrupted → regenerated from dist/assets/
- Server update → generic guide overwritten (source: bundled)
- LICENSES-THIRD-PARTY.md exists → stub file present

### Property Tests (invariants that hold for ALL inputs)
- forAll(startup): generic guide always present after startup completes
- forAll(server update): bundled generic guide always replaced with latest version
- forAll(build): assets/ always included in dist/

## Tier 4 Criteria

Tier 4 criteria: none
