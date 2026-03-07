# TASK-22: Workspace — Project Creation

## Metadata
- Priority: 24
- Status: pending
- Dependencies: TASK-14, TASK-21, TASK-05a
- Module path: src/workspace/
- Type stubs: src/types/workspace.ts
- Also read: src/types/writer.ts
- Test file: tests/workspace/creation.test.ts
- Estimated context KB: 45

## What To Build

Implement `brief_create_project` and `brief_create_sub_project` MCP tools. These create project directories with initial BRIEF.md files containing required metadata and optional core sections. Handles name slugification, recursive directory creation, adopting existing directories, detecting already-existing projects, first-project flag detection, and project type format normalization. Content parameters allow the AI to populate initial sections (What This Is, What This Is NOT, Why This Exists) at creation time.

## Implementation Guide

1. `src/workspace/creation.ts` — project and sub-project creation.

2. `brief_create_project` handler: accept parameters `project_name` (required), `display_name` (optional, defaults to project_name), `type` (required per spec), `workspace_root` (optional, defaults to active root), `parent_project` (optional absolute path), and content parameters `what_this_is` (required), `what_this_is_not` (optional), `why_this_exists` (optional).

3. Name slugification: apply NFKD normalization, strip combining marks, lowercase, replace spaces/underscores with hyphens, strip non-`[a-z0-9-]` characters, collapse multiple hyphens, trim leading/trailing hyphens, truncate to 64 chars, check against Windows reserved names (CON, PRN, AUX, NUL, COM1-9, LPT1-9) — prefix with `project-` if match. Reject if result is empty.

4. Directory creation: create the project directory (and all intermediate directories) recursively. If directory exists but has no BRIEF.md, adopt it (create BRIEF.md inside, return `initialized_existing: true`). If BRIEF.md already exists, return error.

5. Initial BRIEF.md: write using the core writer (T14) with canonical metadata field order (Project, Type, Created, Status). Type field normalized to lowercase-hyphens. Include requested content sections.

6. `brief_create_sub_project` handler: accept `name`, `display_name`, `what_this_is`, `type` (optional, inherits parent's type), `subdirectory` (optional relative path for grouping). Creates within the active project's directory.

7. First-project flag: check if any other projects exist across all workspace roots. If none, include `first_project: true` in response (triggers tutorial offer).

8. Extension suggestion: when a type is declared, include `suggest_extensions: true` in response to prompt the AI to offer extension suggestions.

## Exported API

Export from `src/workspace/creation.ts`:
- `createProject(options: { projectName: string; displayName?: string; type: string; whatThisIs: string; whatThisIsNot?: string; whyThisExists?: string; workspaceRoot?: string; parentProject?: string; isFirstProject?: boolean; directoryExists?: boolean; hasBrief?: boolean }) → { content: string; success: boolean; filePath: string; path: string; directoriesCreated?: string[]; initializedExisting?: boolean; firstProject?: boolean; suggestExtensions?: boolean; warnings?: string[] }`
  Metadata fields: Project, Type, Extensions, Status, Created, Updated, Ontologies, Version
- `createSubProject(options: { name: string; type?: string; whatThisIs: string; parentPath: string; subdirectory?: string; inheritTypeFromParent?: boolean }) → { success: boolean; path: string; type?: string; typeInherited?: boolean }`
- `slugifyProjectName(name: string) → string` — max 64 chars, handles Windows reserved names
- `normalizeProjectType(type: string) → string` — lowercase with hyphens

## Rules

### FS-03: Slugify Project Names
When creating project directories from names, use a consistent slugification: lowercase, hyphens for spaces, strip special characters. e.g., "My Cool Song!" → "my-cool-song".
- Slugification rules: NFKD normalize, strip combining marks, lowercase, replace spaces/underscores with hyphens, strip non-`[a-z0-9-]` characters, collapse multiple hyphens, trim leading/trailing hyphens, truncate to 64 chars, check against Windows reserved names (CON, PRN, AUX, NUL, COM1-9, LPT1-9) — prefix with `project-` if match. Reject if result is empty. (OQ-210)

### FS-04: Create Directories Recursively
When creating a sub-project, create all intermediate **filesystem** directories as needed (e.g., `albums/midnight-train/songs/`). Don't fail if the parent directory structure doesn't exist yet.

This does not create BRIEF.md files at intermediate levels — only the target project's BRIEF.md is created. Parent BRIEF.md files can be added later if hierarchical context is needed. "Intermediate directories" refers to the filesystem path, not the BRIEF.md project hierarchy.

### FS-10: Adopt existing directories for project creation.
When `brief_create_project` targets a directory that exists but has no BRIEF.md, create the BRIEF.md inside it and return `initialized_existing: true`. If BRIEF.md already exists, return `user_error`: "Project already exists." Log: "Initialized BRIEF.md in existing directory containing [N] files." (OQ-211)

### FS-13: `brief_create_project` Parameter Semantics (GAP-S01)
- `project_name`: Used to derive the directory slug (via FS-03 slugification). Required.
- `display_name`: Written as the `**Project:**` metadata field value. If omitted, defaults to `project_name`.
- `workspace_root`: When specified, creates the project under that root. When omitted, uses the active workspace root. Must be a configured workspace root path.
- `parent_project`: When provided, the new project is nested as a child of the specified project. Equivalent to calling `brief_create_sub_project` from within the parent's scope. Takes the absolute path of the parent BRIEF.md or its directory.

### FS-14: `brief_create_sub_project` Parameter Semantics (GAP-S02)
- `name`: Slugified to derive the sub-project directory name (same FS-03 rules as `brief_create_project`).
- `display_name`: Written as the `**Project:**` metadata field. Defaults to `name` if omitted.
- `subdirectory`: Optional relative path segment inserted between the parent's directory and the child's directory. Enables grouping (e.g., `subdirectory: "songs"` creates `{parent}/songs/{slug}/BRIEF.md`). If omitted, the child is created directly inside the parent directory.

### COMPAT-04: Type as Required Field
Per the BRIEF.md core spec, `Type` is a **required** metadata field. The MCP server's `brief_create_project` tool SHOULD treat `type` as required (not optional) to produce valid BRIEF.md files. If omitted, the created file is technically invalid per the core spec.

### COMPAT-06: Project Type Format
Per the BRIEF.md core spec, project type values MUST be lowercase with hyphens for multi-word types (e.g., `song`, `music-video`, `product-line`). The parser should normalise input types to this format (replace underscores with hyphens, lowercase).

## Test Specification

### Unit Tests (specific input → expected output)
- Create project "My Cool Song!" → directory named "my-cool-song" created
- Create project with display_name → BRIEF.md has display_name in Project metadata field
- Create project without display_name → project_name used as Project field
- Type "Music Video" → normalized to "music-video" in metadata
- Create with what_this_is content → What This Is section present in generated BRIEF.md
- Create with all optional content params → all three core sections present
- Directory exists with no BRIEF.md → BRIEF.md created, response indicates the directory was already present
- Directory exists with BRIEF.md → error indicating project already exists
- Intermediate directories don't exist → created recursively
- Sub-project with subdirectory parameter → created at parent/subdirectory/slug/BRIEF.md
- Sub-project without subdirectory → created at parent/slug/BRIEF.md
- Name resulting in Windows reserved name (CON) → prefixed with "project-"
- Name resulting in empty slug → rejected with error
- Name longer than 64 chars after slugification → truncated to 64
- First project in workspace (no others exist) → response indicates this is the first project in the workspace
- Subsequent project → no first-project indication in response
- Type omitted → file created but noted as technically invalid

### Property Tests (invariants that hold for ALL inputs)
- forAll(project name): slugified result contains only [a-z0-9-] characters
- forAll(project name): slugified result has no leading/trailing/consecutive hyphens
- forAll(type string): normalized result is lowercase with hyphens only
- forAll(create operation): BRIEF.md always has Project, Type, Created metadata fields

## Tier 4 Criteria

Tier 4 criteria: JC-02, JC-07, JC-09
