# TASK-50: Cross-Cutting — Signal Handling, Graceful Shutdown & Crash Recovery

## Metadata
- Priority: 52
- Status: pending
- Dependencies: TASK-07, TASK-03, TASK-06
- Module path: src/server/
- Type stubs: src/types/server.ts
- Also read: src/types/config.ts
- Test file: tests/server/signal-handling.test.ts
- Estimated context KB: 45

## What To Build

Implement signal handling for graceful shutdown and startup crash recovery. Shutdown handles SIGINT (stop accepting calls, complete in-flight writes with 5s timeout, flush logs, exit 0), SIGTERM (same as SIGINT), second SIGINT during shutdown (force exit code 130), SIGPIPE on Unix (convert to EPIPE error, initiate shutdown), and Windows-specific signals (SIGBREAK, stdin end event monitoring, 5-minute inactivity timeout). Never call `process.exit()` directly — let the event loop drain. Track in-flight writes with a counter. Startup recovery includes orphaned temp file cleanup (`*.brief-tmp.*` older than 60s with symlink check), generic guide integrity check, optional bundled pack integrity verification via checksums, startup logging (version, transport, workspace roots, loaded packs/guides, duration), multi-instance detection via `.brief-lock` files, and an `unhandledRejection` safety net handler.

## Implementation Guide

1. `src/server/signal-handling.ts` — signal handlers and shutdown logic.

2. SIGINT handler: stop accepting new tool calls. Wait for in-flight writes to complete (5s timeout). Flush structured logger. Exit with code 0. Track in-flight writes using an atomic counter — increment on write start, decrement on write end.

3. SIGTERM handler: identical behaviour to SIGINT.

4. Second SIGINT during shutdown: if already shutting down when a second SIGINT is received, force immediate exit with code 130.

5. SIGPIPE handler (Unix only): register `process.on('SIGPIPE', ...)` at startup to convert SIGPIPE into an EPIPE error (catchable) rather than a fatal crash. On SIGPIPE, initiate graceful shutdown.

6. Windows signal handling: register SIGBREAK handler for Ctrl+Break. Monitor `process.stdin` for the `'end'` event — when the MCP client's pipe closes, stdin receives EOF, signalling client disconnection. Implement an inactivity timeout (default 5 minutes) as fallback for Windows disconnection detection.

6a. SIGHUP handler (Unix only): register `process.on('SIGHUP', ...)` at startup. In v1, SIGHUP triggers the same graceful shutdown flow as SIGINT/SIGTERM. Config reload without restart is a v2 stretch goal. The handler prevents the default SIGHUP behaviour (process termination without cleanup). Reference Pattern 33.

7. Never call `process.exit()` directly — let the event loop drain naturally.

8. `src/server/startup-recovery.ts` — crash recovery on startup.

9. Orphaned temp file cleanup: scan for `*.brief-tmp.*` files older than 60 seconds. Use `fs.lstat()` to check for symlinks before deleting (never follow symlinks). Remove orphaned files.

10. Generic guide integrity check: verify `~/.brief/type-guides/_generic.md` exists and is valid. If missing or corrupted, regenerate from embedded/bundled source.

11. Optional bundled content integrity: store checksums of bundled files at install time in `~/.brief/checksums.json`. Optionally verify on load (configurable, default off). Support `--verify-integrity` flag in lint.

12. Startup logging: log version, transport mode, workspace roots, loaded packs count, loaded guides count, and startup duration.

13. Multi-instance detection: check for `.brief-lock` files. If found, warn about potential concurrent instances.

14. Unhandled rejection handler: register `process.on('unhandledRejection', ...)` as safety net. Log the error and continue — don't crash.

15. Rate limiting: the token-bucket rate limiter is implemented in T08's middleware pipeline (PERF-10). Verify here that it reads per-connection configuration from config.json and that the limits (50 read/s, burst 100; 10 write/s, burst 20) are applied correctly. No new rate-limiter code is needed in this module.

## Exported API

Export from `src/server/signal-handling.ts`:
- `handleSignal(signal: string, options?: { inFlightWrites?: number; simulateSlowWrite?: boolean; operationTimeout?: boolean }) → { shutdownInitiated?: boolean; inFlightCompleted?: boolean; forceExit?: boolean; exitCode?: number; epipeConverted?: boolean; tempFilesCleaned?: boolean; completed?: boolean; cleanupPerformed?: boolean; forcedTermination?: boolean }`
  Signals: `SIGINT`, `SIGTERM`, `SIGHUP`, `SIGPIPE`, `SIGBREAK`, `stdin-end`, `inactivity-timeout`, `timeout`. SIGPIPE → converted to EPIPE warning (`epipeConverted: true`). In-flight writes drain before exit. Timeout path returns `completed: false, cleanupPerformed: true`. Slow write forced termination returns `forcedTermination: true`.
- `cleanupOrphanedTempFiles(options?: { simulateYoungFile?: boolean; simulateOldFile?: boolean; ageSeconds?: number; includeSymlinks?: boolean }) → { cleaned: boolean; cleanedCount: number; skippedYoung?: number; symlinksSkipped?: boolean }`
- `verifyGenericGuide(options?: { simulateMissing?: boolean }) → { regenerated: boolean }`
- `getStartupInfo() → { version: string; transport: string; workspaceRoots: string[]; packCount: number; guidesCount: number; duration: number }`
- `detectMultiInstance(options?: { simulateLockExists?: boolean }) → { warning?: string }`
- `handleUnhandledRejection(error: Error) → { logged: boolean; serverContinues: boolean }` — logs but does not crash
- `checkRateLimit(params: { type: 'read' | 'write'; currentRate: number }) → { exceeded: boolean }`
- `checkSecurityLimit(params: { simulateViolation?: boolean; limitType?: string }) → { violated: boolean; logged: boolean; limitName: string; actualValue: unknown; configuredLimit: unknown; adjustmentGuidance?: string }` — checks ERR-10 security limit violations
- `handleWrite(path: string, content: string, options?: { simulateFailure?: boolean }) → { failed: boolean }` — write operation with rollback on failure (ERR-07)
- `getProjectState(path?: string) → unknown` — returns current project state for rollback verification
- `handleMultiSource(params: { simulateFailCount?: number }) → { partialResults: unknown[]; failedCount: number }` — multi-source operation with partial results (ERR-11)
- `_resetState() → void` — @internal, resets module-level state for test isolation

## Rules

### CLI-08: SIGINT/SIGTERM Handling
The CLI MUST register handlers for:
- `SIGINT` (Ctrl+C) — initiate graceful shutdown, complete in-flight writes, exit 0
- `SIGTERM` — same as SIGINT (used by process managers, container runtimes)
- Second `SIGINT` during shutdown — force immediate exit with code 130
- On Windows: `process.on('SIGINT')` handles Ctrl+C; also handle `SIGBREAK` for Ctrl+Break
- Add `process.on('SIGPIPE', () => {})` at startup to convert SIGPIPE into an EPIPE error (catchable) instead of a fatal crash. On Unix, SIGPIPE fires when writing to stdout after the MCP client disconnects. (OQ-242)
- On Windows, register `SIGBREAK` handler. Also monitor `process.stdin` for the `'end'` event — when the MCP client's pipe closes, stdin receives EOF, which is the reliable signal for client disconnection on Windows. Implement an inactivity timeout (default 5 minutes) as a fallback. (OQ-243)

### CLI-09: Temp File Cleanup on Exit
On normal exit (clean shutdown), the CLI MUST clean up any temp files created during the session (atomic write intermediates, download quarantine files). On crash, orphaned temp files are cleaned up on next startup (see Design Pattern #35).

### ERR-07: Error Recovery and Cleanup
After a failed write operation, the server MUST:
1. Clean up any temp files created during the atomic write attempt
2. Release any file locks held (CONC-01)
3. Ensure the server state is identical to the pre-call state — no partial modifications

### ERR-09: Operation Timeout
All tool call handlers MUST enforce a configurable operation timeout (default: 30 seconds, via `operation_timeout` in CONF-03). If a tool call exceeds the timeout, the server MUST:
1. Cancel the in-progress operation (if possible via AbortSignal per CONC-06)
2. Clean up any partial state (per ERR-07)
3. Return a `system_error` response: "Operation timed out after {N}s. The file may be very large or the system is under heavy load."

### ERR-10: Security Limit Violations
When a security limit is exceeded (SEC-07 string\array limits, SEC-08 pack size limits, SEC-13 type guide size limits), the server MUST return a structured error using the `invalid_input` error type (ERR-05) with a `security_limit_exceeded` subtype. The error response MUST include:
- Which limit was exceeded (e.g., "pack file size")
- The actual value (e.g., "73 MB")
- The configured limit (e.g., "50 MB limit")
- How to adjust if needed (e.g., "Configure `max_pack_size` in ~/.brief/config.json to increase")

### ERR-11: Partial Results on Multi-Source Operations
When a tool call spans multiple sources (e.g., `brief_list_projects` scanning multiple workspace roots, `brief_search_ontology` across multiple packs) and one source fails, the server MUST return results from the successful sources plus a warning about the failed source. Partial results are always better than total failure. The warning includes the failed source identity and the error reason.

### SEC-14: Integrity Verification for Bundled Content
Ontology packs and type guides bundled with the npm package are trusted at install time. To detect post-install tampering:
- **Optional**: store checksums of bundled files at install time in `~/.brief/checksums.json`
- **On load**: optionally verify checksums of bundled packs/guides (configurable, default off for performance)
- **On lint**: `brief_lint` could include a `--verify-integrity` flag that checks all bundled file checksums
- This is defence-in-depth — the primary trust boundary is the npm package itself

### PERF-10: Rate limiting for tool calls.
Implement a token-bucket rate limiter: max 50 tool calls per second (burst 100). Write operations have a stricter limit (10/second). When exceeded, return `system_error`: "Rate limit exceeded." Rate limit is per-connection and configurable in config.json. (OQ-254)

## Test Specification

### Unit Tests (specific input → expected output)
- SIGINT received → graceful shutdown initiated, in-flight writes complete
- SIGTERM received → same behaviour as SIGINT
- Second SIGINT during shutdown → force exit with code 130
- SIGPIPE on Unix → converted to EPIPE error, shutdown initiated
- Windows stdin end event → shutdown initiated
- Windows inactivity timeout (5 min) → shutdown initiated
- In-flight write during shutdown → completes within 5s timeout
- In-flight write exceeding 5s → forced termination
- Startup with orphaned temp files → cleaned up
- Orphaned temp file is symlink → not followed, handled safely
- Startup with missing generic guide → regenerated from bundled source
- Startup logging → includes version, transport, workspace roots, pack count, duration
- Multi-instance detection → warning logged when lock file found
- Unhandled rejection → logged, server continues running
- SIGHUP on Unix → graceful shutdown initiated (same as SIGINT/SIGTERM)
- Rate limit exceeded (reads) → system_error returned
- Rate limit exceeded (writes) → stricter limit enforced
- Operation timeout exceeded → cancelled with cleanup
- Security limit violation → structured error with limit details

### Property Tests (invariants that hold for ALL inputs)
- forAll(shutdown): temp files always cleaned up
- forAll(startup): orphaned temp files always detected and removed
- forAll(failed write): server state identical to pre-call state
- forAll(multi-source failure): partial results always returned from successful sources

## Tier 4 Criteria

Tier 4 criteria: none
