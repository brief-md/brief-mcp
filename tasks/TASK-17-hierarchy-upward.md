# TASK-17: Hierarchy — Upward Traversal

## Metadata
- Priority: 19
- Status: pending
- Dependencies: TASK-03, TASK-09, TASK-10, TASK-05a
- Module path: src/hierarchy/
- Type stubs: src/types/hierarchy.ts
- Also read: src/types/parser.ts
- Test file: tests/hierarchy/upward.test.ts
- Estimated context KB: 40

## What To Build

Build the upward hierarchy walker that traverses from the active scope directory upward through the filesystem, collecting BRIEF.md files at each level. The walker respects a priority-ordered set of stop conditions (workspace root, depth limit, .git directory, filesystem root), handles missing intermediate levels by skipping silently, follows symlinks with circular loop detection, rejects directories with multiple BRIEF.md filename variants, and excludes sibling directories from the walk.

## Implementation Guide

1. `src/hierarchy/index.ts` — barrel re-exporting public API.

2. `src/hierarchy/walker.ts` — upward traversal engine. Accept a starting directory path and configuration (workspace roots, depth limit). Return an ordered list of discovered BRIEF.md file paths from bottom (scope) to top (nearest stop condition).

3. Stop condition evaluation (checked in priority order at each level): (a) is this directory a configured workspace root? → stop, (b) has the depth limit been reached (default 10)? → stop, (c) does this directory contain a `.git` folder? → stop, (d) is this the filesystem root (`/` or drive letter root)? → stop.

4. BRIEF.md detection: at each directory, scan for files matching `BRIEF.md` case-insensitively. If exactly one match, include it. If zero matches, skip the level silently and continue upward. If multiple case-variant matches exist (e.g., `BRIEF.md` and `brief.md`), return a hard error listing all matches.

5. Symlink handling: follow symbolic links during traversal. Track visited directory paths (resolved to real/canonical paths using a visited-set). If a directory is visited twice, stop and log a warning — do not error.

6. Sibling exclusion: the walk is strictly vertical. At each level, move to the parent directory only. Never read sibling directories or their contents.

7. Depth limit: configurable, default 10. Count from the starting directory upward.

## Exported API

Export from `src/hierarchy/walker.ts`:
- `walkUpward(startDir: string, options: { workspaceRoots: string[]; depthLimit?: number; simulateCycle?: boolean }) → Promise<string[]>`
  Returns BRIEF.md paths in bottom-to-top order. Stops at workspace root, depth limit, or `.git` directory. Throws on `BRIEF.md` vs `brief.md` case conflict in same directory.

## Rules

### HIER-01: Walk Up for Context, Down for Discovery
The hierarchy walker for **context accumulation** (`brief_get_context`) MUST only traverse upward. Downward traversal is a separate operation used for **collection discovery** (`brief_list_projects`, `brief_reenter_project` sub-project listing) and must be explicitly requested.

### HIER-02: Stop at Workspace Root
The walker MUST stop when it reaches a configured workspace root. It MUST NOT traverse above the root into parent directories.

### HIER-07: Depth Limit
The hierarchy walker MUST implement a configurable depth limit (default: 10 levels, per IMPLEMENTATION_GUIDE.md). This is a safety net for deeply nested or misconfigured hierarchies.

### HIER-08: Additional Stop Conditions
In addition to workspace root boundaries, the walker SHOULD stop at:
- `.git` directories (repository roots are natural context boundaries)
- Filesystem root (`/` or drive root on Windows)
These are secondary to workspace root boundaries (HIER-02) but provide safety for edge cases where workspace roots are very broad.

### HIER-09: Missing Layers Are Silently Skipped
If a directory in the middle of the hierarchy has no BRIEF.md file, the walker MUST skip that directory and continue traversing upward. A missing layer means that level has no declared context — it does not stop the walk or produce an error. Not every directory in a hierarchy needs a BRIEF.md.

### HIER-10: Sibling Folders Are Irrelevant
The hierarchy walk is strictly vertical (upward only). When walking from `album/track-02/`, the walker goes up to `album/` — it MUST NOT read `album/track-01/`, `album/track-03/`, or any other sibling directory. Peer projects at the same level are irrelevant to context accumulation. Their BRIEF.md files are never read during the walk.

### HIER-11: Only BRIEF.md Files Are Recognised
The walker MUST look for exactly `BRIEF.md` at each directory level. Matching is case-insensitive (`brief.md`, `BRIEF.MD`, `Brief.md` all match), but the file must be named exactly `BRIEF.md` — no other filenames match (e.g., `project-brief.md`, `README.md`, `notes.md` are never considered). No other files in the directory are read during a hierarchy walk.

### HIER-12: Multiple BRIEF.md Files in One Directory Is a Hard Error
On case-sensitive filesystems, it is possible for a single directory to contain multiple files that match the case-insensitive `BRIEF.md` pattern (e.g., `BRIEF.md` and `brief.md` both exist). This MUST be treated as a user-facing error — not a silent warning. The server MUST:
1. Identify all matching file paths
2. Surface them explicitly to the AI (which surfaces them to the user)
3. Refuse to read or write any of them until the user resolves the conflict
There is no safe default. The server cannot know which file the user intended.

### HIER-15b: Symlink Handling
The hierarchy walker MUST follow symbolic links when traversing upward. To prevent infinite loops caused by circular symlinks, the walker MUST track visited directory paths (resolved to real paths) and stop if a directory is visited twice. A circular symlink is logged as a warning, not an error.

## Test Specification

### Unit Tests (specific input → expected output)
- Three-level hierarchy (artist/album/song) → three BRIEF.md paths in bottom-to-top order
- Walk reaches configured workspace root → stops, does not traverse above
- Walk reaches depth limit of 10 → stops at limit
- Directory contains `.git` folder → stops at that directory
- Walk reaches filesystem root → stops
- Intermediate directory has no BRIEF.md → skipped silently, walk continues upward
- Directory has both `BRIEF.md` and `brief.md` → hard error listing both paths
- Directory has `project-brief.md` but no `BRIEF.md` → level skipped (not recognized)
- Symlink in path → followed, BRIEF.md at target included
- Circular symlink (directory links back to ancestor) → walk stops with warning, no error
- Starting directory is the workspace root → returns only that level's BRIEF.md
- Sibling directories present → never read, only parent directory traversed
- Custom depth limit of 3 → stops after 3 levels
- Empty hierarchy (no BRIEF.md anywhere) → empty result

### Property Tests (invariants that hold for ALL inputs)
- forAll(directory hierarchy): walker never visits a directory twice (visited-set enforced)
- forAll(hierarchy with workspace root): walker never traverses above the root
- forAll(hierarchy depth): result count never exceeds configured depth limit
- forAll(directory listing): only files matching case-insensitive "BRIEF.md" are considered

## Tier 4 Criteria

Tier 4 criteria: JC-04
