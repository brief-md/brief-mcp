# TASK-56: Packaging — CI/CD Pipeline

## Metadata
- Priority: 58
- Status: pending
- Dependencies: TASK-01, TASK-54
- Module path: .github/workflows/
- Type stubs: none
- Also read: none
- Test file: (validated by CI itself)
- Estimated context KB: 30

## What To Build

Build the GitHub Actions CI pipeline that runs on every PR and push to main. The pipeline includes: lint (`biome check` with zero errors), type check (`tsc --noEmit`), unit tests via Vitest across Node.js LTS versions (20, 22), platform matrix testing (Ubuntu, macOS, Windows), dependency audit (`npm audit --audit-level=high`), production build verification, stdout purity test (verify stdout contains only valid MCP messages during tool calls), coverage reporting, and npm provenance support for release builds. Log level configuration is validated, and no sensitive data appears in info-level logs.

## Implementation Guide

1. `.github/workflows/ci.yml` — main CI pipeline.

2. Trigger: run on every pull request and push to `main`.

3. Platform matrix: Ubuntu (latest), macOS (latest), Windows (latest).

4. Node.js version matrix: 20 (LTS), 22 (current LTS).

5. Steps for each matrix combination:
   - Checkout code
   - Set up Node.js (specified version)
   - Install dependencies with `npm ci` (reproducible from lock file)
   - Lint: `biome check` — zero errors required
   - Type check: `tsc --noEmit` — must pass
   - Unit tests: `vitest run` — all tests must pass
   - Build: production build must succeed
   - Dependency audit: `npm audit --audit-level=high` — fail on high/critical

6. stdout purity test: include a dedicated test that captures stdout during a tool call and asserts it contains only valid MCP protocol messages. Any non-protocol output on stdout is a test failure. Set `NODE_NO_WARNINGS=1` to suppress Node.js deprecation warnings.

7. Coverage reporting: generate and upload coverage reports.

8. npm provenance: for release builds, enable `--provenance` flag.

9. Observability verification: validate that log level configuration works correctly and that info-level logs contain no sensitive data (no full file contents, user project names, workspace paths, or BRIEF.md content).

10. AI client compatibility: add an AI client compatibility verification section to the test plan. For Claude Desktop: verify the MCP server starts correctly when added to Claude Desktop's `claude_desktop_config.json` using the `npx --yes brief-mcp` invocation format. For Claude Code: verify the server starts correctly when configured as an MCP server via `claude mcp add`. Document the minimum compatible version of each client tested. This verification starts as a manual checklist and is graduated to automated smoke tests when tooling allows. (OQ-066)

## Rules

### OSS-03: CI/CD Pipeline
The project MUST have a CI pipeline that runs on every PR and push to main:
- **Lint**: ESLint/Biome pass with zero errors
- **Type check**: `tsc --noEmit` passes
- **Unit tests**: all tests pass across Node.js LTS versions (current LTS + previous LTS)
- **Platform matrix**: tests run on Ubuntu, macOS, and Windows

### OSS-06: Reproducible Builds
The build output MUST be reproducible — same source + same dependencies = same output. This means:
- Lock files (`package-lock.json`) are committed and used in CI (`npm ci`, not `npm install`)
- Build scripts are deterministic (no timestamps embedded, no random values)
- The build environment is documented (Node.js version, OS)

### OSS-07: Supply Chain Security
- Enable npm provenance (`--provenance` flag) for published packages to establish build attestation
- Consider using a `SECURITY.md` file documenting: how to report vulnerabilities, supported versions, security update policy
- The `compatible-mcps.json` registry is maintained by project maintainers only — community submissions go through a review PR process
- Published packages should be published from CI (not local machines) to prevent compromised dev environments from tainting releases

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
- Lint step → zero errors from biome check
- Type check → tsc --noEmit passes without errors
- Unit tests → all pass on Node.js 20 and 22
- Unit tests → all pass on Ubuntu, macOS, and Windows
- Production build → succeeds without errors
- Dependency audit → no high/critical vulnerabilities
- stdout purity test → only valid MCP messages on stdout during tool calls
- Coverage → report generated and uploaded
- npm ci → uses lock file, not npm install
- Log level env var → configurable via BRIEF_LOG_LEVEL
- Info-level logs → no sensitive data (no file contents, paths, or BRIEF.md content)
- console.log/info → redirected to stderr via structured logger

### Property Tests (invariants that hold for ALL inputs)
- forAll(CI run): lint, type check, and tests all pass before merge
- forAll(stdout output): contains only valid MCP protocol messages
- forAll(info-level log): no sensitive user data present
- forAll(build): reproducible from same source and dependencies

## Tier 4 Criteria

Tier 4 criteria: none
