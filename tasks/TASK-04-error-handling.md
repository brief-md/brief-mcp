# TASK-04: Errors — Error Handling Framework

## Metadata
- Priority: 4
- Status: pending
- Dependencies: TASK-02, TASK-03
- Module path: src/errors/
- Type stubs: src/types/responses.ts
- Also read: none
- Test file: tests/errors/errors.test.ts
- Estimated context KB: 40

## What To Build

Build a centralized error handling framework with five taxonomy categories, a structured error response builder, and a tool handler error boundary that catches any thrown error and returns an MCP-compliant response with isError: true. Also provides a partial-success utility wrapping multiple async operations so individual failures become warnings while successful results are returned.

## Implementation Guide

1. `src/errors/index.ts` — barrel re-exporting public API.

2. `src/errors/error-types.ts` — base class (message, type, suggestion?, code?). Five subclasses: user error ("invalid_input"), not-found ("not_found"), data error ("parse_warning"), system error ("system_error"), unexpected ("internal_error"). Plus security limit exceeded (extends user error, "security_limit_exceeded").

3. `src/errors/error-response.ts` — `buildErrorResponse(error): ErrorResponse` converts known errors to structured responses. `buildErrorResponseFromUnknown(err: unknown): ErrorResponse` handles non-error throws (strings, undefined) as internal_error. Response always includes type and message; suggestion when available.

4. `src/errors/error-boundary.ts` — `withErrorBoundary<T>(handler: () => Promise<T>, logger): Promise<ToolResponse>`. On success: returns handler result. On any error: catches, logs (OBS-07), builds structured response, returns with isError true. Never throws. Stack traces at debug only. Increments error metrics counter.

5. `src/errors/partial-success.ts` — `settleAll<T>(operations: Array<() => Promise<T>>, logger): Promise<{results: T[], warnings: string[]}>`. Fulfilled ops → results, rejected → warnings. Never throws, even if all fail.

6. `src/errors/unhandled-rejection.ts` — `installUnhandledRejectionHandler(logger)` registers process.on('unhandledRejection') that logs and initiates shutdown. `removeUnhandledRejectionHandler()` for test cleanup.

## Exported API

Export from `src/errors/error-types.ts`:
- `class InvalidInputError extends BriefError` — type: `'invalid_input'`
- `class NotFoundError extends BriefError` — type: `'not_found'`
- `class ParseWarningError extends BriefError` — type: `'parse_warning'`
- `class SystemError extends BriefError` — type: `'system_error'`
- `class InternalError extends BriefError` — type: `'internal_error'`
- `class SecurityLimitExceededError extends InvalidInputError` — constructor: `(limitName: string, actualValue: number, configuredLimit: number)`, subtype: `'security_limit_exceeded'`

Export from `src/errors/error-response.ts`:
- `buildErrorResponse(error: BriefError) → ErrorResponse` — includes `subtype` for SecurityLimitExceededError
- `buildErrorResponseFromUnknown(value: unknown) → ErrorResponse`

Export from `src/errors/error-boundary.ts`:
- `withErrorBoundary<T>(handler: () => Promise<T>, logger, options?: { metrics? }) → Promise<ToolResponse>` — success: `isError` is undefined; error: `isError: true`

Export from `src/errors/partial-success.ts`:
- `settleAll<T>(operations: Array<() => Promise<T>>, logger) → { results: T[], warnings: string[] }`

Export from `src/errors/unhandled-rejection.ts`:
- `installUnhandledRejectionHandler(logger) → void`
- `removeUnhandledRejectionHandler() → void`

## Rules

### ERR-01: Never Crash on Bad Input
The server MUST handle all input gracefully. Malformed BRIEF.md, missing files, invalid ontology queries, empty search results — all must produce useful responses, never crashes. Use `Promise.allSettled()` instead of `Promise.all()` for operations that should partially succeed: pack loading, workspace scanning, hierarchy walking, type guide loading. Add `process.on('unhandledRejection', handler)` that logs the error and initiates graceful shutdown — never swallow silently.

### ERR-02: Structured Error Responses
Errors returned to the AI MUST be structured with: Error type (e.g., "file_not_found", "invalid_scope", "parse_warning"), Human-readable message, Suggestion for resolution (when possible).

### ERR-03: Warnings Are Not Errors
Missing recommended sections, non-standard formatting, disconnected workspace roots — these produce warnings in responses, not errors. The tool still completes its operation.

### ERR-04: File Operation Failures
If a file write fails (permissions, disk full), return a clear error. Do not leave partial writes. Use atomic write pattern (temp file + rename).

### ERR-05: Error Taxonomy
All errors returned by the server MUST be classified using this taxonomy: User error (invalid_input) — wrong parameter, non-existent scope; Not found (not_found) — file or project deleted/missing; Data error (parse_warning) — corrupt BRIEF.md, invalid pack; System error (system_error) — disk full, permissions denied; Unexpected error (internal_error) — unhandled exception, bug. The server MUST NEVER crash on a tool call. Every error, including unexpected ones, becomes a structured response.

### ERR-06: Missing File Policy
When a tool call references a file that no longer exists, the response depends on context: Missing BRIEF.md (file deleted, project exists in config) → not_found with signal; Missing workspace root (drive disconnected) → warning per FS-02, continue serving other roots; Missing BRIEF.md at a hierarchy level (directory exists, no BRIEF.md) → silently skip per HIER-09; Missing pack file (installed in config but file deleted) → warning, exclude from search, suggest reinstall.

### ERR-07: Error Recovery and Cleanup
After a failed write operation, the server MUST: (1) Clean up any temp files created during the atomic write attempt, (2) Release any file locks held (CONC-01), (3) Ensure the server state is identical to the pre-call state — no partial modifications. On startup, the server MUST scan for orphaned temp files (`*.brief-tmp.*` per CONC-05) left by previous crashes and clean them up. Disk full during atomic write: catch `ENOSPC`, delete partial temp file in catch block, return `system_error`: "Not enough disk space." Original file untouched. Before starting atomic write, check target file and directory are writable (`fs.access` with `W_OK`). If read-only, return `system_error` immediately without creating temp file.

### ERR-08: AI Error Presentation Guidelines
When the AI receives a tool error, it MUST present it appropriately based on error type: `invalid_input` — explain what was wrong and suggest the correct call or parameters; `not_found` — offer to create or locate the missing resource; `parse_warning` — inform the user of the data quality issue but continue working with partial results; `system_error` — report to the user clearly and suggest remediation; `internal_error` — apologise, suggest retrying the operation, or recommend reporting the issue. The AI MUST NOT silently swallow errors.

### ERR-09: Operation Timeout
All tool call handlers MUST enforce a configurable operation timeout (default: 30 seconds, via `operation_timeout` in CONF-03). If a tool call exceeds the timeout, the server MUST: (1) Cancel the in-progress operation (if possible via AbortSignal per CONC-06), (2) Clean up any partial state (per ERR-07), (3) Return a `system_error` response: "Operation timed out after {N}s. The file may be very large or the system is under heavy load." Primary implementation: TASK-08 middleware. Reference CONC-06.

### ERR-10: Security Limit Violations
When a security limit is exceeded (SEC-07 string/array limits, SEC-08 pack size limits, SEC-13 type guide size limits), the server MUST return a structured error using the `invalid_input` error type (ERR-05) with a `security_limit_exceeded` subtype. The error response MUST include which limit was exceeded, the actual value, the configured limit, and how to adjust if needed. Security limit violations MUST block the operation — they are never warnings. Primary implementation: TASK-05a/05b security modules.

### ERR-11: Partial Results on Multi-Source Operations
When a tool call spans multiple sources (e.g., `brief_list_projects` scanning multiple workspace roots, `brief_search_ontology` across multiple packs) and one source fails, the server MUST return results from the successful sources plus a warning about the failed source. Partial results are always better than total failure. The warning includes the failed source identity and the error reason. The `partial-success.ts` utility in this module is the primary mechanism for implementing ERR-11 across all multi-source tools.

## Test Specification

### Unit Tests (specific input → expected output)
- Each of the five taxonomy categories → structured response with correct type string
- Security limit exceeded → response with its own distinct type
- Error with suggestion → suggestion present; without → absent
- Successful handler through boundary → normal result, isError not set
- Handler throws known error → structured error with isError true and correct type
- Handler throws non-error value (string, undefined) → internal_error with isError true
- Error boundary on throw → error logged; stack trace at debug level only
- All async ops succeed → all results, no warnings
- Some async ops fail → successful results plus warnings for failures
- All async ops fail → empty results, warning per failure
- Unhandled rejection triggered → error logged, not swallowed
- Operation timeout exceeded → cancelled with cleanup, system_error returned
- Security limit violation → invalid_input with security_limit_exceeded subtype, includes limit details
- One of two multi-source ops fails → partial results returned plus warning naming failed source

### Property Tests (invariants that hold for ALL inputs)
- forAll(error message): boundary never throws, always returns structured response
- forAll(taxonomy type): structured response always has type and message
- forAll(list of ops, some failing): partial success never throws, returns results + warnings
- forAll(unknown thrown value — string, number, object, undefined, null): boundary produces valid response

## Tier 4 Criteria

Tier 4 criteria: none
