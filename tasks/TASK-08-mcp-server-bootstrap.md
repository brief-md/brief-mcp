# TASK-08: MCP Server Bootstrap

## Metadata
- Priority: 9
- Status: pending
- Dependencies: TASK-01, TASK-02, TASK-03, TASK-04
- Module path: src/server/bootstrap.ts
- Type stubs: src/types/tools.ts
- Also read: src/types/config.ts, src/types/responses.ts
- Test file: tests/server/bootstrap.test.ts
- Estimated context KB: 45

## What To Build

MCP Server instance using `@modelcontextprotocol/sdk`, stdio transport, tool registration for all 38 tools, and request lifecycle middleware (request ID injection, input validation, performance timing, error boundary, token-bucket rate limiter). Tool descriptions guide AI behaviour. All handlers are stubs at this stage.

## Implementation Guide

1. **Server instantiation:** Before instantiating the Server, call `checkNodeVersion(20)` (from TASK-01's `src/check-node-version.ts`). If the Node.js version is below 20, log the error to stderr and exit with code 1. This check MUST run before any MCP SDK or transport initialization. Then instantiate: `Server` from SDK, `name: "brief-mcp"`, version from package.json. Capability: `tools: {}`. (OQ-117)
2. **stdio transport:** `StdioServerTransport`, connect via `server.connect()`. Log errors, don't crash. HTTP is v2 stub only.
3. **Tool registration:** Register 38 tools via `ListToolsRequestSchema`. Each has `brief_`-prefixed name, description, inputSchema. Handlers return "not yet implemented" stubs. Full tool list: brief_list_projects, brief_set_active_project, brief_create_project, brief_create_sub_project, brief_reenter_project, brief_start_tutorial, brief_set_tutorial_dismissed, brief_add_workspace, brief_get_context, brief_get_constraints, brief_get_decisions, brief_get_questions, brief_add_decision, brief_add_constraint, brief_add_question, brief_resolve_question, brief_capture_external_session, brief_update_section, brief_lint, brief_check_conflicts, brief_search_ontology, brief_get_ontology_entry, brief_browse_ontology, brief_list_ontologies, brief_install_ontology, brief_tag_entry, brief_get_entry_references, brief_suggest_references, brief_lookup_reference, brief_add_reference, brief_get_type_guide, brief_create_type_guide, brief_suggest_extensions, brief_add_extension, brief_list_extensions, brief_get_project_frameworks, brief_remove_ontology, brief_search_registry.
4. **Descriptions:** brief_get_context: "Call this at session start." All include scope note. Under ~500 chars. Pack-content tools note data is user-contributed.
5. **Middleware pipeline (CallToolRequestSchema):** (a) Request ID via crypto.randomUUID(), log at debug. (b) Parameter validation: call `validateRequiredString()` for all required string params, `validateParameterLimits()` for length checks (paths 4096, titles/names 500, content 100KB, queries 1000, labels 200), and `validateMutualExclusion()` for incompatible param pairs — all from TASK-05b's `src/security/input-sanitisation.ts`. Whitespace-only strings are treated as missing for required params. Invalid input returns `isError: true`. (c) Rate limit check; exceeded -> `isError: true`. (d) Timing: log duration at debug. (e) Error boundary: catch all, log at error, return `isError: true`. Never throw to transport. (f) **Operation timeout (ERR-09):** Create an `AbortController` per tool call. Pass the `signal` into the tool handler context object. The middleware applies a 30-second timeout — when exceeded, call `controller.abort()` and return `isError: true` with a timeout message before the handler completes. Tool handlers that perform file I/O or long computations MUST check `signal.aborted` at checkpoint intervals and abort early if true. Write operations that have already begun an atomic write sequence MUST still complete the cleanup path (delete temp file) even when aborted — never leave orphaned temp files on abort. Reference MCP-03, SEC-19, ERR-09, CONC-06, and OQ-207/208/209.
6. **Rate limiter:** Two token-buckets: read (50/s, burst 100) for get/list/search/browse/suggest/lint/check/lookup; write (10/s, burst 20) for add/create/update/set/install/remove/tag/capture/resolve. Continuous refill.
7. **Errors:** Tool errors -> `isError: true` in successful JSON-RPC. Only throw for protocol violations (unknown tool, malformed JSON).

8. **No `process.exit()` calls:** Never call `process.exit()` directly in any server code. MCP uses stdout for protocol messages — calling `process.exit()` truncates any buffered stdout output and breaks in-flight MCP messages. Let the event loop drain naturally so all buffered messages are transmitted before the process terminates. TASK-50 handles graceful shutdown via SIGINT/SIGTERM signal handlers. (OQ-246)

## Exported API

Export from `src/server/bootstrap.ts`:
- `createServer() → Server` — MCP server instance with `{ connect, name: 'brief-mcp', capabilities: { tools } }`
- `getRegisteredTools() → Array<{ name: string; description: string; inputSchema: { type: 'object'; properties: object; required?: string[] } }>` — all 38 tools, names start with `brief_`, descriptions 20-500 chars
- `handleToolCall(params: { name: string; arguments: object; _simulateThrow?: Error; timeoutMs?: number }) → { content: Array<{ type: 'text'; text: string }>; isError?: boolean }` — MCP-compliant response, only `content` and optional `isError` at top level

## Rules

### MCP-01: Standard Protocol Compliance
The server MUST implement the MCP protocol correctly. Use the official MCP SDK for the chosen language. Do not implement the protocol from scratch.

### MCP-02: Tool Registration
All 38 tools MUST be registered with accurate names, descriptions, and input schemas. Descriptions should be concise and help the AI understand when to use each tool.

### MCP-03: Input Validation
All tool inputs MUST be validated against their schema before execution. Invalid inputs return a structured error, not a crash. Validate empty/whitespace-only strings: for required parameters (title, query, path, name), treat empty or whitespace-only strings as missing and return `user_error`. For `brief_update_section(content: "")`, empty string is valid (means "clear section"). Centralise in `validateRequiredString()`. Validate parameter length limits: titles/names 500 chars, section content 100KB, search queries 1000 chars, labels 200 chars, paths 4096 chars. Configurable via config.json. Check mutually exclusive parameters: `replaces` and `exception_to` cannot both be provided. `direction` without `entry_id` is invalid. Return clear `user_error` listing the conflict. Decision field validation: `title` required, 1-500 chars. `why` recommended but not required. `date` defaults to today if missing, rejected if present but not parseable.

### MCP-04: stdio Transport First
v1 MUST support stdio transport. HTTP transport is v2 and can be stubbed/planned but not required for initial delivery.

### MCP-05: Tool Descriptions Guide AI Behaviour
Tool descriptions are part of the AI's prompt. They MUST be written to guide correct usage patterns. Include notes like "Call this at the start of every session" for `brief_get_context`.

### MCP-06: Tool Naming to Prevent Conflicts with Other MCPs
All brief-mcp tools MUST use the `brief_` prefix (e.g., `brief_add_decision`, `brief_get_context`). This prefix clearly scopes brief-mcp tools and reduces ambiguity when multiple MCP servers are connected simultaneously. Tool descriptions MUST include a note clarifying the tool's scope.

### MCP-07: Tool errors use `isError: true`, not JSON-RPC error responses.
Only throw JSON-RPC errors for actual protocol violations (unknown tool name, malformed JSON). All tool-level errors (user_error, system_error) are returned as successful JSON-RPC responses with `isError: true` and descriptive text content. Never throw from inside a tool handler.

### ARCH-05: Transport Agnostic
All tool implementations MUST be transport-agnostic. The same tool handler works over stdio (v1) and HTTP (v2). Transport is a configuration concern, not a code concern.

## Test Specification

### Unit Tests (specific input -> expected output)
- Server connects to stdio transport -> ready with no errors
- Listing tools -> exactly 38 definitions returned
- Every tool name -> starts with `brief_`; every tool -> has description and schema
- Unknown tool name -> JSON-RPC MethodNotFound (protocol-level, not `isError`)
- Valid call to stub -> returns response
- Missing required param -> `isError: true` describing what's missing
- Empty string for required param -> `isError: true`; `brief_update_section(content:"")` -> accepted
- Mutually exclusive params both present -> `isError: true` listing conflict
- Handler throws -> caught, `isError: true` returned, logged with request ID
- Every call -> unique request ID and duration in logs
- 50 read calls/sec -> succeed; burst exhausted + 1 more -> rate limit error
- 10 write calls/sec -> succeed; burst exhausted + 1 more -> rate limit error
- After pause -> tokens refill, calls succeed again
- Tool call exceeding 30-second timeout → controller.abort() called, isError: true returned with timeout message
- Malformed JSON -> JSON-RPC parse error
- brief_get_context description -> mentions session start; all -> mention brief-mcp scope

### Property Tests (invariants that hold for ALL inputs)
- forAll(registered tool): calling never crashes the server
- forAll(arbitrary JSON params): error boundary returns `isError: true`, never throws
- forAll(N calls): each gets a distinct request ID

## Tier 4 Criteria

Tier 4 criteria: JC-07, JC-08, JC-09
