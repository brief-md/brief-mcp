# TASK-41: Type Intelligence — Type Guide Creation

## Metadata
- Priority: 44
- Status: pending
- Dependencies: TASK-40, TASK-14, TASK-08
- Module path: src/type-intelligence/
- Type stubs: src/types/type-intelligence.ts
- Also read: src/types/writer.ts
- Test file: tests/type-intelligence/creation.test.ts
- Estimated context KB: 30

## What To Build

Implement the `brief_create_type_guide` MCP tool — create new type guides from conversational input. The tool writes a `.md` file with YAML frontmatter (type, type_aliases, source, version, suggested_extensions, suggested_ontologies, common_parent_types, common_child_types) and a markdown body. It validates type alias uniqueness across all installed guides, detects existing guides for the same type (returning `existing_guide: true` with the option to overwrite via `force: true` with backup), automatically sets `source: ai_generated`, and includes `created_by_project` metadata. Never overwrites user-modified guides on server update.

## Implementation Guide

1. `src/type-intelligence/creation.ts` — type guide creation tool.

2. Register `brief_create_type_guide` tool handler. Accept parameters: `type` (required), `type_aliases` (optional array), `suggested_extensions` (optional array), `suggested_ontologies` (optional array), `common_parent_types` (optional array), `common_child_types` (optional array), `body` (required — markdown content), `force` (optional boolean, default false).

3. YAML frontmatter generation: build frontmatter with `type`, `type_aliases`, `source: ai_generated`, `version: 1.0`, `suggested_extensions`, `suggested_ontologies`, `common_parent_types`, `common_child_types`, and `created_by_project` (the active project name if available).

4. Type alias uniqueness validation: before writing, check all `type_aliases` against every installed guide's aliases. If a collision is detected, apply precedence: user_edited > ai_generated > community > bundled. Warn if collision occurs with details.

5. Existing guide detection: if a guide for the same type already exists, return `existing_guide: true` with the existing guide's `source`. Only overwrite when `force: true` is provided — in that case, back up the original as `[type].md.bak` before writing.

6. Guide update safety: guides with `source: ai_generated`, `source: community`, or `source: user_edited` are NEVER overwritten by server updates. Only `source: bundled` guides may be overwritten on update.

7. Custom extension subsection convention: when suggested_extensions are provided, note that custom extensions SHOULD follow the standard subsection structure (Direction/Intent, Constraints, References, Open Questions) but this is advisory, not enforced.

8. File path: write to `~/.brief/type-guides/{type}.md`. Validate path stays within the type-guides directory.

9. Content safety: enforce file size limit (configurable, default 100 KB). Restrict files to the `~/.brief/type-guides/` directory. Do not render or execute any embedded HTML, scripts, or active content.

## Exported API

Export from `src/type-intelligence/creation.ts`:
- `createTypeGuide(params: { type: string; typeAliases?: string[]; suggestedExtensions?: string[]; suggestedOntologies?: string[]; commonParentTypes?: string[]; commonChildTypes?: string[]; body: string; source?: string; force?: boolean; activeProject?: string; noActiveProject?: boolean; simulateServerUpdate?: boolean; frontmatter?: any }) → { created: boolean; filePath: string; frontmatter?: string; source: string; existingGuide?: boolean; overwritten?: boolean; backedUp?: boolean; aliasWarning?: string; aliases?: string[]; createdByProject?: string; protectedFromUpdate?: boolean; serverUpdateBlocked?: boolean; scriptExecuted?: boolean; sanitized?: boolean }`
  `filePath` pattern: `~/.brief/type-guides/*.md`. `frontmatter` is a string with `version: 1.0`. `aliasWarning` matches `/conflict|collision/i`. User-edited guides are `protectedFromUpdate`. `simulate*` params are test hooks.

## Rules

### COMPAT-09: Type Alias Uniqueness
Type aliases declared in `type_aliases` MUST be globally unique across all installed type guides. When installing or creating a type guide, the server MUST validate that no alias collision exists. If a collision is detected, the operation MUST fail with a descriptive error.
- When creating/installing a guide, check for alias collisions. If found, warn: "Alias '[x]' conflicts with existing guide '[name]'. Newer guide takes precedence." Precedence: user_edited > ai_generated > community > bundled. `brief_lint` reports collisions. (OQ-252)

### COMPAT-10: Type Guide Provenance
Type guides MUST include a `source` field in YAML frontmatter with one of: `bundled`, `ai_generated`, `community`, `user_edited`. `brief_create_type_guide` MUST set `source: ai_generated` automatically. When a user manually edits a guide file, the server SHOULD detect this and update `source` to `user_edited` on next read.

### COMPAT-12: Custom Extension Subsection Convention
Custom extensions created for unknown domains SHOULD follow the standard subsection structure: Direction/Intent, Constraints, References, Open Questions. This is a SHOULD, not a MUST — domain-specific needs may require a different structure. The AI client makes this decision based on conversation context.

### COMPAT-14: Type Guide Update Safety
When the server is updated and ships new bundled type guides, the installer MUST NOT overwrite type guides with `source: ai_generated`, `source: community`, or `source: user_edited`. Only guides with `source: bundled` may be overwritten. The generic guide (`_generic.md`) is always overwritten on server update — it has `source: bundled` and `bootstrapping: true` and is not intended for user modification. Users who want to customise adaptive mode behaviour should create domain-specific guides instead.
- `brief_create_type_guide` detects if a guide already exists. If so, return `existing_guide: true` with existing guide's source. Overwrite only with explicit `force: true`, backing up original as `[type].md.bak`. (OQ-172)

### SEC-13: Type Guide Content Safety
User-created and community type guides are markdown files with YAML frontmatter that the AI reads as conversational guidance. Beyond SEC-09 (YAML safety):
- Type guide markdown body is passed to the AI as-is — same prompt injection concerns as SEC-10 apply
- Type guide files MUST be restricted to `~/.brief/type-guides/` directory — path validation per SEC-01
- File size limit for type guides: configurable, default 100 KB per file
- The server MUST NOT render or execute any embedded HTML, scripts, or active content in type guides

## Test Fixtures

The creation module needs internal fixture guides (similar to loading's FIXTURE_GUIDES) to support alias collision and existing guide detection tests:

1. **`collider-bundled`** — `type: collider-bundled`, `source: bundled`, `type_aliases: ["colliding-alias"]`
   Used by: alias collision with lower-precedence test (ai_generated > bundled → warning)

2. **`user-owned-type`** — `type: user-owned-type`, `source: user_edited`, `type_aliases: ["user-owned-alias"]`
   Used by: alias collision with higher-precedence test (ai_generated < user_edited → error/throw)

3. **`existing-type`** — `type: existing-type`, `source: ai_generated`
   Used by: existing guide detection tests (no force → existingGuide: true; force → backup + overwrite)

These fixtures must be loaded/registered before alias uniqueness checks run. The creation module should register them into the loading module's guide state on initialization, or maintain its own alias/existence index seeded from both loading module state and these fixtures.

## Test Specification

### Unit Tests (specific input → expected output)
- Create guide with all fields → file written with correct YAML frontmatter and markdown body
- Source field → always set to ai_generated automatically
- Alias uniqueness with no collisions → guide created successfully
- Alias collision with lower-precedence guide → warning returned, newer guide takes precedence
- Alias collision with higher-precedence guide → operation fails with descriptive error
- Existing guide for same type, no force → existing_guide: true returned, no overwrite
- Existing guide for same type, force: true → original backed up as .bak, new guide written
- Guide file path → always within ~/.brief/type-guides/ directory
- Guide exceeding 100 KB → rejected
- Response includes created_by_project when active project exists → project name included
- No active project → guide still created, created_by_project omitted

### Property Tests (invariants that hold for ALL inputs)
- forAll(created guide): source is always ai_generated
- forAll(alias set): uniqueness validated against all installed guides before write
- forAll(existing guide, force=false): never overwritten
- forAll(guide path): always within ~/.brief/type-guides/ directory

## Tier 4 Criteria

Tier 4 criteria: JC-02, JC-07, JC-09, JC-10
