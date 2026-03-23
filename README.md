[![CI](https://github.com/brief-md/brief-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/brief-md/brief-mcp/actions)
[![npm](https://img.shields.io/npm/v/brief-mcp)](https://www.npmjs.com/package/brief-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

# brief-mcp

MCP server for [BRIEF.md](https://github.com/brief-md/brief-mcp) project context management.

BRIEF.md is a lightweight, human-readable file that preserves the *why* behind a project — its purpose, boundaries, key decisions, and open questions — so that re-entry becomes continuation rather than reconstruction. `brief-mcp` exposes this as a set of tools over the [Model Context Protocol](https://modelcontextprotocol.io), giving AI agents structured access to project intent.

## Features

- **57 MCP tools** — full read/write access to BRIEF.md project context
- **Hierarchy-aware context** — walk upward through nested BRIEF.md files
- **Ontology system** — install, search, browse, and tag domain knowledge packs
- **Reference system** — bibliographic references with reverse index and suggestions
- **Conflict detection** — surface contradictions across decisions and constraints
- **Type guides and extensions** — domain-specific structure on top of a universal core
- **Lifecycle tracking** — maturity signals and phase-aware nudges
- **Security** — path validation, input sanitisation, resource limits

> **Full documentation**: See the [docs/](docs/) directory for the complete manual including tool reference, interaction patterns, and guides.

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

**Claude Desktop** — add to `claude_desktop_config.json`:

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

**Claude Code**:

```bash
claude mcp add brief-mcp -- npx --yes brief-mcp
```

**Cursor** — Settings > MCP Servers, add:

```json
{
  "brief-mcp": {
    "command": "npx",
    "args": ["-y", "brief-mcp"]
  }
}
```

**Windsurf** — similar stdio configuration to Cursor.

### 2. Register a workspace

Tell the agent to register your projects directory:

> "Add ~/projects as a brief-mcp workspace"

### 3. Create or re-enter a project

> "Create a new BRIEF.md for my project" or "Re-enter my project"

The `brief_reenter_project` tool returns a structured summary — identity, decisions, questions, conflicts, lifecycle phase, and next steps — so the agent can pick up where you left off.

## Tools

The server exposes 57 tools over MCP, organised by domain. See [docs/tools/](docs/tools/) for full parameter documentation and examples.

| Category | Tools | Description |
|----------|-------|-------------|
| [Workspace & Session](docs/tools/workspace.md) | 9 | Project creation, re-entry, workspace management |
| [Context Read](docs/tools/context-read.md) | 4 | Read context, constraints, decisions, questions |
| [Context Write](docs/tools/context-write.md) | 6 | Record decisions, questions, update sections |
| [Validation](docs/tools/validation.md) | 2 | Lint and conflict detection |
| [Hierarchy](docs/tools/hierarchy.md) | 2 | Position and tree view |
| [Ontology](docs/tools/ontology.md) | 17 | Search, browse, tag, install, create packs |
| [References](docs/tools/references.md) | 5 | Add, lookup, suggest references |
| [Extensions & Type Guides](docs/tools/extensions.md) | 9 | Extensions, type guides, structured sections |
| [Discovery & Analysis](docs/tools/discovery.md) | 3 | Frameworks, maturity, registry search |

### MCP Resource

| URI | Description |
|-----|-------------|
| `brief://guide` | AI interaction guide with 11 patterns, decision rules, and question rules |

## Transport

`brief-mcp` communicates over **stdio** (JSON-RPC via stdin/stdout). The MCP client spawns the server as a subprocess — both must run on the same machine.

**What this enables:**
- Local use via Claude Desktop, Claude Code, Cursor, or any stdio MCP client
- Remote use via SSH or remote terminal (e.g. Claude Code over SSH)

**What this does not enable:**
- Direct network access from another machine or mobile device
- Running as a standalone persistent service

See [docs/transport.md](docs/transport.md) for remote access options and the HTTP transport roadmap.

## Documentation

| Guide | Description |
|-------|-------------|
| [Getting Started](docs/getting-started.md) | Installation, client setup, first project |
| [Core Concepts](docs/concepts.md) | BRIEF.md format, hierarchy, lifecycle, extensions |
| [Tool Reference](docs/tools/) | All 57 tools with parameters and examples |
| [Interaction Patterns](docs/guides/interaction-patterns.md) | 11 patterns for AI-assisted workflows |
| [Decision Rules](docs/guides/decision-rules.md) | DR-01 through DR-09 |
| [Question Rules](docs/guides/question-rules.md) | QUEST-01 through QUEST-12 |
| [Ontology System](docs/guides/ontology-system.md) | Packs, tagging, structured sections |
| [Extensions](docs/guides/extensions.md) | Built-in and custom extensions |
| [Type Guides](docs/guides/type-guides.md) | Domain-specific project templates |
| [Configuration](docs/configuration.md) | Config file, env vars, CLI flags |
| [Transport](docs/transport.md) | stdio, remote access, HTTP roadmap |
| [Troubleshooting](docs/troubleshooting.md) | Common issues and debugging |

## Development

```bash
npm install          # Install dependencies
npm run build        # Build for production
npm test             # Run tests
npm run lint         # Lint (Biome)
npm run typecheck    # Type check (tsc)
npm run dev          # Watch mode
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.

## Security

See [SECURITY.md](SECURITY.md) for the vulnerability reporting policy and security design.

The server enforces path validation, input sanitisation, and resource limits on all operations. No external HTTP or AI API calls are made.

## Community

- [Code of Conduct](CODE_OF_CONDUCT.md)
- [Contributing](CONTRIBUTING.md)
- [Changelog](CHANGELOG.md)

## License

[MIT](LICENSE)
