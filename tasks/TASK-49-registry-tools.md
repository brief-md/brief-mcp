# TASK-49: CLI — Compatible MCP Registry, Add-Tool & Registry Search

## Metadata
- Priority: 51
- Status: pending
- Dependencies: TASK-48, TASK-08
- Module path: src/cli/
- Type stubs: src/types/cli.ts
- Also read: src/types/config.ts
- Test file: tests/cli/registry-tools.test.ts
- Estimated context KB: 35

## What To Build

Implement the `add-tool` and `list-tools` CLI commands, the `brief_search_registry` MCP tool, and manage the `compatible-mcps.json` registry file. The `add-tool` command lets users select tools from the registry or add custom ones, generating and merging config blocks for the selected AI client. The `list-tools` command shows all compatible creative tool MCPs with installation and configuration status. The `brief_search_registry` tool provides query matching against registry entries with type filtering. The registry is bundled inside the npm package (read-only), with a cache in `~/.brief/cache/registry.json` (24h TTL, stale-while-revalidate with 5s timeout). Registry entries include name, display_name, install_command, config_block, requires_tool_setup, relevant_project_types, and type_guide_notes. Trust levels are communicated for registry entries.

## Implementation Guide

1. `src/cli/registry-tools.ts` — registry management, add-tool, list-tools commands.

2. Registry file schema: define the `compatible-mcps.json` format with entry fields: name, display_name, install_command, config_block, requires_tool_setup, relevant_project_types, type_guide_notes. Bundle the registry inside the npm package as read-only.

3. `add-tool` CLI command: present registry entries for selection. Allow custom MCP addition (manual config block input). For each selected tool: generate config block for the selected AI client, display changes, require confirmation, execute install command using safe execution (execFile/spawn with args array). Show tool-specific setup steps if required.

4. `list-tools` CLI command: list all compatible creative tool MCPs from the registry. Show status for each: installed/not installed, configured/not configured. Include display name and description.

5. `brief_search_registry` MCP tool: accept parameters for query (text match against name, description) and type filter ("ontology", "type-guide", "all"). Return matching entries with name, description, entry count (for ontologies), and download URL. Use the registry cache.

6. Registry cache: store in `~/.brief/cache/registry.json` with 24h TTL. Support stale-while-revalidate pattern (serve stale data while refreshing in background, with 5s timeout for the refresh attempt). In v1, the registry is bundled inside the npm package as a read-only file — there is no remote registry URL to revalidate against. The 24h TTL and stale-while-revalidate logic are implemented but the "revalidation source" in v1 is simply the bundled file itself; cache invalidation occurs only when the server package is updated (a new npm version replaces the bundled file). The network revalidation path is scaffolded for v1.1, when a remote registry URL may be introduced. (OQ-220)

7. Trust level communication: when displaying registry entries, indicate trust level. Bundled entries are trusted (code-reviewed). External/community entries are treated as untrusted — display full command, warn about source.

8. Command execution safety: all install commands use `child_process.execFile` or `spawn` with args array. Never use `exec` with string concatenation.

9. Config writes: merge new tool config into existing AI client config. Never silently overwrite. Write to disk immediately after modification.

## Exported API

Export from `src/cli/registry-tools.ts`:
- `searchRegistry(params: { query: string; typeFilter?: 'ontology' | 'type-guide' | 'all'; simulateUntrusted?: boolean }) → { entries: Array<{ name: string; description: string; type: string; trustLevel: string; requiresConfirmation?: boolean }> }`
  Untrusted entries: `requiresConfirmation: true`.
- `addTool(params: { tool: string; client: string; customConfig?: object; simulateExistingConfig?: boolean; simulateUntrustedEntry?: boolean }) → { configMerged: boolean; warningShown?: boolean; warningMessage?: string; commandDisplayed?: boolean; existingPreserved?: boolean }`
- `listTools() → { tools: Array<{ name: string; status: string }>; installed?: string[]; notInstalled?: string[] }`
- `getRegistryCache(options?: { fresh?: boolean; simulateExpired?: boolean; simulateTimeout?: boolean }) → { fromCache?: boolean; refreshed?: boolean; stale?: boolean }`
- `validateRegistryEntry(entry: object) → { valid: boolean; errors: string[] }`
- `getInstallCommand(params: { toolName: string }) → { args: string[]; executable: string }`

## Rules

### SEC-12: Compatible MCP Registry — Command Injection Prevention
The compatible MCP registry (`compatible-mcps.json`) contains `install_command` and `config_block` fields. The setup wizard (`npx brief-mcp init`) and `add-tool` command execute these.

**Threat:** A compromised or malicious registry entry could contain shell injection in the install command.

**Mitigations:**
- The **bundled** registry is code-reviewed and shipped with the package — treat it as trusted code
- If the registry is ever made remotely updatable, the update mechanism MUST verify integrity (signatures, checksums)
- The `install_command` MUST be displayed to the user and require explicit confirmation before execution
- Command arguments MUST be passed as arrays (not shell-interpolated strings) to prevent injection: use `child_process.execFile` or `spawn` with args array, NEVER `exec` with string concatenation
- Registry entries from external/community sources MUST be treated as untrusted — display full command, warn about source, require confirmation

### CLI-06: TTY Detection for Interactive Features
The setup wizard (`npx brief-mcp init`) and `add-tool` command use interactive prompts. These features MUST:
- Detect `process.stdin.isTTY` before showing prompts
- In non-TTY mode, either fail with a clear error ("interactive mode requires a terminal") or accept all inputs via flags/env vars
- Support a `--yes` / `-y` flag to accept all defaults without prompting (for CI/scripting)

### CONF-04: Config Changes at Runtime
`brief_add_workspace` modifies config at runtime. After modification, the config MUST be written to disk immediately and the new root MUST be available for the next tool call.

## Test Specification

### Unit Tests (specific input → expected output)
- Search registry by name → matching entries returned
- Search registry by description → matching entries returned
- Search with type filter "ontology" → only ontology entries returned
- Search with type filter "type-guide" → only type guide entries returned
- Search with type filter "all" → all matching entries returned
- Add tool from registry → config block generated and merged
- Add custom tool → manual config block accepted
- List tools → all registry entries shown with status
- Installed tool → marked as installed in list
- Not installed tool → marked as not installed in list
- Install command execution → uses args array, not string concatenation
- Registry cache within TTL → cached data returned
- Registry cache expired → refresh attempted with stale-while-revalidate
- Registry refresh timeout (>5s) → stale data served
- Bundled registry entry → trust level indicated
- Config merge → existing config preserved, new tool added

### Property Tests (invariants that hold for ALL inputs)
- forAll(install command): always displayed and confirmed before execution
- forAll(config merge): existing config never silently overwritten
- forAll(registry search): results always include name and description
- forAll(command execution): always uses args array, never string concatenation

## Test Fixtures

The implementation MUST embed (or build from) a bundled registry containing at least these entries.
Tests use specific query terms and tool names — the registry data must match.

### Bundled Registry Entries (minimum set)

| name | displayName | description | type | trustLevel | installCommand |
|------|------------|-------------|------|------------|---------------|
| `brief-mcp` | `BRIEF MCP Server` | `Creative tool for BRIEF.md project context` | `ontology` | `bundled` | `["npx", "--yes", "brief-mcp"]` |
| `registry-tool-a` | `Registry Tool A` | `A test creative tool for ontology management` | `ontology` | `bundled` | `["npx", "--yes", "registry-tool-a"]` |
| `test-type-guide` | `Test Type Guide` | `A test creative tool for type guide management` | `type-guide` | `bundled` | `["npx", "--yes", "test-type-guide"]` |
| `test-tool` | `Test Tool` | `A bundled test tool` | `ontology` | `bundled` | `["npx", "--yes", "test-tool"]` |

Tests reference these query terms → expected matches:
- `"brief"` → matches `brief-mcp` by name
- `"creative tool"` → matches entries with "creative tool" in description
- `"test"` → matches `registry-tool-a`, `test-type-guide`, `test-tool` by name/description
- `"bundled"` → matches entries with `trustLevel: "bundled"` (description or name match)
- `"external"` with `simulateUntrusted: true` → synthetic untrusted entries returned

### Tool names referenced by addTool / getInstallCommand tests
- `"registry-tool-a"` — must exist in registry
- `"custom"` — not in registry, triggers custom config path
- `"tool-a"`, `"tool-b"` — property test tools, must exist or be handled gracefully
- `"new-tool"` — addTool with simulateExistingConfig
- `"my-ontology-pack"` — getInstallCommand test
- `"external-untrusted-tool"` — addTool with simulateUntrustedEntry

### validateRegistryEntry required fields
A registry entry is valid when it has ALL of: `name`, `description`, `type`, `trustLevel`, and install info (either `installCommand: string[]` OR `command: string` + `args: string[]`).
Missing any of these → `{ valid: false, errors: [...] }`.

## Tier 4 Criteria

Tier 4 criteria: JC-01, JC-02, JC-07, JC-09
