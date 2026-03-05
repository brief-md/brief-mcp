import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import {
  buildInsufficientDataSignal,
  formatResponse,
  formatWriteConfirmation,
  separateDecisions,
  truncateResponse,
} from "../../src/server/response-formatting";

// ---------------------------------------------------------------------------
// Unit Tests
// ---------------------------------------------------------------------------

describe("TASK-46: MCP Server — Tool Response Formatting & Context Blocks", () => {
  describe("structured responses [RESP-01]", () => {
    it("tool response with all required fields: structured and parseable [RESP-01]", () => {
      const result = formatResponse({
        type: "read",
        data: { content: "test" },
      });
      expect(result).toHaveProperty("content");
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content[0].type).toBe("text");
      expect(typeof result.content[0].text).toBe("string");
      expect(result.content[0].text.length).toBeGreaterThan(0);
    });
  });

  describe("read tool purity [RESP-03]", () => {
    it("read tool response: no file modifications occur [RESP-03]", async () => {
      const writeFileSpy = vi
        .spyOn((await import("node:fs/promises")) as any, "writeFile")
        .mockResolvedValue(undefined);
      const response = formatResponse({
        type: "read",
        data: { content: "test" },
      });
      expect((response as any).modified).toBeUndefined();
      expect(writeFileSpy).not.toHaveBeenCalled();
      writeFileSpy.mockRestore();
    });
  });

  describe("write tool confirmation [RESP-04]", () => {
    it("write tool response: MCP-wrapped with file path and change summary in content text [RESP-04]", () => {
      const response = formatWriteConfirmation({
        filePath: "/path/to/BRIEF.md",
        changes: ["Added decision"],
      });
      // Must be MCP-compliant: { content: [{ type: "text", text: "..." }] }
      expect(response.content).toBeDefined();
      expect(Array.isArray(response.content)).toBe(true);
      expect(response.content[0].type).toBe("text");
      expect(typeof response.content[0].text).toBe("string");
      // File path and changes must appear in content text, not as top-level fields
      expect(response.content[0].text).toContain("/path/to/BRIEF.md");
      expect(response.content[0].text).toMatch(/added decision/i);
      // Must NOT expose filePath or changes as raw top-level MCP response fields
      expect((response as any).filePath).toBeUndefined();
      expect((response as any).changes).toBeUndefined();
    });
  });

  describe("decision separation [RESP-06]", () => {
    it("context block with active and superseded decisions: separated into distinct sections [RESP-06]", () => {
      const decisions = [
        { text: "Use REST", status: "active" },
        { text: "Use SOAP", status: "superseded" },
        { text: "Override for iOS", status: "exception" },
      ];
      const separated = separateDecisions(decisions);
      expect(separated.activeDecisions).toBeDefined();
      expect(separated.decisionHistory).toBeDefined();
      expect(separated.activeDecisions.length).toBe(1);
    });

    it("decision item: always includes status field (active, superseded, or exception) [RESP-06]", () => {
      const decisions = [
        { text: "Use REST", status: "active" },
        { text: "Use SOAP", status: "superseded" },
      ];
      const separated = separateDecisions(decisions);
      for (const d of [
        ...separated.activeDecisions,
        ...separated.decisionHistory,
      ]) {
        expect((d as any).status).toBeDefined();
        expect(["active", "superseded", "exception"]).toContain(
          (d as any).status,
        );
      }
    });
  });

  describe("insufficient data signals [RESP-02]", () => {
    it('tool with insufficient data: "Suggestions for AI" block included [RESP-02]', () => {
      const signal = buildInsufficientDataSignal("no_ontology_matches");
      expect(signal).toBeDefined();
      expect(signal.suggestionsForAI).toBeDefined();
    });

    it("no ontology matches scenario: correct signal emitted [RESP-02]", () => {
      const signal = buildInsufficientDataSignal("no_ontology_matches");
      expect(signal.suggestionsForAI).toMatch(/knowledge|search/i);
    });

    it("sparse references scenario: correct signal emitted [RESP-02]", () => {
      const signal = buildInsufficientDataSignal("sparse_references");
      expect(signal.suggestionsForAI).toMatch(/broaden|knowledge/i);
    });

    it("no_pack_data signal: signal text appears inside content[0].text, not as top-level field [RESP-02]", async () => {
      const { formatResponse } = await import(
        "../../src/server/response-formatting"
      );
      const result = await formatResponse({ signal: "no_pack_data" });
      // MCP spec: only { content, isError? } at top level
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content[0].type).toBe("text");
      // Signal info must be encoded inside content text, not as result.signal
      expect(result.content[0].text).toMatch(/no.?pack|install|ontology/i);
      expect((result as any).signal).toBeUndefined();
    });

    it("no_type_guide signal: signal text appears inside content[0].text, not as top-level field [RESP-02]", async () => {
      const { formatResponse } = await import(
        "../../src/server/response-formatting"
      );
      const result = await formatResponse({ signal: "no_type_guide" });
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content[0].type).toBe("text");
      // Signal info must be encoded inside content text, not as result.signal
      expect(result.content[0].text).toMatch(/no.?type.?guide|type guide/i);
      expect((result as any).signal).toBeUndefined();
    });
  });

  describe("response size limiting [PERF-11]", () => {
    it("response exceeding 32KB: truncated with signal indicating items omitted [PERF-11]", () => {
      const largeData = "x".repeat(40_000);
      const result = truncateResponse(largeData, { maxSize: 32_768 });
      expect(result.truncated).toBe(true);
      expect(result.signal).toMatch(/truncated/i);
    });

    it("response under 32KB: no truncation signal [PERF-11]", () => {
      const smallData = "x".repeat(100);
      const result = truncateResponse(smallData, { maxSize: 32_768 });
      expect(result.truncated).toBe(false);
    });

    it("truncation signal: omitted-item count appears inside content[0].text, not as top-level field [PERF-11]", async () => {
      const result = await formatResponse({
        data: "x",
        simulateLargeData: true,
      });
      // MCP spec: only { content, isError? } — truncation info belongs in content text
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content[0].type).toBe("text");
      expect(result.content[0].text).toMatch(/truncated|omitted|\d+\s*items/i);
      // Must NOT expose truncated or signalCount as top-level fields
      expect((result as any).truncated).toBeUndefined();
      expect((result as any).signalCount).toBeUndefined();
    });

    it("config with custom max_response_size: custom limit applied [PERF-11]", () => {
      const result = truncateResponse("x".repeat(5_000), { maxSize: 1_000 });
      expect(result.truncated).toBe(true);
    });
  });

  describe("absolute paths [RESP-05]", () => {
    it("file path in response: always absolute in content text, never relative or ~ [RESP-05]", () => {
      const response = formatWriteConfirmation({
        filePath: "/home/user/project/BRIEF.md",
        changes: ["Updated"],
      });
      // Path must appear inside content[0].text (MCP-compliant), not as a top-level field
      expect(response.content[0].text).toContain("/home/user/project/BRIEF.md");
      expect(response.content[0].text).not.toContain("~");
      // Verify the path in the text is absolute (starts with /)
      const pathMatch = response.content[0].text.match(/\/[^\s,}'"]+/);
      expect(pathMatch).not.toBeNull();
      if (pathMatch) {
        expect(pathMatch[0].startsWith("/")).toBe(true);
      }
    });
  });
});

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe("TASK-46: Property Tests", () => {
  it("forAll(tool response type): MCP envelope always produced regardless of type string [RESP-01]", () => {
    fc.assert(
      fc.property(
        // Use real string generation — not a fixed set of 5 constants
        fc
          .string({ minLength: 1, maxLength: 20 })
          .filter((s) => /^[a-z_]+$/.test(s)),
        (type) => {
          const response = formatResponse({ type, data: {} });
          expect(response).toHaveProperty("content");
          expect(Array.isArray(response.content)).toBe(true);
          expect(response.content[0].type).toBe("text");
          expect(typeof response.content[0].text).toBe("string");
        },
      ),
    );
  });

  it("forAll(write tool): confirmation always encodes file path in MCP content text [RESP-04]", () => {
    fc.assert(
      fc.property(
        fc
          .string({ minLength: 5, maxLength: 50 })
          .filter((s) => s.startsWith("/")),
        (filePath) => {
          const response = formatWriteConfirmation({
            filePath,
            changes: ["Change"],
          });
          // MCP-compliant: path must be in content[0].text, not as top-level filePath
          expect(response.content).toBeDefined();
          expect(Array.isArray(response.content)).toBe(true);
          expect(response.content[0].type).toBe("text");
          expect(response.content[0].text).toContain(filePath);
          expect((response as any).filePath).toBeUndefined();
        },
      ),
    );
  });

  it("forAll(context block with decisions): active and historical never mixed [RESP-06]", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            text: fc.string({ minLength: 1, maxLength: 30 }),
            status: fc.constantFrom("active", "superseded", "exception"),
          }),
          { minLength: 1, maxLength: 10 },
        ),
        (decisions) => {
          const separated = separateDecisions(decisions);
          for (const d of separated.activeDecisions) {
            expect((d as any).status).toBe("active");
          }
          for (const d of separated.decisionHistory) {
            expect(["superseded", "exception"]).toContain((d as any).status);
          }
        },
      ),
    );
  });

  it("forAll(decision item): status field always present [RESP-06]", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("active", "superseded", "exception"),
        (status) => {
          const decisions = [{ text: "Test", status }];
          const separated = separateDecisions(decisions);
          const all = [
            ...separated.activeDecisions,
            ...separated.decisionHistory,
          ];
          for (const d of all) {
            expect((d as any).status).toBeDefined();
          }
        },
      ),
    );
  });

  it("forAll(file path in response): always absolute in content text, no top-level filePath [RESP-05]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .string({ minLength: 1, maxLength: 30 })
          .filter((s) => s.length > 0 && !s.includes("\0")),
        async (relPath) => {
          const result = await formatResponse({ filePath: relPath });
          // MCP-compliant envelope
          expect(Array.isArray(result.content)).toBe(true);
          expect(result.content[0].type).toBe("text");
          // Path must appear in content text and be absolute (formatResponse should resolve to absolute)
          const responseText = result.content[0].text;
          const pathMatch = responseText.match(
            /file[_\s]*path[:\s]+([^\s,}'"]+)/i,
          );
          expect(pathMatch).not.toBeNull();
          if (pathMatch) {
            expect(pathMatch[1]).toMatch(/^\//);
          }
          // No top-level filePath field
          expect((result as any).filePath).toBeUndefined();
        },
      ),
    );
  });
});
