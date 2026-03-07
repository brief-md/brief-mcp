# TASK-48: CLI — Setup Wizard

## Metadata
- Priority: 50
- Status: pending
- Dependencies: TASK-06, TASK-47, TASK-35
- Module path: src/cli/
- Type stubs: src/types/cli.ts
- Also read: src/types/config.ts
- Test file: tests/cli/setup-wizard.test.ts
- Estimated context KB: 40

## What To Build

Implement `npx brief-mcp init` — an interactive wizard for first-time setup. The wizard prompts for AI client selection, workspace roots, and compatible tool selection. It generates config files for the selected AI client (merging with existing config, never silently overwriting), loads and presents the compatible MCP registry, displays install commands requiring explicit confirmation before execution, and uses safe command execution (execFile/spawn with args array, never exec with string concatenation). It creates the `~/.brief/` directory with bundled packs and guides, supports custom MCP paths, and is idempotent and resumable (stores `setup_state` in config for partial completion recovery). It displays a diff of config changes before writing and fails with a clear error in non-TTY mode.

## Implementation Guide

1. `src/cli/setup-wizard.ts` — interactive setup wizard.

2. Entry point: register the `init` command on the CLI framework. When invoked, check TTY — in non-TTY mode, fail with clear error ("interactive mode requires a terminal") or accept flags.

3. AI client selection: prompt user to choose their AI client (Claude, Cursor, etc.). Based on selection, determine the config file format and location.

4. Workspace roots: prompt for workspace root directories. Validate paths exist and are accessible.

5. Compatible tool selection: load the compatible MCP registry (bundled JSON file). Present available tools with descriptions. User selects which tools to install.

6. Config file generation: generate the config file for the selected AI client. If an existing config exists, merge changes (never silently overwrite). Display a diff of changes before writing and require confirmation.

7. Tool installation: for each selected tool, display the install command and require explicit confirmation before execution. Use `child_process.execFile` or `spawn` with args array — NEVER `exec` with string concatenation. This prevents command injection from registry entries. All child process spawns MUST use `stdio: ['pipe', 'pipe', 'pipe']` to prevent child stdout from reaching the MCP transport (stdout is the MCP protocol channel — child output corrupts it). Never use `stdio: 'inherit'` in MCP server mode. Capture child stdout and stderr separately and deliver them to the user via the structured logger. Reference OBS-11 and OQ-241.

8. Directory setup: create `~/.brief/` directory structure. Install bundled ontology packs and type guides.

9. Idempotent and resumable: store `setup_state` in config.json to track wizard progress. If the wizard is interrupted and restarted, resume from where it left off. Each step is idempotent — re-running a completed step has no side effect.

10. Config writes: write config to disk immediately after modification. New workspace roots are available for the next tool call.

11. npx cold-start `--yes` flag: the default `npx brief-mcp` invocation in MCP client config examples MUST include `--yes` (i.e., `npx --yes brief-mcp`) to prevent npx from blocking on an interactive "install?" prompt before the server even starts. MCP clients that auto-start the server via an `npx` command have no interactive terminal, so without `--yes` the server process will never launch. Document this prominently in the README and in wizard output when generating MCP client config snippets. (OQ-200)

## Exported API

Export from `src/cli/setup-wizard.ts`:
- `initWizard(options?: { isTTY: boolean; yesFlag?: boolean; simulateConfigExists?: boolean; selectedTools?: string[]; npxColdStart?: boolean; workspaceRoot?: string; simulateInterrupt?: boolean; interruptAfterStep?: number; client?: string }) → { interactive?: boolean; defaultsAccepted?: boolean; diffShown?: boolean; diffContent?: string; commandsDisplayed?: boolean; directoryCreated?: boolean; bundledInstalled?: boolean; generatedConfig?: any; workspaceRootValid?: boolean; lastCompletedStep?: number; alreadyComplete?: boolean; configPersisted?: boolean }`
  Non-interactive (`yesFlag`): accepts defaults. Interrupt recovery via `lastCompletedStep`.
- `generateClientConfig(options: { client: string }) → { format: string }`
- `mergeConfig(existing: object, incoming: object) → object` — deep merge, existing values preserved
- `getSetupState() → { lastCompletedStep?: number }`
- `getToolInstallCommand(params: { tool: string; client: string }) → { args: string[]; executable: string }` — no shell metacharacters in executable
- `runSetupWizard(params?: { nonInteractive?: boolean; checkStdioConfig?: boolean; [key: string]: unknown }) → { completed: boolean; childProcessStdioConfig?: string; alreadyComplete?: boolean }` — internal entry point; child process stdio MUST be `pipe` (never `inherit`). Used for idempotency and stdio-config checks.
- `_resetState() → void` — @internal, resets module-level state for test isolation

## Test Fixtures

- AI clients: `"claude"`, `"cursor"` — used in `generateClientConfig` and `initWizard` client param
- Tool names: `"tool-a"`, `"tool-b"`, `"tool-c"` — mock tool identifiers for `selectedTools` and property tests
- Tool install target: `"brief-mcp"` — used in `getToolInstallCommand` tests
- Valid workspace path: `"/valid/path"` — accepted absolute path
- Invalid workspace path: `"/etc/hosts"` — file (not directory), triggers validation error

## Rules

### CLI-06: TTY Detection for Interactive Features
The setup wizard (`npx brief-mcp init`) and `add-tool` command use interactive prompts. These features MUST:
- Detect `process.stdin.isTTY` before showing prompts
- In non-TTY mode, either fail with a clear error ("interactive mode requires a terminal") or accept all inputs via flags/env vars
- Support a `--yes` / `-y` flag to accept all defaults without prompting (for CI/scripting)

### SEC-12: Compatible MCP Registry — Command Injection Prevention
The compatible MCP registry (`compatible-mcps.json`) contains `install_command` and `config_block` fields. The setup wizard (`npx brief-mcp init`) and `add-tool` command execute these.

**Threat:** A compromised or malicious registry entry could contain shell injection in the install command.

**Mitigations:**
- The **bundled** registry is code-reviewed and shipped with the package — treat it as trusted code
- If the registry is ever made remotely updatable, the update mechanism MUST verify integrity (signatures, checksums)
- The `install_command` MUST be displayed to the user and require explicit confirmation before execution
- Command arguments MUST be passed as arrays (not shell-interpolated strings) to prevent injection: use `child_process.execFile` or `spawn` with args array, NEVER `exec` with string concatenation
- Registry entries from external/community sources MUST be treated as untrusted — display full command, warn about source, require confirmation

### CONF-04: Config Changes at Runtime
`brief_add_workspace` modifies config at runtime. After modification, the config MUST be written to disk immediately and the new root MUST be available for the next tool call.

## Test Specification

### Unit Tests (specific input → expected output)
- Init in TTY mode → interactive prompts displayed
- Init in non-TTY mode without --yes → clear error about terminal requirement
- Init in non-TTY mode with --yes → defaults accepted
- AI client selection → correct config format generated
- Existing config file present → merged, not silently overwritten
- Config diff → displayed before write, confirmation required
- Tool install command → displayed to user, confirmation required before execution
- Command execution → uses args array, not string concatenation
- ~/.brief/ directory creation → directory and structure created
- Bundled packs and guides → installed to correct locations
- Wizard interrupted and restarted → resumes from setup_state
- Completed step re-run → idempotent, no side effects
- Config written → persisted to disk immediately

### Property Tests (invariants that hold for ALL inputs)
- forAll(tool install): command always displayed and confirmed before execution
- forAll(config write): changes persisted to disk immediately
- forAll(existing config): never silently overwritten
- forAll(wizard step): idempotent on re-execution

## Tier 4 Criteria

Tier 4 criteria: JC-01, JC-06
