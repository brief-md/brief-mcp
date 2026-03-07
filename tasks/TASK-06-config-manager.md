# TASK-06: Configuration Manager

## Metadata
- Priority: 7
- Status: pending
- Dependencies: TASK-02, TASK-03, TASK-04, TASK-05a
- Module path: src/config/config.ts
- Type stubs: src/types/config.ts
- Also read: src/types/responses.ts, src/types/security.ts
- Test file: tests/config/config.test.ts
- Estimated context KB: 40

## What To Build

Configuration loading, validation, defaults, runtime modification, BRIEF_HOME support, and corruption recovery. Manages `~/.brief/config.json` (or `$BRIEF_HOME/config.json`). On first run, creates the full directory structure with defaults. Handles corrupt config files by renaming and recreating. Preserves unknown fields for forward/backward compatibility. Runtime modifications are written to disk immediately via atomic writes.

## Implementation Guide

1. **Default config per CONF-03 schema.** Internal-only defaults: hierarchy_depth_limit 10, context_size_limit 51200, index_memory_budget 104857600, project_scan_depth 5, write_lock_timeout 10000, index_staleness_period 60000. Every field has a default; empty `{}` works.

2. **Config directory resolution:** Check `process.env.BRIEF_HOME`, resolve to absolute. Fallback: `path.join(os.homedir(), '.brief')`. Log at `info`.

3. **First-run detection:** If config dir missing, create: dir itself, `ontologies/`, `type-guides/` (with `_generic.md`), `logs/`. Set Unix permissions (700 dirs, 600 config). Write defaults to `config.json`. Log: "First run detected. Created ~/.brief/ with default configuration." Set `isFirstRun` flag.

4. **Config loading:** Read and parse strict JSON. On parse failure (empty/malformed/binary): rename to `config.json.corrupt.{ISO-timestamp}`, create fresh defaults, log warning, set corruption notice flag. Shallow-merge parsed over defaults. Preserve unknown fields. Run prototype pollution check.

5. **Config writing:** Serialize JSON with 2-space indent. Atomic write (temp + rename, O_EXCL). Preserve unknown fields. Unix: chmod 600 after write.

6. **Runtime modification:** Accept partial config patch, merge into in-memory config, call save immediately. Updated values available to next tool call without re-reading disk.

7. **BRIEF_HOME handling:** Resolve to absolute, create dir with 700 if missing, log override at `info`. Proceed even if ownership unverifiable.

8. **Schema versioning:** `config_version` field (default 1). Apply sequential migrations on load. Future versions: preserve all fields, log warning. Define migration functions using the pattern `migrate_v1_to_v2(config: Config): Config` — one function per version transition, stored in a `migrations[]` array indexed by old version number. On load, if `config_version < currentVersion`, run each applicable migration in sequence. Before running any migration, back up the current `config.json` as `config.json.v{oldVersion}.bak`. After all migrations succeed, write the updated config with the new `config_version`. If a migration throws, restore from the backup and continue with the pre-migration config (log error at `warn`). (OQ-221)

## Exported API

Export from `src/config/config.ts`:
- `loadConfig(options?: { simulateFirstRun?: boolean; override?: Record<string, unknown>; simulateCorruptJson?: boolean; simulateEmptyFile?: boolean; env?: Record<string, string>; injectRaw?: string }) → object`
  Returns config fields using snake_case keys (matching JSON format): `workspace_roots`, `operation_timeout`, `installed_ontologies`, `tutorial_dismissed`, `ontology_search`, `max_pack_size`, `schema_version`, `log_level`, `transport`, etc.
  Also returns metadata: `createdDirectories?: string[]`, `configFileCreated?: boolean`, `isFirstRun?: boolean`, `wasCorrupted?: boolean`, `recoveryAction?: string`, `corruptionMessage?: string` (matches `/corrupt.*reset|reset.*default/i`), `briefHomeCreated?: boolean`, `briefHomePath?: string`
  The `simulate*` parameters are test hooks — implement as optional code paths.
- `saveConfig(config: BriefConfig) → { saved: boolean; permissions?: number }`
- `updateConfig(changes: Partial<BriefConfig>) → { saved: boolean }`
- `getConfigDir() → string` — returns `~/.brief/` or `$BRIEF_HOME`

## Rules

### CONF-01: Auto-Create Config
On first run (first time the MCP server process starts — via stdio connection from an AI client, or via `npx brief-mcp init`), if `~/.brief/` doesn't exist, create the full directory structure and default config automatically. Directory structure: ~/.brief/config.json, ~/.brief/ontologies/, ~/.brief/type-guides/_generic.md, ~/.brief/logs/. The server MUST log at `info` level: "First run detected. Created ~/.brief/ with default configuration."

### CONF-02: Defaults for Everything
Every config field MUST have a sensible default. The server MUST work with a completely empty config (using all defaults).

### CONF-03: Config Schema
```json
{
  "workspaces": ["~/projects"],
  "transport": "stdio",
  "port": 3847,
  "ontology_search": "keyword",
  "embedding_provider": null,
  "installed_ontologies": [],
  "tutorial_dismissed": false,
  "log_level": "info",
  "section_aliases": {},
  "operation_timeout": 30,
  "max_pack_size": 52428800
}
```
Internal defaults (not user-facing config): hierarchy_depth_limit (default: 10), context_size_limit (default: 50KB), index_memory_budget (default: 100MB), project_scan_depth (default: 5), write_lock_timeout (default: 10s), index_staleness_period (default: 60s). Config uses strict JSON (no comments). Config corruption recovery: if config.json fails to parse on startup (empty, malformed, binary), rename to config.json.corrupt.[timestamp], create fresh defaults, log warning. First tool call includes notice: "Config was corrupted and reset to defaults." Unknown fields in config are preserved on write and ignored on read (forward/backward compatibility).

### CONF-04: Config Changes at Runtime
`brief_add_workspace` modifies config at runtime. After modification, the config MUST be written to disk immediately and the new root MUST be available for the next tool call.

### CONF-05: Config Directory Override
The `BRIEF_HOME` environment variable overrides the default `~/.brief/` config directory. When set, all config, ontology packs, type guides, and logs are stored under `$BRIEF_HOME` instead of `~/.brief/`. Default: `~/.brief/` (resolved via `os.homedir()`). When `BRIEF_HOME` is set: resolve to absolute path, check directory exists (create with 700 permissions if not), log override at info level. Proceed even if ownership cannot be verified.

### CONF-06: Configuration Access Path for Users
Users access and modify configuration through these mechanisms (in order of preference): (1) Initial setup: `npx brief-mcp init` — sets up workspaces and configures the AI client, (2) Runtime workspace changes: `brief_add_workspace` — adds a new workspace root, (3) Other settings: The AI instructs the user to edit `~/.brief/config.json` directly, (4) Reading current config: The AI can describe the location and defaults.

## Test Specification

### Unit Tests (specific input -> expected output)
- Config directory absent on first load -> full structure created (config.json, ontologies/, type-guides/, logs/)
- First-run creation -> info log contains "First run detected"
- Existing valid config -> loaded without recreation
- Empty config `{}` -> all fields resolve to defaults
- Config with only `log_level: "debug"` -> that field is "debug", all others are defaults
- Config with unknown field `future_feature: true` -> field preserved, no error
- Unknown field survives save-and-reload round trip
- Malformed JSON config (e.g., `{broken`) -> renamed to `.corrupt.{timestamp}`, fresh defaults created
- Empty (0 byte) config -> treated as corrupt, recreated
- Corrupt recovery -> warning log includes corruption details
- Corrupt recovery -> first-tool-call flag set with "Config was corrupted and reset to defaults"
- Runtime update adding workspace -> config.json on disk reflects new workspace immediately
- Runtime update -> next in-memory read sees updated value without re-reading disk
- `BRIEF_HOME` set -> config loaded from that path
- `BRIEF_HOME` pointing to non-existent dir -> dir created with 700 permissions (Unix)
- `BRIEF_HOME` not set -> config loaded from `~/.brief/`
- Config written on Unix -> file permissions are 600
- Config with `__proto__` key -> rejected via prototype pollution check

### Property Tests (invariants that hold for ALL inputs)
- forAll(partial config with valid types): merged config always has every default field populated
- forAll(config object): save then load round-trips equivalently
- forAll(config with unknown extra fields): extras preserved after save and reload

## Tier 4 Criteria

Tier 4 criteria: none
