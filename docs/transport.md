# Transport & Remote Access

When you use brief-mcp with an AI chat, the server needs to run somewhere your MCP client can reach it. Today that means on the same machine. This page explains how it works, how to access it remotely, and what's coming.

## Current: stdio Transport

brief-mcp communicates over **stdio** — JSON-RPC messages on stdin/stdout, following the Model Context Protocol. The MCP client spawns it as a subprocess:

1. Client runs `npx @brief-md/mcp` as a child process
2. Client sends requests to the server's stdin
3. Server writes responses to stdout
4. Stderr is used for logging only

Both must run on the **same machine** — they're connected by process pipes, not a network.

## Local Setup

Works out of the box on any machine with Node.js >= 20:

- **Claude Desktop** — configure in `claude_desktop_config.json`
- **Claude Code** — `claude mcp add brief-mcp -- npx --yes @brief-md/mcp`
- **Cursor / Windsurf** — add as stdio MCP server in settings

See [Getting Started](getting-started.md) for full setup instructions.

## Remote Access from Phone or Another Device

You can use brief-mcp from your phone, tablet, or any device — but the host machine must be running. The pattern: run Claude Code on the host, connect to it remotely.

### Claude Code over SSH (recommended)

Claude Code supports remote connections natively. From any device with an SSH client:

```bash
# From your phone/tablet/laptop — SSH into the machine running brief-mcp
ssh user@your-machine

# Start Claude Code in the remote session
claude

# brief-mcp is available — it spawns as a subprocess of Claude Code
```

Your phone connects to the remote terminal, Claude Code runs on the host, and brief-mcp runs alongside it. All file access happens on the host machine.

### Using a mobile terminal app

If you prefer a terminal app (Termius, Blink, iSH, etc.):

1. Open the terminal app on your phone or tablet
2. SSH into your development machine
3. Run `claude` to start Claude Code
4. brief-mcp is available through the MCP tools

This is the setup that lets you work on projects from anywhere — you're accessing Claude Code running on your host machine, with brief-mcp capturing and loading context in the background.

### What you need

- **Host machine on and accessible** — it runs the server
- **SSH access** — the host must accept SSH connections
- **Claude Code installed on the host** — with brief-mcp configured as an MCP server
- **A terminal on your device** — any SSH-capable terminal works

### Limitations of stdio transport

- The host machine must be powered on and network-reachable
- You need SSH or terminal access to the host — there's no web UI or API endpoint
- One client per server instance (no shared access)
- If the host goes to sleep or disconnects, the session drops

## Roadmap: HTTP Transport (coming)

Stdio requires the server and client to be on the same machine. HTTP transport removes that constraint — brief-mcp would run as a persistent network service that any MCP client can connect to over the internet.

### What this enables

- **No host machine dependency** — deploy brief-mcp on a VPS, cloud VM, or container and leave it running permanently
- **Direct mobile access** — MCP clients on any device connect over the network without SSH
- **Multiple clients** — share the same server across devices or team members
- **Browser-based access** — MCP clients in web apps could connect directly

### Current state in the codebase

The groundwork exists but HTTP transport is not yet implemented:

- `TransportMode` is typed as `"stdio" | "http"` in `src/types/config.ts`
- Default port `3847` is defined in config (currently unused)
- The MCP SDK provides `StreamableHTTPServerTransport` and `SSEServerTransport` classes
- Rate limiting types (`RateLimiterConfig`, `RateLimiterState`) are already defined

### Design considerations

- **Authentication** — stdio is secured by process isolation; HTTP needs API keys, OAuth, or similar
- **TLS** — encrypted connections are essential for any non-localhost deployment
- **Session management** — concurrent clients need isolated state
- **CORS** — browser-based clients need appropriate headers

### How it would work

When implemented, deploying brief-mcp as a network service would look like:

```bash
# On a VPS or cloud VM
npx @brief-md/mcp --transport http --port 3847
```

MCP clients would connect over the network instead of spawning a subprocess. Support for Claude Desktop, Claude Code, and other MCP clients that support HTTP/SSE transport is planned.

### Status

This is on the roadmap. If you're interested in this feature or have a use case to share, open an issue on [GitHub](https://github.com/brief-md/brief-mcp/issues).
