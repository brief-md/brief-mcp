# TASK-20: Workspace — Project Listing & Filtering

## Metadata
- Priority: 22
- Status: pending
- Dependencies: TASK-19, TASK-06, TASK-08
- Module path: src/workspace/
- Type stubs: src/types/workspace.ts
- Also read: src/types/hierarchy.ts, src/types/parser.ts
- Test file: tests/workspace/listing.test.ts
- Estimated context KB: 45

## What To Build

Implement the `brief_list_projects` MCP tool. This tool scans all configured workspace roots using the downward collection discovery scanner (T19), assembles project summaries (name, type, status, last updated, workspace root, decision count, question count), and supports filtering by status and type. Results are grouped by workspace root with absolute paths throughout. Handles missing roots gracefully, detects nested workspace roots, and deduplicates accordingly.

## Implementation Guide

1. `src/workspace/index.ts` — barrel re-exporting public API.

2. `src/workspace/listing.ts` — project listing and filtering implementation.

3. Register `brief_list_projects` tool handler with the MCP server (T08). Accept optional parameters: `status_filter`, `type_filter`.

4. Load configured workspace roots from config (T06). Use `Promise.allSettled()` (not `Promise.all()`) to scan all workspace roots concurrently — a single failing root must not prevent results from healthy roots. For each root: if root exists, scan via T19's discovery engine. If root is missing (e.g., disconnected drive), log warning and include in a `warnings` array — continue with other roots. This implements the ERR-11 partial-result contract: always return results from successful roots plus warnings for failed roots. Reference ERR-01 and OQ-244.

5. Project summary assembly: for each discovered BRIEF.md, parse metadata to extract project name, type, status, last updated date, and count decisions and open questions.

6. Status filter mapping: `"active"` → matches statuses [concept, development, production]; `"paused"` → matches [paused]; `"complete"` → matches [released/complete]; `"archived"` → matches [archived]. Case-insensitive matching.

7. Type filter: case-insensitive match against project type field.

8. Combined filtering: multiple filters use AND logic. No filters returns all projects. Empty results are valid (not an error).

9. Nested workspace root handling: at startup, check if any root is a prefix of another. When scanning the broader root, skip directories that are themselves workspace roots. Projects associate with the deepest matching root.

10. All paths in output are absolute. Results grouped by workspace root. Response includes the applied filters for transparency.

11. Homoglyph warning: after assembling the full project list, compare all project directory names for visual similarity using NFKD normalization. If two or more project names normalize to the same string (or produce the same character sequence after normalization), include an advisory warning in the response: "Warning: projects [A] and [B] have visually similar names and may cause confusion." This is a non-blocking advisory warning, not an error — the project list is still returned. (OQ-237; Pattern 13)

## Exported API

Export from `src/workspace/listing.ts`:
- `listProjects(options: { workspaceRoots: string[]; statusFilter?: string; typeFilter?: string; simulateHomoglyphProjects?: boolean }) → { groups: any; projects: any[]; warnings: string[]; appliedFilters?: any; normalizedPaths?: string[] }`
  Projects include: `name`, `type`, `status`, `updated`, `decisionCount`, `questionCount`. Grouped by workspace root.
- `applyFilters(projects: any[], filters: { statusFilter?: string; typeFilter?: string }) → any[]`
  Status mapping: `'active'` = concept|development|production; `'complete'` = complete|released. Type filter is case-insensitive.
- `detectNestedRoots(roots: string[]) → { hasNesting: boolean }`

## Rules

### FS-01: Respect Workspace Root Boundaries
The server MUST NOT read or write files outside of:
- Configured workspace roots and their subdirectories
- `~/.brief/` configuration directory

### FS-02: Handle Missing Roots Gracefully
If a configured workspace root doesn't exist on disk (e.g., disconnected external drive), the server MUST warn but not fail. Other roots continue to work.

### FS-05: No Directory Deletion
The server MUST NOT delete directories or BRIEF.md files. Removal/cleanup is the user's responsibility.

### FS-07: Missing File Handling Policy
The server MUST have an explicit policy for each missing-file scenario. See ERR-06 for the full taxonomy. The key distinction:
- **Missing workspace root** (drive disconnected): warn and continue serving other roots — not an error
- **Missing BRIEF.md within a valid root** (file deleted by user): `not_found` response with a clear signal — the user needs to act
- **Missing BRIEF.md at a hierarchy level** (directory exists, no BRIEF.md): silent skip, continue walking — expected and normal
- **Missing pack file** (installed in config but deleted from disk): warn, exclude from search, suggest reinstall

In all cases, the server MUST NOT crash. Every missing-file scenario produces a useful, structured response.

### FS-08: Project Name Disambiguation
When `brief_set_active_project` receives a project name that matches projects in multiple workspace roots, the server MUST return an `invalid_input` error listing all matching projects with their full absolute paths. The user must provide the full path or a disambiguating prefix. The server MUST NOT guess which project the user intended.
- `brief_list_projects` filter behavior: multiple filters use AND logic, no filters returns all, empty results is valid (not error), type_filter is case-insensitive. Response includes applied filters for transparency. (OQ-212)
- `status_filter` value mapping (GAP-S04): `"active"` matches projects with status `concept`, `development`, or `production`; `"complete"` matches `complete`; `"archived"` matches `archived`. Filter values are case-insensitive.

### FS-09: Network and Cloud Drive Tolerance
Workspace roots on network drives, Dropbox, OneDrive, or Google Drive MUST be supported without special configuration. File reads may be slower. Individual file read operations MUST respect the operation timeout (ERR-09). The server does not detect or differentiate network drives from local drives — it relies on the OS filesystem layer.

### FS-11: Nested Workspace Root Detection
At startup, check if any workspace root is a prefix of another. If nesting found: log warning, when scanning broader root skip directories that are themselves workspace roots. Projects associate with deepest matching root. (OQ-168)

### RESP-05: Absolute Paths in Output
All file paths in tool responses MUST be absolute paths. No relative paths, no `~` shorthand.

## Test Specification

### Unit Tests (specific input → expected output)
- Two workspace roots with projects → all projects listed, grouped by root
- Status filter "active" → only projects with status concept, development, or production
- Status filter "complete" → only projects with released/complete status
- Type filter "song" → only song-type projects, case-insensitive
- Both status and type filters → AND logic applied, only projects matching both
- No filters → all projects returned
- Filters matching nothing → empty result, not an error
- Missing workspace root (disconnected) → warning, other roots still scanned
- All paths in response → absolute, no relative paths or ~ shorthand
- Nested workspace roots (one is prefix of another) → projects not duplicated, associate with deepest root
- Project summary → includes name, type, status, updated date, decision count, question count
- Response → includes applied filters for transparency

### Property Tests (invariants that hold for ALL inputs)
- forAll(workspace roots): missing roots never cause crash, only warnings
- forAll(filter combination): results always satisfy all applied filters (AND logic)
- forAll(project in result): all paths are absolute
- forAll(nested roots): no project appears in results more than once

## Tier 4 Criteria

Tier 4 criteria: JC-02, JC-07, JC-09
