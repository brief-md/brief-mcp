# Transport & Remote Access

`brief-mcp` needs to communicate with the AI client you're using — Claude Desktop, Claude Code, Cursor, or any MCP-compatible tool. How it connects determines where the server can run and how you can access your project context.

## Current: stdio Transport

brief-mcp uses **stdio transport** -- it communicates over stdin/stdout using JSON-RPC messages following the Model Context Protocol.

### How it works

1. The MCP client (Claude Desktop, Claude Code, Cursor, etc.) spawns `npx brief-mcp` as a subprocess
2. The client sends JSON-RPC requests to the server's stdin
3. The server writes JSON-RPC responses to the client's stdout
4. Stderr is used for logging (never for protocol messages)

Both the client and server must run on the **same machine** since they communicate via process pipes.

### What this enables

**Local use:**
- Claude Desktop on your machine
- Claude Code in your terminal
- Cursor or Windsurf IDE
- Any MCP client that supports stdio transport

**Remote use via SSH:**
- SSH into a remote machine and run Claude Code there
- brief-mcp spawns locally on the remote machine
- You interact through your SSH session

**Remote use via remote terminal:**
- Use a remote terminal app (e.g., running Claude Code on a remote machine accessed from a mobile device or tablet)
- brief-mcp runs on the host machine alongside Claude Code

### What this does NOT enable

- Direct network access from another machine or browser
- Running brief-mcp as a standalone persistent service
- Accessing brief-mcp from a mobile app without an SSH or terminal connection to the host
- Multiple simultaneous clients connecting to one server instance

## Remote Access Today

### Via SSH

The most straightforward remote access pattern:

1. SSH into your development machine: `ssh user@your-machine`
2. Run Claude Code (or another terminal-based MCP client)
3. brief-mcp spawns locally on that machine
4. All file access and processing happens on the remote machine

**Requirement**: The host machine must be running and accessible via SSH.

### Via remote terminal apps

If you use a terminal app on a phone or tablet to connect to a remote machine:

1. Connect to your machine via the terminal app
2. Run Claude Code in the remote session
3. brief-mcp spawns as a subprocess

This gives you mobile access to brief-mcp, but the host machine must be running.

### Limitations

- The host machine must be powered on and accessible
- You need terminal/SSH access to the machine
- There is no web-based UI or API endpoint you can hit from a browser

## Roadmap: HTTP/SSE Transport

The codebase has infrastructure for HTTP transport, though it is not yet implemented:

### Current state in the codebase

- `TransportMode` is typed as `"stdio" | "http"` in `src/types/config.ts`
- Default port `3847` is configured but unused
- The MCP SDK (`@modelcontextprotocol/sdk`) provides `StreamableHTTPServerTransport` and `SSEServerTransport` classes

### What HTTP transport would enable

- **Persistent service** -- Deploy brief-mcp on a VPS or cloud VM as a long-running process
- **Network access** -- Connect from any machine on the network (or internet)
- **Multiple clients** -- Multiple users or devices could connect to the same instance
- **Web-based access** -- MCP clients running in browsers could connect directly

### Design considerations for implementation

- **Authentication** -- HTTP transport would need authentication (API keys, OAuth, or similar) since the server would be network-accessible
- **TLS** -- Encrypted connections would be essential for any non-localhost deployment
- **Session management** -- Multiple concurrent sessions would need isolation and state management
- **CORS** -- Browser-based clients would need appropriate CORS headers
- **Rate limiting** -- The server already has rate limiter types defined (`RateLimiterConfig`, `RateLimiterState`) that could be applied to HTTP endpoints

### How it would work

When implemented, HTTP transport would allow configuration like:

```json
{
  "transport": "http",
  "port": 3847
}
```

The server would start an HTTP server accepting MCP protocol messages over Server-Sent Events (SSE) or streamable HTTP, allowing remote MCP clients to connect over the network.
