# TASK-07: File I/O Utilities

## Metadata
- Priority: 8
- Status: pending
- Dependencies: TASK-02, TASK-03, TASK-04, TASK-05a
- Module path: src/io/file-io.ts
- Type stubs: src/types/io.ts
- Also read: src/types/responses.ts, src/types/security.ts
- Test file: tests/io/file-io.test.ts
- Estimated context KB: 40

## What To Build

Atomic file writes, per-file write mutex, temp file management, optimistic concurrency checks, and cross-platform path handling. Writes use a temp-file-then-rename pattern for crash safety. Concurrent writes to the same file are serialized through an async mutex with timeout. A Windows-specific rename retry wrapper handles antivirus/indexer interference. All I/O is async-only. Implements Design Pattern 36 (Crash Recovery and Idempotent Operations). All write operations must be idempotent — if interrupted and retried, the end state must be identical to a clean completion. The temp-then-rename pattern is the primary mechanism; orphan cleanup on startup is the recovery mechanism.

## Implementation Guide

1. **Atomic write (`atomicWriteFile(targetPath, content, options?)`):** Generate temp path in SAME directory: `{basename}.brief-tmp.{crypto.randomBytes(8).hex()}`. Write with flag `'wx'` (O_EXCL). Stat original permissions before rename. Rename temp over target. Restore permissions via chmod. On failure, clean up temp in `finally`. On Windows EPERM/EBUSY, use retry wrapper.

2. **Per-file write mutex:** Map keyed by absolute normalized path. `acquireLock(path, timeout=10000)` returns release function. Chain with timeout if lock exists. Clean up entries when no waiters remain. Normalize path so different representations share a lock.

3. **Lock scope:** Validate/format BEFORE lock. Inside lock: read -> compute -> write temp -> rename -> release.

4. **Orphan temp file detection:** On startup, scan for `*.brief-tmp.*` in workspace roots and `~/.brief/`. Log orphans at `warn`. Delete if older than 1 hour. Preserve recent ones (may be in-progress). Before deleting any candidate temp file, use `fs.lstat()` (not `fs.stat()`) to confirm it is a regular file (`stats.isFile() === true`). Skip symlinks, directories, and special files with a debug-level log — do not delete them. This prevents a TOCTOU race where an attacker pre-creates a symlink at the predicted temp path. (OQ-247)

5. **Windows rename retry (`renameWithRetry`):** On EPERM/EBUSY, exponential backoff (50, 100, 200, 400ms), max 4 retries. Non-Windows: direct rename, no retry. On Windows, `EBUSY` errors can also occur during file reads (not just renames) when antivirus or indexer software holds a transient lock. Apply the same retry-with-backoff approach (up to 4 retries, 50/100/200/400ms delays) to `fs.promises.readFile` calls that return `EBUSY`. Include a note in README recommending that users add their workspace directories to antivirus exclusions for best performance. (OQ-198)

6. **Optimistic concurrency (`checkMtime(path, expectedMtime)`):** Compare current mtime to expected. If changed, return warning: "File was modified externally since it was read. Proceeding will overwrite external changes. Call again with `force=true` to proceed." If `force`, skip check.

7. **Writability pre-check:** `fs.promises.access(path, W_OK)` for existing files, check parent dir for new files. Throw `system_error` with suggestion on failure.

8. **All exports use `fs.promises` exclusively.** No sync filesystem calls. All `fs.promises.readFile` calls in this module MUST go through the file descriptor semaphore from TASK-05a's `src/security/path-validation.ts`. Import and use the semaphore's `acquire()` before each read and release it in a `finally` block. This limits concurrent open file descriptors to 50 system-wide and retries on EMFILE. (OQ-120; Design Pattern 34)

9. **Windows MAX_PATH guard:** Before any file operation on Windows, check if the resolved absolute path exceeds 260 characters. If so, log a warning at `warn` level: `"Path length [N] chars approaches Windows MAX_PATH limit (260). Operations may fail. Enable long path support in Windows Settings or Group Policy."` If a path-length error occurs at runtime (`ENAMETOOLONG`), return `system_error` with guidance: `"Path exceeds Windows MAX_PATH limit. Enable long paths via Windows Settings > System > For Developers > Enable Win32 Long Paths."` (OQ-169)

10. **Crash recovery scope documentation:** Atomic writes are per-file only. Operations that write to multiple files (e.g., update BRIEF.md and then update config.json as part of the same logical operation) are NOT transactional — if the process crashes between the two writes, the files will be in an inconsistent state. This is the accepted v1 limitation (OQ-222). Document this in ARCHITECTURE.md. Tool implementations MUST order their writes with the most important file first, so that partial completion still leaves the primary file in a valid state. Implements Design Pattern 34 (File-Level Concurrency Control): per-file mutex (not global) allows concurrent operations on different files; reads are lock-free; lock scope is minimised per CONC-03.

## Exported API

Export from `src/io/file-io.ts`:
- `atomicWriteFile(targetPath: string, content: string, options?: { dryRun?: boolean; returnTempName?: boolean }) → Promise<void | { tempFileName: string }>` — uses O_EXCL (wx) for temp file, atomic rename
- `acquireLock(targetPath: string, timeout?: number) → Promise<() => void>` — returns release function, default timeout 10000ms
- `detectOrphanTempFiles(roots: string[], options?: { signal?: AbortSignal }) → Promise<void>` — deletes `*.brief-tmp.*` files >1 hour old, uses `fs.lstat()`
- `renameWithRetry(src: string, dest: string) → Promise<void>` — retries on EBUSY (Windows)
- `checkMtime(filePath: string, expectedMtime: Date, options?: { force?: boolean }) → Promise<string | undefined>` — returns warning if modified externally, skip if force
- `writeFileSafe(filePath: string, content: string) → Promise<{ isError?: boolean; message?: string }>` — writability pre-check
- `checkWindowsMaxPath(filePath: string) → void` — throws if >260 chars on Windows
- `getLockKey(filePath: string) → string` — normalized path key for lock map

## Rules

### CONC-01: Per-File Write Mutex
Write operations to the same BRIEF.md file MUST be serialised using an async mutex (one writer at a time per file). Read operations do NOT acquire the mutex. The mutex is keyed by the absolute normalised file path. Apply the same per-file write mutex to `~/.brief/config.json`, not only to BRIEF.md files. Multiple tools write config (`brief_add_workspace`, `brief_set_tutorial_dismissed`).

### CONC-02: Lock Timeout
Mutex acquisition MUST have a timeout (default: 10 seconds). If the lock cannot be acquired within the timeout, the tool call returns an error: "File is currently being written by another operation." This prevents deadlocks.

### CONC-03: Lock Scope Minimisation
The write mutex MUST be held for the minimum necessary duration: acquire lock -> read current file -> compute changes -> write temp file -> rename temp to target -> release lock. Do NOT hold the lock during validation, formatting, or other CPU-bound work that doesn't need the file.

### CONC-04: File Descriptor Hygiene
The server MUST NOT hold file descriptors open between tool calls. Every file operation opens, reads/writes, and closes within the same call. Use `fs.promises.readFile` / `fs.promises.writeFile` which handle open/close internally, rather than manual `fs.open` + `fs.read` + `fs.close`.

### CONC-05: Temp File Naming
Temp files from atomic writes MUST use a unique naming pattern to avoid collisions: `{original-filename}.brief-tmp.{random-hex}`. This pattern is used for orphan detection on startup (scan for `*.brief-tmp.*` files).

### CONC-06: Async Operation Cancellation
Long-running async operations (workspace scanning, ontology search across many packs) SHOULD support cancellation via an `AbortSignal`. When the server receives a shutdown signal, it cancels pending async operations rather than waiting for completion.

### CONC-07: No Shared Mutable State Between Tool Calls
Tool handlers MUST NOT share mutable state except through: The file system (read from disk), The in-memory ontology index cache (read-only from tool handlers, rebuilt only by pack install/update), The config object (read-only from tool handlers, updated only by explicit config tools), The file lock manager (thread-safe by design). All other state is local to the tool call.

### CONC-08: Multi-Process Access Is a v1 Known Limitation
The in-process async mutex (CONC-01) only protects against concurrent writes within a single server process. It does NOT protect against multiple brief-mcp server instances writing to the same BRIEF.md file simultaneously (e.g., two AI clients both running brief-mcp against the same workspace).

**v1 documented limitation:** "Running multiple brief-mcp instances against the same workspace simultaneously is not supported in v1. The last write wins. The atomic write pattern (temp + rename) guarantees no file corruption, but changes from one instance may be silently overwritten by another."

The server SHOULD detect potential concurrent instances at startup by checking for recent `.brief-lock` files and logging a warning if found.

**v2 path:** Implement advisory OS-level file locking using a `.brief-lock` sidecar file per BRIEF.md. Document this as a community protocol so other tools can participate. All processes that respect the convention check and set the lock before writing.

### CONC-09: Optimistic Concurrency Check (mtime)
Before writing to a BRIEF.md, the writer SHOULD compare the file's `mtime` to what it was when the file was read for this operation. If the mtime has changed (external edit detected), the tool call MUST return a warning: "File was modified externally since it was read. Proceeding will overwrite external changes. Call again with `force=true` to proceed." This is an optimistic concurrency check — it does not guarantee detection of all races but catches the common case.

## Test Specification

### Unit Tests (specific input -> expected output)
- Atomic write to new file -> file exists with correct content
- Atomic write to existing file -> content replaced, no partial writes observable
- Simulated crash after temp write, before rename -> original file unchanged, orphan temp file remains
- Orphaned temp file older than 1 hour -> cleaned up on startup; recent -> preserved
- Atomic write preserves original file permissions
- Temp file creation with O_EXCL -> if path exists, fails safely (no overwrite)
- Concurrent writes to same file -> serialised, both succeed in order
- Lock timeout exceeded (slow writer holds >10s) -> second writer gets timeout error
- Lock released -> next waiter acquires immediately
- Paths with different separator styles or `..` segments -> same lock key after normalization
- No waiters remaining -> lock manager cleans up (no memory leak)
- Read operations -> proceed without acquiring lock
- Windows rename EBUSY -> retried with backoff, succeeds on retry
- All retries exhausted -> error propagated with retry context
- Mtime unchanged since read -> concurrency check passes silently
- Mtime changed (external edit) -> warning with "modified externally" message
- Mtime check with `force=true` -> skipped, write proceeds
- File not writable -> pre-check error with permission suggestion

### Property Tests (invariants that hold for ALL inputs)
- forAll(content string): atomic write then read produces identical content
- forAll(N concurrent writes to same path): exactly N sequential writes; final content = last writer
- forAll(path string): lock key is identical regardless of slash direction or `..` segments
- forAll(temp file name): matches pattern `*.brief-tmp.*`

## Tier 4 Criteria

Tier 4 criteria: JC-10
