# TASK-03: Observability — Logger & Observability Infrastructure

## Metadata
- Priority: 3
- Status: pending
- Dependencies: TASK-01
- Module path: src/observability/
- Type stubs: src/types/responses.ts
- Also read: none
- Test file: tests/observability/logger.test.ts
- Estimated context KB: 40

## What To Build

Build a structured logging system with module-scoped child loggers, request ID tracing, performance timing, and in-memory metrics counters. JSON output in non-TTY mode, human-readable in TTY. All output to stderr only. Includes console.log/info redirect to prevent stdout contamination, request ID generation for tracing tool calls, and counters for tool calls, errors, file ops, and searches. Implements Design Pattern 30 (Structured Observability): each MCP tool call receives a unique request ID and all log lines within that call's execution context include the request ID for end-to-end tracing. Reference OBS-04.

## Implementation Guide

1. `src/observability/index.ts` — barrel re-exporting public API.

2. `src/observability/logger.ts` — `createLogger(config?: LoggerConfig)` factory. Config: level (trace|debug|info|warn|error|fatal), output stream (default stderr), format (json|pretty, auto-detect from stderr.isTTY). Methods: trace/debug/info/warn/error/fatal(msg, context?). JSON: `{timestamp, level, module, message, context?}`. Pretty: `[HH:MM:SS] LEVEL [module] message` with ANSI colours. Level filtering: trace < debug < info < warn < error < fatal.

3. `src/observability/child-logger.ts` — `createChildLogger(parent, moduleName): Logger`. Injects module name into every log line automatically.

4. `src/observability/request-id.ts` — `generateRequestId(): string` (UUID v4 or monotonic counter). `withRequestId(id, logger): Logger` — wraps logger to include requestId in context.

5. `src/observability/timing.ts` — `startTimer(): TimerHandle`, `stopTimer(handle): number` (ms). `withTiming<T>(label, logger, fn): Promise<T>` — logs duration at debug level.

6. `src/observability/metrics.ts` — `createMetricsCollector()`. Counters: toolCalls (by name), errors (by type), fileReads, fileWrites, ontologySearches, parseOperations. Methods: increment(counter, key?), getAll(), reset(), logSummary(logger).

7. `src/observability/stdout-guard.ts` — `installStdoutGuard(logger)` overrides console.log/info/warn/error to route through structured logger (all to stderr). `removeStdoutGuard()` restores originals.

8. Log level resolution: BRIEF_LOG_LEVEL env > config > CLI flag > default (info).

9. Set `process.env.NODE_NO_WARNINGS = '1'` during init.

## Rules

### OBS-01: Structured Logging Format
All log output MUST be structured. In non-TTY mode (piped, server mode), logs MUST be JSON objects with fields: `timestamp` (ISO 8601), `level`, `module`, `message`, and optional `context` (object). In TTY mode (interactive CLI), logs MAY use human-readable format with colour coding.

### OBS-02: Log to stderr Only
ALL log output MUST go to `stderr`, NEVER to `stdout`. In stdio transport mode, `stdout` is the MCP protocol channel. Contaminating `stdout` with log lines will break the MCP protocol and crash the client connection.

### OBS-03: Module-Scoped Loggers
Each module (parser, writer, hierarchy, ontology, reference, workspace, type-intelligence) MUST use a child logger that includes the module name in every log line. This enables filtering logs by module.

### OBS-04: Request ID Tracing
Each incoming MCP tool call MUST be assigned a unique request ID (UUID v4 or monotonic counter). All log lines produced during that tool call MUST include the request ID. This enables tracing a single tool call through multiple modules.

### OBS-05: Performance Timing
All tool calls MUST log their total execution time at `info` level. File I/O operations (read, write, rename) MUST log duration at `debug` level. Ontology searches MUST log query terms, result count, and duration at `debug` level.

### OBS-06: Startup and Shutdown Logging
The server MUST log at `info` level on startup: server version, transport mode, workspace roots, number of loaded ontology packs, number of loaded type guides, total startup duration. On shutdown: reason (signal, error, EOF), in-flight operations count, total uptime.

### OBS-07: Error Context
Error log entries MUST include: the error message, the error type/code, the module that produced it, and sufficient context to reproduce (file path, tool name, input parameters at `debug` level). Stack traces are logged at `debug` level only (not `info` or `warn`).

### OBS-08: Internal Metrics Counters
The server MUST maintain in-memory counters for: total tool calls (by tool name), total errors (by error type), total file reads, total file writes, total ontology searches, total parse operations. These counters are logged on shutdown and optionally exposed via a `brief_diagnostics` debug tool.

### OBS-09: Log Level Configuration
Log level MUST be configurable via: (1) `BRIEF_LOG_LEVEL` environment variable (highest priority), (2) `log_level` field in `~/.brief/config.json`, (3) `--verbose` / `--quiet` CLI flags. Default level: `info`. Valid levels: `trace`, `debug`, `info`, `warn`, `error`, `fatal`.

### OBS-10: No Sensitive Data in Info Logs
Logs at `info` level and above MUST NOT contain: full file contents, user project names, workspace absolute paths, or any BRIEF.md content. These are acceptable at `debug` and `trace` levels only. This protects user privacy when logs are shared for bug reports.

### OBS-11: stdout Protection
At startup, the server MUST redirect `console.log` and `console.info` to the structured logger (which writes to stderr). This prevents accidental stdout contamination from application code or dependencies. `console.warn` and `console.error` remain on stderr (their default). CI MUST include a test that captures stdout during a tool call and asserts it contains only valid MCP protocol messages — any non-protocol output on stdout is a test failure.
- Set `NODE_NO_WARNINGS=1` environment variable to suppress Node.js deprecation warnings on stdout.
- When spawning child processes (setup wizard, MCP installs), always set `stdio: ['pipe', 'pipe', 'pipe']` to prevent child stdout from reaching the MCP transport. Never use `stdio: 'inherit'` in MCP server mode. (OQ-202, OQ-241)

## Test Specification

### Unit Tests (specific input → expected output)
- Logger in JSON mode, info message → valid JSON output with timestamp, level, module, message
- Logger in pretty mode, warn message → human-readable output with level and message
- Debug message when level is info → no output
- Error message when level is error → output produced
- Message with context object → context appears in output
- All log output → written to stderr, never stdout
- Child logger with module name → every line includes that module name
- Generating two request IDs → they are different
- Logger wrapped with request ID → every line includes the request ID
- Timing a ~50ms operation → logged duration in reasonable range
- Incrementing counter for same tool twice → value is 2
- Incrementing counters for different tools → tracked independently
- Getting all metrics → snapshot with all counter categories
- Resetting metrics → all counters zero
- Installing stdout guard then console.log → output on stderr not stdout
- Removing stdout guard → original console methods restored
- Log level resolution: env var set → env var wins
- Log level resolution: nothing configured → defaults to info
- Trace message when level is info → no output
- Fatal message when level is warn → output produced
- Info log with file contents → MUST NOT appear in output at info level
- Info log with workspace absolute path → MUST NOT appear in output at info level
- Same content at debug level → accepted
- stdout after guard installed → contains only MCP protocol messages, no log lines

### Property Tests (invariants that hold for ALL inputs)
- forAll(message string): logger never writes to stdout
- forAll(level, message): output contains message when level permits
- forAll(module name): child logger includes module name in output

## Tier 4 Criteria

Tier 4 criteria: none
