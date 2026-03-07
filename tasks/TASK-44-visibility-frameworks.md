# TASK-44: Visibility — Framework Visibility & Ontology Management

## Metadata
- Priority: 47
- Status: pending
- Dependencies: TASK-18, TASK-16, TASK-08
- Module path: src/visibility/
- Type stubs: src/types/visibility.ts
- Also read: src/types/hierarchy.ts, src/types/writer.ts
- Test file: tests/visibility/frameworks.test.ts
- Estimated context KB: 35

## What To Build

Implement two MCP tools: `brief_get_project_frameworks` and `brief_remove_ontology`. The frameworks tool returns all extensions and ontologies active for a project, distinguishing local declarations from inherited ones, including version and tag count for each. Inheritance is computed via the hierarchy walker. The remove ontology tool handles local packs (removes from `**Ontologies:**` metadata) and inherited packs (adds `(excludes: pack-name)` per additive inheritance opt-out). It includes an optional `remove_tags` flag to strip all `brief:ontology` HTML comments for that pack while preserving free text. It never modifies parent files. It also supports orphaned tag detection on pack update.

## Implementation Guide

1. `src/visibility/frameworks.ts` — framework visibility and ontology removal tools.

2. Register `brief_get_project_frameworks` tool handler. Accept parameter: `project` (optional — defaults to active project). Read the full hierarchy via T18's context assembly. Compute which extensions and ontologies are active, noting for each whether the source is local (declared in the project's own BRIEF.md) or inherited (from a parent). Include version and tag count for ontologies.

3. Inheritance computation: walk up the hierarchy using T18. Collect extensions and ontologies from each level. Parent context is advisory — child declarations take precedence. Apply `(excludes: pack-name)` opt-outs from child levels.

4. Register `brief_remove_ontology` tool handler. Accept parameters: `ontology` (required — pack name), `remove_tags` (optional boolean, default false).

5. Local pack removal: if the pack exists in the project's own `**Ontologies:**` metadata field, remove it from the field.

6. Inherited pack removal: if the pack is inherited from a parent (not in the project's own metadata), add `(excludes: pack-name)` to the project's `**Ontologies:**` field per the additive inheritance opt-out pattern. Never modify parent files.

7. Tag removal: when `remove_tags: true`, strip all `<!-- brief:ontology {pack} ... -->` HTML comments for the specified pack from the BRIEF.md. Preserve all free text content — only the comment tags are removed.

8. Orphaned tag detection: when a pack is updated (same name, new version), tags referencing entry IDs no longer in the updated pack become orphaned. This tool supports the detection workflow — surface orphaned tags for the removed pack so lint can report them.

## Exported API

Export from `src/visibility/frameworks.ts`:
- `getProjectFrameworks(params: { project: string }) → { extensions: Array<{ name: string; source: 'local' | 'inherited' }>; ontologies: Array<{ name: string; source: 'local' | 'inherited'; tagCount: number; version?: string }> }`
- `removeOntology(params: { ontology: string; removeTags?: boolean; noActiveProject?: boolean }) → { removed?: boolean; excludeAdded?: boolean; parentModified?: boolean; tagsRemoved?: number; contentPreserved?: boolean; afterContent?: string; tagsPreserved?: boolean; otherPacksPreserved?: boolean }`
- `detectOrphanedTags(params: { content: string }) → { orphanedTags: string[] }`
  Finds tags referencing packs that are no longer installed.

## Rules

### ONT-15: Orphaned Tag Detection on Pack Update
When an ontology pack is updated (same name, new version), entry IDs may change or be removed. Tags in BRIEF.md files that reference entry IDs no longer present in the updated pack are orphaned. `brief_lint` MUST detect orphaned ontology tags (HTML comments referencing non-existent `{pack}:{id}` pairs) and report them as warning-level findings. The lint output MUST include the orphaned tag text and suggest resolution (re-tag with a current entry, or remove the tag).

### ONT-20: Inherited Pack Removal
If pack exists in child's own `**Ontologies:**`, remove it. If inherited from parent, add `(excludes: pack-name)` per Pattern 14 additive inheritance opt-out. Never modify parent files. (OQ-188)

### HIER-06: Parent Context Is Advisory
The hierarchy walker MUST present parent context as context, not as binding constraints on the child. The child's own declarations take precedence.

## Test Specification

### Unit Tests (specific input → expected output)
- Get frameworks for project with local extensions → extensions listed with source: local
- Get frameworks for project inheriting parent extensions → extensions listed with source: inherited
- Get frameworks with local and inherited ontologies → both listed with correct source
- Get frameworks with ontology tag counts → each ontology includes tag count
- Get frameworks with version info → each ontology includes version
- Child with (excludes: pack) → excluded pack not listed in active frameworks
- Remove local ontology → pack removed from Ontologies metadata field
- Remove inherited ontology → (excludes: pack-name) added to child metadata
- Remove inherited ontology → parent file never modified
- Remove ontology with remove_tags: true → all brief:ontology comments for that pack stripped
- Remove ontology with remove_tags: true → free text content preserved
- Remove ontology with remove_tags: false → HTML comments preserved
- Pack not found in project → error returned
- No active project → guard error

### Property Tests (invariants that hold for ALL inputs)
- forAll(remove ontology): parent files never modified
- forAll(remove_tags): only target pack comments removed, other packs untouched
- forAll(framework listing): source (local vs inherited) always indicated
- forAll(child exclusion): excluded packs never appear in active frameworks

## Tier 4 Criteria

Tier 4 criteria: JC-02, JC-07, JC-09
