# TASK-47: CLI — Framework

## Metadata
- Priority: 49
- Status: pending
- Dependencies: TASK-01, TASK-03
- Module path: src/cli/
- Type stubs: src/types/cli.ts
- Also read: none
- Test file: tests/cli/framework.test.ts
- Estimated context KB: 35

## What To Build

Implement the CLI entry point and framework for `brief-mcp`. This includes argument parsing using a CLI framework (commander/yargs/clipanion), standard flags on every command (`--help`, `--version`, `--verbose`, `--quiet`, `--no-color`, `--yes`), standardised exit codes (0 success, 1 runtime error, 2 usage error), colour output control (respecting `NO_COLOR`, `FORCE_COLOR` env vars, TTY detection), stdout/stderr discipline enforcement, TTY detection for interactive features, progress indicators (spinner in TTY, status lines in non-TTY), and workspace root arguments from the command line.

## Implementation Guide

1. `src/cli/framework.ts` — CLI entry point and flag handling.

2. Set up the CLI framework. Register global flags that apply to every command: `--help` / `-h`, `--version` / `-V`, `--verbose` / `-v`, `--quiet` / `-q`, `--no-color`, `--yes` / `-y`.

3. Exit codes: define and enforce standard exit codes. 0 = success. 1 = general runtime error (tool failure, file not found, parse error). 2 = usage error (invalid arguments, missing required args). The server process exits 0 on clean shutdown, 1 on unhandled error.

4. Verbose and quiet modes: `--verbose` sets log level to debug (overrides config). `--quiet` suppresses all output except errors. These are mutually exclusive — if both provided, `--verbose` wins.

5. Colour output control: ANSI colour codes enabled by default when stderr is a TTY. Disabled when stderr is not a TTY (piped/redirected). Disabled when `NO_COLOR` env var is set (any value). Disabled when `--no-color` flag is passed. Forced on when `FORCE_COLOR` env var is set (for CI systems).

6. stdout/stderr discipline: stdout is for MCP protocol messages (server mode), structured data output (CLI mode), or nothing. stderr is for all logs, progress indicators, prompts, warnings, errors. No `console.log` in tool handlers — use the structured logger.

7. TTY detection: check `process.stdin.isTTY` before showing interactive prompts. In non-TTY mode, either fail with a clear error or accept all inputs via flags/env vars. The `--yes` flag accepts all defaults without prompting.

8. Progress indicators: long-running operations display progress on stderr. In TTY mode: spinner or progress bar. In non-TTY mode: periodic status lines. All progress uses stderr, never stdout.

9. Workspace root arguments: accept workspace root paths from the command line for commands that need them.

## Exported API

Export from `src/cli/framework.ts`:
- `parseArgs(args: string[]) → { exitCode: 0 | 1 | 2; output?: string; workspaceRoot?: string }`
  `--help` → exitCode 0 + output. `--version` → exitCode 0 + output. Unknown flag → exitCode 2 + output.
- `resolveLogLevel(options: { verbose?: boolean; quiet?: boolean; env?: Record<string, string> }) → string`
  `verbose` → `'debug'`. `quiet` → `'error'`. Default → `'info'`. `BRIEF_LOG_LEVEL` env overrides.
- `resolveColorMode(options: { env?: Record<string, string>; noColor?: boolean; isTTY: boolean }) → string`
  `NO_COLOR` env or `noColor` flag → `'none'`. Non-TTY → `'none'`. TTY → `'auto'`/`'enabled'`/`'full'`/`'forced'`.
- `detectTTY(options: { isTTY: boolean; yesFlag?: boolean }) → { interactive: boolean; errorIfInteractive?: string; acceptDefaults?: boolean; progressMode?: 'spinner' | 'status-lines' }`

## Rules

### CLI-01: Exit Codes
The CLI MUST use standard exit codes:
- `0` — success
- `1` — general runtime error (tool failure, file not found, parse error)
- `2` — usage error (invalid arguments, missing required args)
The server process (stdio/HTTP mode) exits `0` on clean shutdown, `1` on unhandled error.

### CLI-02: Standard Flags
Every CLI command MUST support:
- `--help` / `-h` — print usage and exit
- `--version` / `-V` — print version string and exit
These MUST work without any other arguments or configuration.

### CLI-03: Verbose and Quiet Modes
- `--verbose` / `-v` — set log level to `debug` (overrides config)
- `--quiet` / `-q` — suppress all output except errors
- These are mutually exclusive. If both are provided, `--verbose` wins.

### CLI-04: Colour Output Control
ANSI colour codes MUST be:
- **Enabled** by default when `stderr` is a TTY
- **Disabled** when `stderr` is not a TTY (piped or redirected)
- **Disabled** when `NO_COLOR` environment variable is set (any value) per the no-color.org convention
- **Disabled** when `--no-color` flag is passed
- **Forced on** when `FORCE_COLOR` environment variable is set (for CI systems that support colour)

### CLI-05: stdout/stderr Discipline
- **stdout**: MCP protocol messages (server mode), structured data output (CLI mode), or nothing
- **stderr**: all logs, progress indicators, prompts, warnings, errors
- This discipline MUST be enforced project-wide. No `console.log` in tool handlers — use the structured logger.

### CLI-06: TTY Detection for Interactive Features
The setup wizard (`npx brief-mcp init`) and `add-tool` command use interactive prompts. These features MUST:
- Detect `process.stdin.isTTY` before showing prompts
- In non-TTY mode, either fail with a clear error ("interactive mode requires a terminal") or accept all inputs via flags/env vars
- Support a `--yes` / `-y` flag to accept all defaults without prompting (for CI/scripting)

### CLI-07: Progress Indicators
Long-running operations (workspace scanning, ontology pack download, index building) SHOULD display progress indicators on `stderr`:
- In TTY mode: spinner or progress bar
- In non-TTY mode: periodic status lines (e.g., "Scanning root 2/3...")
- All progress indicators use `stderr`, never `stdout`

## Test Specification

### Unit Tests (specific input → expected output)
- Valid command → exit code 0
- Runtime error → exit code 1
- Invalid arguments → exit code 2
- --help flag → usage printed, exit 0
- --version flag → version printed, exit 0
- --verbose flag → log level set to debug
- --quiet flag → only errors in output
- Both --verbose and --quiet → verbose wins
- NO_COLOR env var set → no ANSI codes in output
- FORCE_COLOR env var set → ANSI codes present even in non-TTY
- --no-color flag → no ANSI codes in output
- TTY detected → interactive prompts available
- Non-TTY with no --yes flag → clear error about terminal requirement
- Non-TTY with --yes flag → defaults accepted without prompting
- Long operation in TTY → progress indicator on stderr
- Long operation in non-TTY → status lines on stderr
- stdout → never contains logs or progress indicators

### Property Tests (invariants that hold for ALL inputs)
- forAll(command): --help and --version always work without other args
- forAll(output): logs and progress always on stderr, never stdout
- forAll(exit): code is always 0, 1, or 2
- forAll(non-TTY mode): no interactive prompts attempted

## Tier 4 Criteria

Tier 4 criteria: none
