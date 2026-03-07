# TASK-57: Packaging — Platform Testing

## Metadata
- Priority: 59
- Status: pending
- Dependencies: TASK-07, TASK-05a
- Module path: tests/platform/
- Type stubs: none
- Also read: none
- Test file: tests/platform/platform.test.ts
- Estimated context KB: 30

## What To Build

Build platform-specific tests covering Windows, macOS, and Linux edge cases. Windows tests cover: NTFS junction resolution via `fs.realpath()` for path validation, `fs.rename()` retry logic on EPERM/EBUSY errors, reserved filename handling (CON, PRN, NUL, etc.), SIGBREAK signal handling, stdin EOF detection for client disconnection, and MAX_PATH (260 character) warning. macOS tests cover: case-insensitive filesystem behaviour and symlink handling. Linux tests cover: case-sensitive filesystem detection of multiple BRIEF.md variants in the same directory. Cross-platform tests cover: path separator normalisation (forward/backslash), `os.homedir()` resolution, and `BRIEF_HOME` environment variable override. Also includes network/cloud drive tolerance testing (timeouts, slow reads).

## Implementation Guide

1. `tests/platform/windows.test.ts` — Windows-specific tests.

2. NTFS junction resolution: verify that `fs.realpath()` is used to resolve paths before boundary validation. NTFS junctions (`fs.lstat()` reports as directories, not symlinks) must not bypass path traversal protection.

3. `fs.rename()` retry: Windows may return EPERM or EBUSY on rename if another process has the file open. Verify retry logic handles this gracefully (retry with backoff).

4. Reserved filename handling: Windows reserves names like CON, PRN, NUL, AUX, COM1-COM9, LPT1-LPT9. Verify these are detected and handled when creating files or directories.

5. SIGBREAK handling: verify the handler is registered and responds to Ctrl+Break on Windows.

6. stdin EOF: verify that when the MCP client's pipe closes, the `'end'` event on stdin is detected as client disconnection.

7. MAX_PATH: warn when paths exceed 260 characters on Windows.

8. `tests/platform/macos.test.ts` — macOS-specific tests.

9. Case-insensitive filesystem: verify that `BRIEF.md`, `brief.md`, and `Brief.md` all resolve correctly on case-insensitive filesystems.

10. Symlink handling: verify symlinks are handled correctly during hierarchy walking and path validation.

11. `tests/platform/linux.test.ts` — Linux-specific tests.

12. Case-sensitive filesystem: detect when multiple BRIEF.md variants exist in the same directory (e.g., `BRIEF.md` and `brief.md`). This is only possible on case-sensitive filesystems.

13. `tests/platform/cross-platform.test.ts` — cross-platform tests.

14. Path separator handling: verify both forward slashes and backslashes work. Internally normalise to platform native. Store in config using forward slashes.

15. `os.homedir()` resolution: verify correct home directory detection across platforms.

16. `BRIEF_HOME` environment variable: verify it overrides the default `~/.brief/` directory.

17. Network/cloud drive tolerance: verify operations on network drives (Dropbox, OneDrive, Google Drive) respect operation timeouts and handle slow reads gracefully.

## Exported API

No new module exports. Platform tests validate existing modules work correctly across Windows, macOS, and Linux — path separators, line endings, file permissions, etc. Tests import from existing modules.

## Rules

### FS-06: Cross-Platform Path Handling
The server MUST handle both forward slashes and backslashes in paths. Internally, normalise to the platform's native separator. Store paths in config using forward slashes for portability.

### FS-09: Network and Cloud Drive Tolerance
Workspace roots on network drives, Dropbox, OneDrive, or Google Drive MUST be supported without special configuration. File reads may be slower. Individual file read operations MUST respect the operation timeout (ERR-09). The server does not detect or differentiate network drives from local drives — it relies on the OS filesystem layer.

### SEC-01: No Path Traversal
All file paths MUST be validated to ensure they're within workspace roots or `~/.brief/`. Reject paths containing `..` that would escape these boundaries.
- On Windows, use `fs.realpath()` to resolve all paths before boundary validation. This resolves NTFS junctions (which `fs.lstat()` reports as directories, not symlinks) and 8.3 short filenames. Without `fs.realpath()`, junctions bypass path validation entirely. (OQ-232, OQ-233)

## Test Specification

### Unit Tests (specific input → expected output)
- Windows NTFS junction → resolved via fs.realpath() before path validation
- Windows path with junction bypassing boundary → rejected after realpath resolution
- Windows fs.rename() EPERM → retry with backoff succeeds
- Windows fs.rename() EBUSY → retry with backoff succeeds
- Windows reserved filename (CON, PRN) → detected and handled
- Windows SIGBREAK → handler registered and functional
- Windows stdin EOF → client disconnection detected
- Windows path exceeding 260 chars → warning emitted
- macOS case-insensitive match (BRIEF.md vs brief.md) → resolved correctly
- macOS symlink in hierarchy → handled correctly during walk
- Linux multiple BRIEF.md variants in same directory → detected
- Cross-platform forward slashes → normalised correctly
- Cross-platform backslashes → normalised correctly
- Config paths → stored with forward slashes
- os.homedir() → resolves correctly on all platforms
- BRIEF_HOME env var set → overrides default ~/.brief/ directory
- Network drive file read → respects operation timeout
- Slow network read → does not hang indefinitely

### Property Tests (invariants that hold for ALL inputs)
- forAll(path with ..): rejected if it would escape boundary
- forAll(Windows path): resolved via fs.realpath() before validation
- forAll(platform): path separator handling works correctly
- forAll(network drive operation): timeout always enforced

## Tier 4 Criteria

Tier 4 criteria: none
