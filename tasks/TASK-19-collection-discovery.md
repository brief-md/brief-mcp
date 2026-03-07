# TASK-19: Hierarchy — Collection Discovery (Downward Scan)

## Metadata
- Priority: 21
- Status: pending
- Dependencies: TASK-09, TASK-05a
- Module path: src/hierarchy/
- Type stubs: src/types/hierarchy.ts
- Also read: src/types/parser.ts
- Test file: tests/hierarchy/discovery.test.ts
- Estimated context KB: 35

## What To Build

Build the downward collection discovery scanner that walks recursively through workspace roots and project hierarchies to discover child projects. This is the inverse of the upward walker — it finds sub-projects below a given directory. Used by `brief_list_projects` for workspace scanning and `brief_reenter_project` for sub-project listing. The scanner reads only metadata (not full file content) for performance, skips hidden directories, respects a configurable depth limit, and returns results sorted by most-recently-updated.

## Implementation Guide

1. `src/hierarchy/discovery.ts` — downward scan engine.

2. Accept a starting directory (workspace root or project directory) and configuration (scan depth limit, hidden directory patterns). Return a list of discovered project summaries.

3. Recursive directory scan: use `fs.readdir` with `withFileTypes: true` to avoid extra stat calls. For each directory entry that is a directory (or symlink to a directory), recurse.

4. Hidden directory skipping: skip directories starting with `.` (e.g., `.git`, `.node_modules`, `.venv`) and other common non-project directories. Use a configurable skip list.

5. BRIEF.md detection: at each directory, check for a case-insensitive `BRIEF.md` match. When found, read only metadata using the `parseMetadataOnly()` fast path (reads first ~50 lines until the first section heading).

6. Depth limit: configurable, default 5 levels from the starting directory. Do not recurse beyond this limit.

7. Result assembly: for each discovered BRIEF.md, extract project name, type, status, and last-updated date from metadata. Sort results by most-recently-updated first.

8. All file I/O must use async APIs (`fs.promises.*`).

## Exported API

Export from `src/hierarchy/discovery.ts`:
- `scanDownward(dir: string, options?: { depthLimit?: number; metadataOnly?: boolean; simulateLargeDirectory?: boolean }) → Promise<Array<{ name: string; type?: string; metadata?: any; sections?: any; updated: string }>>`
  Default depth: 5. Skips hidden dirs (`.git`, `node_modules`). Sorts by most-recently-updated first. Case-insensitive `BRIEF.md` matching (`brief.md`, `BRIEF.MD`, etc.).

## Rules

### HIER-01: Walk Up for Context, Down for Discovery
The hierarchy walker for **context accumulation** (`brief_get_context`) MUST only traverse upward. Downward traversal is a separate operation used for **collection discovery** (`brief_list_projects`, `brief_reenter_project` sub-project listing) and must be explicitly requested.

### HIER-14: Down-Walk for Collection Discovery
While context accumulation walks upward (HIER-01), **collection discovery** walks downward to find child projects. Tools that scan downward (`brief_list_projects`, sub-project listing in `brief_reenter_project`) MUST:
- Read only metadata (first ~50 lines) of each discovered BRIEF.md, not full content (PERF-08)
- Skip hidden directories (`.git`, `.node_modules`, `.venv`, etc.) during recursive scans (PERF-04)
- Respect the configurable scan depth limit (default: 5 levels within each workspace root)
- Return results sorted by most-recently-updated first

### PERF-04: Directory Scan Optimisation
`brief_list_projects` scans workspace roots for BRIEF.md files. For large roots (1000+ directories), the scan SHOULD:
- Read only the first ~50 lines of each BRIEF.md (metadata only, not full content)
- Use `fs.readdir` with `withFileTypes: true` to avoid extra `stat` calls
- Skip hidden directories (`.git`, `.node_modules`, `.venv`, etc.) during recursive scans
- Respect a configurable scan depth limit (default: 5 levels deep within each workspace root)

### PERF-08: No Unnecessary Disk Reads
When a tool call only needs metadata (e.g., project name and type for listing), the server MUST NOT parse the full BRIEF.md. Implement a `parseMetadataOnly` fast path that reads only until the first section heading.

## Test Specification

### Unit Tests (specific input → expected output)
- Directory with three child projects → all three discovered with correct metadata
- Nested projects (grandchildren) → discovered up to depth limit
- Hidden directory `.git` present → skipped, not scanned
- Hidden directory `.node_modules` present → skipped, not scanned
- Scan depth limit of 2 → projects at level 3+ not discovered
- Default depth limit of 5 → projects at level 6+ not discovered
- BRIEF.md with only metadata → metadata extracted without full parse
- Results from multiple projects → sorted by most-recently-updated first
- Directory with no BRIEF.md files anywhere → empty result
- Mixed hierarchy: some directories have BRIEF.md, some don't → only those with BRIEF.md returned
- Case-insensitive BRIEF.md matching → `brief.md`, `BRIEF.MD` all discovered
- Large directory tree → only metadata read from each file, full content not parsed

### Property Tests (invariants that hold for ALL inputs)
- forAll(directory tree): discovered projects never exceed configured depth limit
- forAll(directory tree): hidden directories are never scanned
- forAll(discovered projects): results are always sorted by most-recently-updated
- forAll(BRIEF.md file): only metadata is read, never full content

## Tier 4 Criteria

Tier 4 criteria: none
