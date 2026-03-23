# brief-mcp

MCP server for [BRIEF.md](https://github.com/brief-mcp/brief-mcp) project context management.

BRIEF.md is a lightweight, human-readable file that preserves the *why* behind a project — its purpose, boundaries, key decisions, and open questions — so that re-entry becomes continuation rather than reconstruction. `brief-mcp` exposes this as a set of tools over the [Model Context Protocol](https://modelcontextprotocol.io), giving AI agents structured access to project intent.

## Features

- **Parse and manage BRIEF.md files** — read, write, and validate project context
- **Hierarchy-aware context assembly** — walk upward through nested BRIEF.md files to build full context
- **Ontology system** — install, search, browse, and tag domain knowledge packs
- **Reference system** — bibliographic references with reverse index and suggestions
- **Conflict detection** — surface contradictions across decisions and constraints
- **Type guides and extensions** — domain-specific structure on top of a universal core
- **Lifecycle tracking** — maturity signals and phase-aware nudges
- **Security** — path validation, input sanitisation, rate limiting

## Requirements

- Node.js >= 20.0.0

## Installation

```bash
npm install -g brief-mcp
```

Or use directly with npx:

```bash
npx brief-mcp
```

## Quick Start

### 1. Add to your MCP client

Add `brief-mcp` to your MCP client configuration. For example, in Claude Desktop's `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "brief-mcp": {
      "command": "npx",
      "args": ["-y", "brief-mcp"]
    }
  }
}
```

### 2. Register a workspace

Tell the agent to register your projects directory:

> "Add ~/projects as a brief-mcp workspace"

### 3. Create or re-enter a project

> "Create a new BRIEF.md for my project" or "Re-enter my project"

The `brief_reenter_project` tool returns a structured summary — identity, decisions, questions, conflicts, lifecycle phase, and next steps — so the agent can pick up where you left off.

## Tools

The server exposes 57 tools over MCP, organised by domain:

### Workspace & Session

| Tool | Description |
|------|-------------|
| `brief_list_projects` | List all BRIEF.md projects in known workspaces |
| `brief_set_active_project` | Set the active project for the current session |
| `brief_reenter_project` | Re-enter an existing project (use at session start) |
| `brief_create_project` | Create a new BRIEF.md file |
| `brief_create_sub_project` | Create a sub-project nested under a parent |
| `brief_create_parent_project` | Create a parent BRIEF.md in an ancestor directory |
| `brief_add_workspace` | Register a workspace directory to scan for projects |
| `brief_start_tutorial` | Start the interactive onboarding tutorial |
| `brief_set_tutorial_dismissed` | Dismiss the tutorial |

### Context Read

| Tool | Description |
|------|-------------|
| `brief_get_context` | Read full project context from BRIEF.md |
| `brief_get_constraints` | Read all active constraints |
| `brief_get_decisions` | Read decisions (filterable by status) |
| `brief_get_questions` | Read open questions (to-resolve and to-keep-open) |

### Context Write

| Tool | Description |
|------|-------------|
| `brief_add_decision` | Record a new decision |
| `brief_add_constraint` | Add a constraint |
| `brief_add_question` | Record an open question |
| `brief_resolve_question` | Mark a question as resolved |
| `brief_update_section` | Update or clear a section |
| `brief_capture_external_session` | Record output from an external tool session |

### Validation

| Tool | Description |
|------|-------------|
| `brief_lint` | Lint a BRIEF.md for formatting and rule compliance |
| `brief_check_conflicts` | Check for conflicting decisions in the hierarchy |

### Hierarchy

| Tool | Description |
|------|-------------|
| `brief_where_am_i` | Show current position in the project hierarchy |
| `brief_hierarchy_tree` | Build an ASCII tree view of the hierarchy |

### Ontology

| Tool | Description |
|------|-------------|
| `brief_search_ontology` | Search installed packs by keyword |
| `brief_get_ontology_entry` | Retrieve a specific entry by ID |
| `brief_browse_ontology` | Browse an entry's neighbourhood (parents, children, siblings) |
| `brief_list_ontologies` | List available or installed packs |
| `brief_install_ontology` | Install a pack from a path or URL |
| `brief_remove_ontology` | Uninstall a pack |
| `brief_create_ontology` | Create a custom pack |
| `brief_ontology_draft` | Interactive multi-step ontology builder |
| `brief_tag_entry` | Tag a section with an ontology entry |
| `brief_list_tags` | List all ontology tags in the project |
| `brief_remove_tag` | Remove an ontology tag |
| `brief_list_ontology_columns` | List available columns for a pack |
| `brief_link_section_dataset` | Link an ontology to a section as a markdown table |
| `brief_convert_to_structured` | Convert a freeform section to structured |
| `brief_discover_ontologies` | Search local and external sources for ontologies |
| `brief_preview_dataset` | Preview a dataset before conversion |
| `brief_fetch_dataset` | Fetch and convert a dataset to an ontology pack |

### References

| Tool | Description |
|------|-------------|
| `brief_add_reference` | Add a bibliographic reference to a section |
| `brief_get_entry_references` | Look up references by ontology entry |
| `brief_suggest_references` | Suggest references for the current context |
| `brief_lookup_reference` | Look up references by creator or title |
| `brief_discover_references` | Build a search query from extension data |

### Extensions & Type Guides

| Tool | Description |
|------|-------------|
| `brief_suggest_extensions` | Suggest extensions for a project type |
| `brief_design_extension` | Design a custom extension |
| `brief_add_extension` | Add an extension to BRIEF.md |
| `brief_list_extensions` | List active extensions |
| `brief_remove_extension` | Remove an extension |
| `brief_get_type_guide` | Retrieve the type guide for a project type |
| `brief_create_type_guide` | Create or update a type guide |
| `brief_suggest_type_guides` | Search and rank type guides by relevance |
| `brief_apply_type_guide` | Apply a type guide (install suggested extensions and ontologies) |

### Discovery & Analysis

| Tool | Description |
|------|-------------|
| `brief_get_project_frameworks` | Detect frameworks and technologies in the project |
| `brief_get_maturity_signals` | Analyse decisions and return maturity signals |
| `brief_search_registry` | Search the MCP registry for packs and guides |

## Resources

| URI | Description |
|-----|-------------|
| `brief://guide` | AI interaction guide with tool usage patterns and decision capture rules |

## Transport

`brief-mcp` communicates over **stdio**, the standard MCP transport. It reads JSON-RPC messages from stdin and writes responses to stdout.

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Lint
npm run lint

# Type check
npm run typecheck

# Watch mode
npm run dev
```

## Security

See [SECURITY.md](SECURITY.md) for the vulnerability reporting policy and security design.

The server enforces path validation, input sanitisation, and rate limiting on all operations. Read operations are limited to 50 req/s (burst 100); write operations to 10 req/s (burst 20).

## License

[MIT](LICENSE)
