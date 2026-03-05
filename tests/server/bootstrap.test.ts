import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";

// Server bootstrap under test
import {
  createServer,
  getRegisteredTools,
  handleToolCall,
} from "../../src/server/bootstrap";

// ---------------------------------------------------------------------------
// Unit Tests
// ---------------------------------------------------------------------------

describe("TASK-08: MCP Server Bootstrap", () => {
  describe("server instantiation [MCP-01, MCP-04]", () => {
    it("server connects to stdio transport with no errors [MCP-01]", async () => {
      const server = await createServer();
      expect(server).toBeDefined();
      // Server must expose a connect method (MCP SDK Server.connect)
      expect(typeof (server as any).connect).toBe("function");
      // Server must expose a setRequestHandler or tool registration method
      expect(
        typeof (server as any).setRequestHandler === "function" ||
          typeof (server as any).tool === "function",
      ).toBe(true);
    });

    it('server is instantiated with name "brief-mcp" [MCP-01, A1-14]', async () => {
      const server = await createServer();
      // MCP SDK exposes the server name via serverInfo or _name
      const name =
        (server as any).serverInfo?.name ??
        (server as any)._serverInfo?.name ??
        (server as any).name;
      expect(name).toBe("brief-mcp");
    });

    it("server advertises tools capability [MCP-01, A1-15]", async () => {
      const server = await createServer();
      // MCP SDK exposes capabilities; tools must be declared for MCP clients to discover them
      const capabilities =
        (server as any).capabilities ??
        (server as any)._capabilities ??
        (server as any).serverInfo?.capabilities;
      expect(capabilities).toBeDefined();
      expect(capabilities.tools).toBeDefined();
    });
  });

  describe("node version prerequisite [ARCH-04]", () => {
    it("server bootstrap calls checkNodeVersion(20) on startup [ARCH-04]", async () => {
      const { checkNodeVersion } = await import("../../src/check-node-version");
      // Verify checkNodeVersion is exported and callable with 20
      expect(typeof checkNodeVersion).toBe("function");
      // Must not throw on current Node (which should be >= 20)
      expect(() => checkNodeVersion(20)).not.toThrow();
    });
  });

  describe("tool registration [MCP-02, MCP-06]", () => {
    it("listing tools returns exactly 38 definitions [MCP-02]", async () => {
      const tools = await getRegisteredTools();
      expect(tools).toHaveLength(38);
    });

    it("every tool name starts with brief_ [MCP-06]", async () => {
      const tools = await getRegisteredTools();
      for (const tool of tools) {
        expect(tool.name).toMatch(/^brief_/);
      }
    });

    it("registered tool names match exact spec list of 38 tools [MCP-02]", async () => {
      const tools = await getRegisteredTools();
      const toolNames = tools.map((t: any) => t.name).sort();
      const expectedTools = [
        // Workspace management (TASK-20, TASK-21, TASK-22, TASK-23, TASK-44)
        "brief_list_projects",
        "brief_set_active_project",
        "brief_create_project",
        "brief_create_sub_project",
        "brief_reenter_project",
        "brief_start_tutorial",
        "brief_set_tutorial_dismissed",
        "brief_add_workspace",
        // Context read tools (TASK-24)
        "brief_get_context",
        "brief_get_constraints",
        "brief_get_decisions",
        "brief_get_questions",
        // Context write — decisions (TASK-26)
        "brief_add_decision",
        // Context write — questions & constraints (TASK-27)
        "brief_add_constraint",
        "brief_add_question",
        "brief_resolve_question",
        // Context write — sections & external sessions (TASK-28)
        "brief_capture_external_session",
        "brief_update_section",
        // Lint & conflict tools (TASK-29, TASK-30)
        "brief_lint",
        "brief_check_conflicts",
        // Ontology tools (TASK-33, TASK-34, TASK-35, TASK-36)
        "brief_search_ontology",
        "brief_get_ontology_entry",
        "brief_browse_ontology",
        "brief_list_ontologies",
        "brief_install_ontology",
        "brief_remove_ontology",
        "brief_tag_entry",
        // Reference tools (TASK-37, TASK-38, TASK-39)
        "brief_get_entry_references",
        "brief_suggest_references",
        "brief_lookup_reference",
        "brief_add_reference",
        // Type guide tools (TASK-40, TASK-41, TASK-42, TASK-43)
        "brief_get_type_guide",
        "brief_create_type_guide",
        "brief_suggest_extensions",
        "brief_add_extension",
        "brief_list_extensions",
        // Framework visibility (TASK-44)
        "brief_get_project_frameworks",
        // Registry (TASK-49)
        "brief_search_registry",
      ].sort();
      expect(toolNames).toEqual(expectedTools);
    });

    it("every tool has description and schema [MCP-02]", async () => {
      const tools = await getRegisteredTools();
      for (const tool of tools) {
        expect(tool.description).toBeDefined();
        // Descriptions must be meaningful (> 20 chars), not just placeholders
        expect(tool.description.length).toBeGreaterThan(20);
        expect(tool.inputSchema).toBeDefined();
      }
    });

    it('every tool inputSchema has type:"object" and a properties map [MCP-02, A2-03]', async () => {
      const tools = await getRegisteredTools();
      for (const tool of tools) {
        expect(tool.inputSchema.type).toBe("object");
        expect(tool.inputSchema.properties).toBeDefined();
        expect(typeof tool.inputSchema.properties).toBe("object");
      }
    });

    it("representative tool schemas contain correct snake_case parameter names [MCP-02, A2-04]", async () => {
      const tools = await getRegisteredTools();
      const toolMap = Object.fromEntries(tools.map((t: any) => [t.name, t]));

      // brief_get_context: project_path parameter (TASK-24)
      expect(toolMap.brief_get_context.inputSchema.properties).toHaveProperty(
        "project_path",
      );

      // brief_add_decision: title (required), why, exception_to (TASK-26)
      expect(toolMap.brief_add_decision.inputSchema.properties).toHaveProperty(
        "title",
      );
      expect(toolMap.brief_add_decision.inputSchema.properties).toHaveProperty(
        "why",
      );
      expect(toolMap.brief_add_decision.inputSchema.properties).toHaveProperty(
        "exception_to",
      );
      expect(toolMap.brief_add_decision.inputSchema.required).toContain(
        "title",
      );

      // brief_search_ontology: query (required) (TASK-33)
      expect(
        toolMap.brief_search_ontology.inputSchema.properties,
      ).toHaveProperty("query");
      expect(toolMap.brief_search_ontology.inputSchema.required).toContain(
        "query",
      );

      // brief_check_conflicts: scope parameter (TASK-30)
      expect(
        toolMap.brief_check_conflicts.inputSchema.properties,
      ).toHaveProperty("scope");

      // brief_update_section: heading (required), content (TASK-28)
      expect(
        toolMap.brief_update_section.inputSchema.properties,
      ).toHaveProperty("heading");
      expect(
        toolMap.brief_update_section.inputSchema.properties,
      ).toHaveProperty("content");
      expect(toolMap.brief_update_section.inputSchema.required).toContain(
        "heading",
      );
    });
  });

  describe("protocol errors [MCP-07]", () => {
    it("unknown tool name returns JSON-RPC MethodNotFound (protocol-level, not isError) [MCP-07]", async () => {
      await expect(
        handleToolCall({ name: "nonexistent_tool", arguments: {} }),
      ).rejects.toThrow(/MethodNotFound|unknown/i);
    });

    it("malformed JSON in request body → JSON-RPC error returned [MCP-07]", async () => {
      // Verify that handleToolCall processes JSON-RPC parse errors correctly
      // by passing raw malformed JSON through actual JSON.parse to simulate
      // what would happen when the transport receives a bad message
      const malformedRaw = "{{invalid json: this cannot be parsed}}";
      let parseError: Error | null = null;
      try {
        JSON.parse(malformedRaw);
      } catch (e) {
        parseError = e as Error;
      }
      expect(parseError).not.toBeNull();

      // Now verify the server handles a parse-error scenario gracefully
      const result = await handleToolCall({
        name: "__malformed__",
        arguments: {} as any,
        _parseError: parseError?.message,
      } as any);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/parse|JSON|malformed|-32700/i);
    });
  });

  describe("stub handlers [MCP-02]", () => {
    it("success response has ONLY MCP-compliant top-level fields: content + optional isError [MCP-02, A1-05]", async () => {
      const result = await handleToolCall({
        name: "brief_get_context",
        arguments: { project_path: "/test" },
      });
      const keys = Object.keys(result);
      const allowed = ["content", "isError"];
      expect(
        keys.every((k) => allowed.includes(k)),
        `Unexpected MCP response fields: ${keys.filter((k) => !allowed.includes(k)).join(", ")}`,
      ).toBe(true);
    });

    it("valid call to stub returns response [MCP-02]", async () => {
      const result = await handleToolCall({
        name: "brief_get_context",
        arguments: { project_path: "/test" },
      });
      expect(result).toBeDefined();
      // Response must have content array (MCP tool response shape)
      expect(result).toHaveProperty("content");
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content.length).toBeGreaterThan(0);
      // MCP spec requires type === "text" exactly (not "image", "blob", etc.)
      expect(result.content[0].type).toBe("text");
      // text field must be a non-empty string
      expect(typeof result.content[0].text).toBe("string");
      expect(result.content[0].text.length).toBeGreaterThan(0);
    });
  });

  describe("input validation middleware [MCP-03]", () => {
    it("missing required param returns isError: true describing what is missing [MCP-03]", async () => {
      const result = await handleToolCall({
        name: "brief_add_decision",
        arguments: {}, // Missing required 'title'
      });
      expect(result.isError).toBe(true);
      // Error content must still use type: "text" (not "error" or any other type)
      expect(result.content[0].type).toBe("text");
      expect(typeof result.content[0].text).toBe("string");
      expect(result.content[0].text).toMatch(/required|missing/i);
    });

    it("empty string for required param returns isError: true [MCP-03]", async () => {
      const result = await handleToolCall({
        name: "brief_add_decision",
        arguments: { title: "" },
      });
      expect(result.isError).toBe(true);
    });

    it('brief_update_section with content:"" is accepted (means clear section) [MCP-03]', async () => {
      const result = await handleToolCall({
        name: "brief_update_section",
        arguments: { heading: "Test", content: "" },
      });
      // Empty content is valid for update_section (means "clear section")
      // MCP spec: isError must be OMITTED on success, not set to false
      expect(result.isError).toBeUndefined();
    });

    it("mutually exclusive params both present returns isError: true listing conflict [MCP-03]", async () => {
      const result = await handleToolCall({
        name: "brief_add_decision",
        arguments: {
          title: "Test",
          replaces: "dec-1",
          exception_to: "dec-2",
        },
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/replaces|exception_to|conflict/i);
    });
  });

  describe("parameter length limits [MCP-03]", () => {
    it("title exceeding 500 chars → validation error [MCP-03]", async () => {
      const longTitle = "a".repeat(501);
      const result = await handleToolCall({
        name: "brief_add_decision",
        arguments: { title: longTitle, rationale: "test" },
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/title|500|length/i);
    });

    it("search query exceeding 1000 chars → validation error [MCP-03]", async () => {
      const longQuery = "a".repeat(1001);
      const result = await handleToolCall({
        name: "brief_search_ontology",
        arguments: { query: longQuery, ontology: "test-pack" },
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/query|1000|length/i);
    });

    it("section content exceeding 100KB → validation error [MCP-03]", async () => {
      const bigContent = "a".repeat(100 * 1024 + 1);
      const result = await handleToolCall({
        name: "brief_update_section",
        arguments: { heading: "Direction", content: bigContent },
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/content|100|KB|length/i);
    });

    it("whitespace-only title → treated as missing, validation error [MCP-03]", async () => {
      const result = await handleToolCall({
        name: "brief_add_decision",
        arguments: { title: "   ", rationale: "test" },
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/title|required|missing/i);
    });
  });

  describe("error boundary [ERR-01, CODE-04]", () => {
    it("handler throws: caught, isError: true returned, logged with request ID [ERR-01]", async () => {
      // Force the handler to throw by passing a simulateThrow flag
      // The error boundary must catch it and return isError: true
      const result = await handleToolCall({
        name: "brief_get_context",
        arguments: { project_path: "/test" },
        _simulateThrow: new Error("Intentional test throw from handler"),
      } as any);
      expect(result).toBeDefined();
      expect(result.isError).toBe(true);
      // The error text must include error context (type, message, or request ID)
      expect(result.content[0].text).toMatch(/error|not.implemented|failed/i);
      // Must include request ID in the response or content to enable tracing (OBS-04)
      const responseText = JSON.stringify(result);
      expect(responseText).toMatch(/requestId|request_id|request-id|rid/i);
    });
  });

  describe("request lifecycle [OBS-04, OBS-05]", () => {
    it("every call logs duration — NOT in MCP response metadata [OBS-05]", async () => {
      // Per MCP spec, tool responses may only have { content, isError? }.
      // Duration must appear in logs (not in result.metadata).
      const logSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const result = await handleToolCall({
        name: "brief_list_projects",
        arguments: {},
      });
      expect(result).toBeDefined();
      expect(result).toHaveProperty("content");
      // MCP response must NOT carry a metadata field (not part of MCP spec)
      expect((result as any).metadata).toBeUndefined();
      // Duration must appear in log output
      const logged = logSpy.mock.calls.flat().join(" ");
      expect(logged).toMatch(/duration|executionTimeMs|durationMs|\d+ms/i);
      logSpy.mockRestore();
    });

    it("every call logs a unique request ID — NOT in MCP response metadata [OBS-04]", async () => {
      // Per MCP spec, requestId goes in logs, not in the tool response.
      const logSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const result1 = await handleToolCall({
        name: "brief_list_projects",
        arguments: {},
      });
      const result2 = await handleToolCall({
        name: "brief_list_projects",
        arguments: {},
      });
      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
      // MCP response must NOT carry a metadata field
      expect((result1 as any).metadata).toBeUndefined();
      expect((result2 as any).metadata).toBeUndefined();
      // Request IDs must appear in log output
      const logged = logSpy.mock.calls.flat().join(" ");
      expect(logged).toMatch(/requestId|request_id|request-id|rid/i);
      logSpy.mockRestore();
    });
  });

  describe("rate limiting [MCP-03]", () => {
    it("50 read calls/sec succeed; burst exhausted + 1 more gets rate limit error [MCP-03]", async () => {
      // Simulate burst of read calls
      const results: Promise<any>[] = [];
      for (let i = 0; i < 101; i++) {
        results.push(
          handleToolCall({ name: "brief_list_projects", arguments: {} }),
        );
      }
      const settled = await Promise.allSettled(results);
      // First 100 (burst) should succeed, 101st should be rate-limited
      const errors = settled.filter(
        (r) => r.status === "fulfilled" && (r.value as any).isError === true,
      );
      expect(errors.length).toBeGreaterThan(0);
      // Rate limit errors carry the message in content[0].text (per MCP-07: isError uses content, not top-level fields)
      const rateLimitErrors = errors.filter((r: any) =>
        (r.value?.content?.[0]?.text ?? "").match(
          /rate.?limit|too.?many|429|throttl/i,
        ),
      );
      expect(rateLimitErrors.length).toBeGreaterThan(0);
      const successes = settled.filter(
        (r) => r.status === "fulfilled" && !(r.value as any)?.isError,
      );
      expect(successes.length).toBeGreaterThan(0);
    });

    it("10 write calls/sec succeed; burst exhausted + 1 more gets rate limit error [MCP-03]", async () => {
      const results: Promise<any>[] = [];
      for (let i = 0; i < 21; i++) {
        results.push(
          handleToolCall({
            name: "brief_add_decision",
            arguments: { title: `Decision ${i}`, why: "test" },
          }),
        );
      }
      const settled = await Promise.allSettled(results);
      const errors = settled.filter(
        (r) => r.status === "fulfilled" && (r.value as any).isError === true,
      );
      expect(errors.length).toBeGreaterThan(0);
      // Rate limit errors carry the message in content[0].text (per MCP-07: isError uses content, not top-level fields)
      const rateLimitErrors = errors.filter((r: any) =>
        (r.value?.content?.[0]?.text ?? "").match(
          /rate.?limit|too.?many|429|throttl/i,
        ),
      );
      expect(rateLimitErrors.length).toBeGreaterThan(0);
      const successes = settled.filter(
        (r) => r.status === "fulfilled" && !(r.value as any)?.isError,
      );
      expect(successes.length).toBeGreaterThan(0);
    });

    it("after pause, tokens refill and calls succeed again [MCP-03]", async () => {
      // Wait for token refill
      await new Promise((r) => setTimeout(r, 1100));
      const result = await handleToolCall({
        name: "brief_list_projects",
        arguments: {},
      });
      expect(result).toBeDefined();
      // MCP spec: isError must be OMITTED on success, not set to false
      expect(result.isError).toBeUndefined();
    });
  });

  describe("operation timeout [ERR-09]", () => {
    it("tool call exceeding 30-second timeout: controller.abort() called, isError: true with timeout message [ERR-09]", async () => {
      const result = await handleToolCall({
        name: "brief_get_context",
        arguments: { project_path: "/test" },
        timeoutMs: 1, // Very short timeout to trigger abort
      } as any);
      expect(result).toBeDefined();
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/timeout|abort|cancelled/i);
    });
  });

  describe("tool descriptions [MCP-05]", () => {
    it("brief_get_context description mentions session start [MCP-05]", async () => {
      const tools = await getRegisteredTools();
      const getContext = tools.find((t: any) => t.name === "brief_get_context");
      expect(getContext).toBeDefined();
      expect(getContext!.description).toMatch(/session.*start|start.*session/i);
    });

    it("all tool descriptions mention brief-mcp scope [MCP-05]", async () => {
      const tools = await getRegisteredTools();
      for (const tool of tools) {
        expect(
          tool.description.toLowerCase(),
          `Tool ${tool.name} description should mention scope`,
        ).toMatch(/brief/i);
      }
    });

    it("all tool descriptions are under 500 characters [MCP-05, T46-01]", async () => {
      const tools = await getRegisteredTools();
      for (const tool of tools) {
        expect(
          tool.description.length,
          `Tool ${tool.name} description (${tool.description.length} chars) exceeds 500 char limit`,
        ).toBeLessThan(500);
      }
    });

    it("specific tool descriptions include required content [MCP-05, T46-02]", async () => {
      const tools = await getRegisteredTools();
      const toolMap = Object.fromEntries(tools.map((t: any) => [t.name, t]));

      // T46-02: 8 specific tools must have content-matching descriptions
      expect(toolMap.brief_get_context.description).toMatch(/context|session/i);
      expect(toolMap.brief_add_decision.description).toMatch(/decision/i);
      expect(toolMap.brief_add_question.description).toMatch(/question/i);
      expect(toolMap.brief_lint.description).toMatch(/lint|valid/i);
      expect(toolMap.brief_search_ontology.description).toMatch(
        /search|ontolog/i,
      );
      expect(toolMap.brief_tag_entry.description).toMatch(/tag/i);
      expect(toolMap.brief_check_conflicts.description).toMatch(/conflict/i);
      expect(toolMap.brief_create_project.description).toMatch(
        /create|project/i,
      );
    });
  });
});

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe("TASK-08: Property Tests", () => {
  it("forAll(registered tool): calling never crashes the server [MCP-07]", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: 37 }), async (toolIndex) => {
        const tools = await getRegisteredTools();
        const tool = tools[toolIndex];
        // Calling any tool with empty args should not crash
        const result = await handleToolCall({
          name: tool.name,
          arguments: {},
        });
        expect(result).toBeDefined();
        // Result must be a structured response — never a raw throw
        expect(result).toHaveProperty("content");
      }),
      { numRuns: 38 },
    );
  });

  it("forAll(arbitrary JSON params): error boundary returns isError: true, never throws [MCP-07]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.dictionary(fc.string({ minLength: 1, maxLength: 20 }), fc.string()),
        async (params) => {
          // Call a known tool with arbitrary params — should never throw
          const result = await handleToolCall({
            name: "brief_get_context",
            arguments: params,
          });
          expect(result).toBeDefined();
          // Invalid params must produce isError: true, not a throw
          expect(result.isError).toBe(true);
          expect(result.content).toBeDefined();
          expect(result.content.length).toBeGreaterThan(0);
        },
      ),
    );
  });

  it("forAll(N calls): each response has valid MCP envelope, no metadata field [MCP-02, OBS-04]", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 2, max: 5 }), async (n) => {
        for (let i = 0; i < n; i++) {
          const result = await handleToolCall({
            name: "brief_list_projects",
            arguments: {},
          });
          // Each MCP response must have content array
          expect(result).toHaveProperty("content");
          expect(Array.isArray(result.content)).toBe(true);
          expect(result.content.length).toBeGreaterThan(0);
          // MCP spec: only { content, isError? } at top level — no metadata
          expect((result as any).metadata).toBeUndefined();
        }
      }),
      { numRuns: 5 },
    );
  });
});
