# TASK-21: Workspace — Active Project & Workspace

## Metadata
- Priority: 23
- Status: pending
- Dependencies: TASK-20, TASK-06
- Module path: src/workspace/
- Type stubs: src/types/workspace.ts
- Also read: src/types/config.ts
- Test file: tests/workspace/active.test.ts
- Estimated context KB: 40

## What To Build

Implement `brief_set_active_project` and `brief_add_workspace` MCP tools, plus the `requireActiveProject()` guard utility. The server maintains exactly one active project (and optionally one active scope within it) in memory. `brief_set_active_project` sets the active project by name or absolute path with disambiguation on collision. `brief_add_workspace` adds a new workspace root to the configuration at runtime. The `requireActiveProject()` utility verifies the active project still exists on disk before any tool operation.

## Implementation Guide

1. `src/workspace/active.ts` — active project state management.

2. In-memory state: maintain the current active project path and optional scope path. This state is NOT persisted — it resets on server restart. On session start, the AI calls `brief_set_active_project` or `brief_reenter_project`.

3. `brief_set_active_project` handler: accept project identifier (name string or absolute path) and optional `scope` parameter. If name provided, search across all workspace roots. If exactly one match, set as active. If multiple matches, return error listing all matches with full paths. If no match, return not_found.

4. Scope parameter: sets a sub-project within the active project. Lenient — a scope path that doesn't exist yet on disk is accepted (returns `path_not_found: true`, logs at debug). This avoids chicken-and-egg issues with `brief_create_sub_project`. The `scope` parameter MUST be a relative path (no leading `/` or drive letter). The server resolves it by joining it with the active project's root directory: `path.join(activeProjectRoot, scope)`. Reject absolute scope paths with `user_error`. After joining, apply standard path validation (TASK-05a) to ensure the resolved path remains within the workspace root. (OQ-072)

5. `brief_add_workspace` handler: accept an absolute directory path. Validate the path exists and is a directory. Add to config's workspace roots array. Write config to disk immediately (via T06). The new root is available for the next tool call.

6. `requireActiveProject()` guard: called at the start of any tool that needs an active project. Verify the active project path still exists on disk. If deleted, clear stale state and return system_error. If no active project is set, return a clear error. The guard MUST be called at the entry point of ALL tools that operate on an active project scope — specifically these tools from the full tool list must call it before any file I/O: `brief_get_context`, `brief_get_constraints`, `brief_get_decisions`, `brief_get_questions`, `brief_add_decision`, `brief_add_constraint`, `brief_add_question`, `brief_resolve_question`, `brief_capture_external_session`, `brief_update_section`, `brief_lint`, `brief_check_conflicts`, `brief_reenter_project`. Export `requireActiveProject()` as a callable module function so all tool modules can import and invoke it directly. (OQ-226)

7. Multi-session documentation: include a note in the active project module documentation: "Each AI client session maintains its own active project state in-process. Multiple sessions can work on different projects in parallel safely. Working on the same project from two sessions simultaneously will surface CONC-09 mtime conflict warnings on the second write — this is the v1 concurrency model." (OQ-191)

## Exported API

Export from `src/workspace/active.ts`:
- `setActiveProject(options: { identifier: string; workspaceRoots: string[]; scope?: string; simulateDuplicates?: boolean }) → { success: boolean; activeProject?: { name: string; path: string }; activeScope?: string; pathNotFound?: boolean; isError?: boolean; error?: string }`
  `identifier`: project name or absolute path. `scope`: relative path (not absolute).
- `addWorkspace(options: { path: string }) → { success: boolean; workspaceAdded?: string; config?: any; configUpdated?: boolean; configPath?: string }`
- `requireActiveProject(options?: { simulatePathDeleted?: boolean; activePath?: string }) → Promise<{ isError?: boolean; content?: any; errorType?: string; activeProjectCleared?: boolean }>`
- `getActiveProject() → { name: string; path: string } | undefined`
- `clearActiveProject() → void`

## Rules

### ARCH-06: Single Active Project (Explicit Switching)
The server maintains exactly one active project (and optionally one active scope within it) at a time. All context reads/writes target the active project/scope unless overridden by a `scope` parameter. Switching policy: The active project only changes via an explicit `brief_set_active_project` call. If the user navigates to a different project directory, the AI SHOULD ask whether they want to switch — but MUST also warn that switching mid-session triggers a full context gather, which contributes to context rot in long conversations. Persistence: The active project is held in-memory only. It does not survive server restart. On session start, the AI calls `brief_set_active_project` (or `brief_reenter_project`, which implicitly sets it).

### FS-08: Project Name Disambiguation
When `brief_set_active_project` receives a project name that matches projects in multiple workspace roots, the server MUST return an `invalid_input` error listing all matching projects with their full absolute paths. The user must provide the full path or a disambiguating prefix. The server MUST NOT guess which project the user intended.

### FS-12: Non-Existent Scope Path Handling
`brief_set_active_project` accepts scope paths that don't yet exist on disk (lenient). Log at debug level. Tools reading from scope naturally return less data. Avoids chicken-and-egg with `brief_create_sub_project`. (OQ-190)

### CONF-04: Config Changes at Runtime
`brief_add_workspace` modifies config at runtime. After modification, the config MUST be written to disk immediately and the new root MUST be available for the next tool call.

## Test Specification

### Unit Tests (specific input → expected output)
- Set active project by name (unique) → project set successfully
- Set active project by absolute path → project set successfully
- Set active project by name matching multiple → error listing all matches with full paths
- Set active project by name matching none → not_found error
- Set scope to existing sub-project → scope set successfully
- Set scope to non-existent path → accepted with path_not_found flag, no error
- Active project not set, tool requires it → clear error indicating no active project
- Active project path deleted after being set → requireActiveProject returns system_error, state cleared
- Add workspace with valid directory path → added to config, written to disk immediately
- Add workspace with non-existent path → error
- Add workspace, then list projects → new root's projects included
- Active project state after server restart simulation → state is empty (in-memory only)
- Set active project, then set different one → previous project replaced

### Property Tests (invariants that hold for ALL inputs)
- forAll(project name): disambiguation never guesses, always errors on ambiguity
- forAll(scope path): non-existent paths accepted without error
- forAll(config modification): config file on disk always reflects latest state
- forAll(tool call requiring active project): requireActiveProject always validates path exists

## Tier 4 Criteria

Tier 4 criteria: JC-02, JC-07, JC-09
