# Getting Started with brief-mcp

## What brief-mcp Does

When you plan a project in an AI chat, decisions get made and direction gets clear — but the context window compacts it away, new sessions start blank, and coming back after a break means piecing things together from memory.

`brief-mcp` is a note taker while you chat, and a boot loader when you start a new session. It captures decisions, constraints, and open questions into a structured BRIEF.md file as you work. When you return, it loads that context automatically — you start briefed, not blank.

Because BRIEF.md is just a markdown file in your project folder, it works across tools. Plan in one AI client, build in another — the same context follows.

## Requirements

- **Node.js >= 20** (enforced at startup)

## Installation

Install globally:

```bash
npm install -g @brief-md/mcp
```

Or run directly without installing:

```bash
npx @brief-md/mcp
```

## MCP Client Setup

brief-mcp communicates over stdio using the Model Context Protocol. Configure your MCP client to spawn it as a subprocess.

### Claude Desktop

Add the following to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "brief-mcp": {
      "command": "npx",
      "args": ["-y", "@brief-md/mcp"]
    }
  }
}
```

The config file is located at:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

### Claude Code

Run the following command:

```bash
claude mcp add brief-mcp -- npx --yes @brief-md/mcp
```

This registers brief-mcp as an MCP server that Claude Code will spawn automatically.

### Cursor

1. Open **Settings** > **MCP Servers**
2. Add a new stdio server:
   - **Command**: `npx`
   - **Args**: `["-y", "@brief-md/mcp"]`

### Windsurf

Configuration is similar to Cursor. Add an stdio MCP server with command `npx` and args `["-y", "@brief-md/mcp"]` through the MCP settings interface.

### Generic stdio Client

Spawn `npx @brief-md/mcp` as a subprocess and communicate via stdin/stdout using JSON-RPC messages following the MCP protocol. The server reads JSON-RPC requests from stdin and writes responses to stdout.

## First Project Walkthrough

### 1. Register a workspace

A workspace is a directory where your projects live. Register one:

```
Tool: brief_add_workspace
Args: { "path": "/path/to/your/projects" }
```

### 2. Create a project

```
Tool: brief_create_project
Args: {
  "path": "/path/to/your/projects/my-app",
  "name": "My App",
  "description": "A brief description of the project"
}
```

This creates a `BRIEF.md` file with core sections and enters the setup phase.

### 3. Follow the setup phase flow

After project creation, the server guides you through four setup phases:

1. **needs_identity** -- The project needs basic identity. Describe what the project is, what it is not, and why it exists.
2. **choose_type_guide** -- Select a domain-specific type guide (e.g., "web app", "CLI tool", "music album") or use the generic guide.
3. **explore_type** -- Review the selected type guide's dimensions, workflows, and known tensions.
4. **review_suggestions** -- Review suggested extensions and ontology packs for your project type. Approve or skip each one.

The MCP client (Claude, Cursor, etc.) drives this flow by calling the appropriate tools. Each response includes a `setupPhase` field indicating the current phase and what to do next.

### 4. Start capturing decisions

Once setup is complete, the project enters the **Design** lifecycle phase. As you discuss your project with the AI assistant, it will:

- Detect commitment language and capture decisions
- Surface questions about unknowns and tensions
- Record constraints that shape the design

## Re-entering an Existing Project

When starting a new session with an existing project, use:

```
Tool: brief_reenter_project
Args: { "path": "/path/to/your/projects/my-app" }
```

This loads the project context and returns a summary of the current state, including:
- Project metadata and lifecycle phase
- Recent decisions
- Open questions
- Active extensions
- Any detected conflicts

The AI assistant uses this context to resume the conversation where you left off.
