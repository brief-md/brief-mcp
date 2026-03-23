# Configuration

`brief-mcp` stores its configuration and data in `~/.brief/`. This is where ontology packs, type guides, workspace registrations, and server settings live — separate from your project files so they persist across projects.

## Config File

The primary configuration file is located at:

```
~/.brief/config.json
```

If the `BRIEF_HOME` environment variable is set, the config file is located at `$BRIEF_HOME/config.json` instead.

On first run, brief-mcp creates the `~/.brief/` directory with the following structure:

```
~/.brief/
  config.json          # Server configuration
  ontologies/          # Installed ontology packs
  type-guides/         # Type guide files
  logs/                # Log files
```

### Config Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `transport` | `"stdio"` or `"http"` | `"stdio"` | Transport mode (only stdio is currently implemented) |
| `port` | number | `3847` | Port for HTTP transport (currently unused) |
| `ontology_search` | `"keyword"` or `"vector"` | `"keyword"` | Ontology search mode |
| `log_level` | string | `"info"` | Log level: trace, debug, info, warn, error, fatal |
| `workspaces` | string[] | `["~/projects"]` | Registered workspace roots |
| `installed_ontologies` | array | `[]` | Installed ontology pack configurations |
| `tutorial_dismissed` | boolean | `false` | Whether the onboarding tutorial has been dismissed |
| `section_aliases` | object | `{}` | Custom section name aliases |
| `operation_timeout` | number | `30` | Timeout for operations in seconds |
| `max_pack_size` | number | `52428800` | Maximum ontology pack size in bytes (50 MB) |
| `embedding_provider` | string or null | `null` | Embedding provider for vector search (if enabled) |

### Example config.json

```json
{
  "transport": "stdio",
  "port": 3847,
  "ontology_search": "keyword",
  "log_level": "info",
  "workspaces": ["~/projects", "~/work"],
  "installed_ontologies": [],
  "tutorial_dismissed": true,
  "section_aliases": {},
  "operation_timeout": 30,
  "max_pack_size": 52428800
}
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `BRIEF_HOME` | Override the config directory location (default: `~/.brief/`) |
| `BRIEF_LOG_LEVEL` | Override the log level (takes precedence over config file) |
| `NO_COLOR` | Disable colored output (any value) |
| `FORCE_COLOR` | Force colored output (any value) |

## CLI Flags

When running brief-mcp directly (not through an MCP client), these flags are available:

| Flag | Description |
|------|-------------|
| `--verbose` | Enable verbose (debug-level) logging |
| `--quiet` | Suppress non-error output |
| `--no-color` | Disable colored output |
| `--yes` | Auto-confirm prompts |
| `--workspace-root <path>` | Set a workspace root directory |
| `--help` | Show help information |
| `--version` | Show version number |

## Data Directory

The `~/.brief/` directory (or `$BRIEF_HOME`) stores all persistent state:

| Directory/File | Purpose |
|----------------|---------|
| `config.json` | Server configuration |
| `ontologies/` | Installed ontology pack JSON files |
| `type-guides/` | Type guide markdown files |
| `type-guides/_generic.md` | The generic bootstrapping guide (auto-created) |
| `logs/` | Server log files |

### File permissions

On Unix systems, brief-mcp sets restrictive permissions:
- Config directory: `0700` (owner read/write/execute only)
- Config file: `0600` (owner read/write only)

On Windows, default file system permissions apply.

### Corrupted config recovery

If `config.json` is corrupted (invalid JSON), brief-mcp:
1. Renames the corrupted file to `config.json.corrupt.<timestamp>`
2. Resets to default configuration
3. Logs a warning about the recovery

### Schema versioning

The config file includes a `schema_version` field. When the config schema changes in future versions, migrations are applied automatically to update the format.
