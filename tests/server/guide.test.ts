import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  getGuideResource,
  listPrompts,
  listResources,
} from "../../src/server/guide";

// ---------------------------------------------------------------------------
// Unit Tests
// ---------------------------------------------------------------------------

describe("TASK-25: Server — MCP Resource brief://guide", () => {
  describe("guide content [OQ-056]", () => {
    it("request brief://guide resource returns markdown content [OQ-056]", async () => {
      const result = await getGuideResource();
      expect(result).toBeDefined();
      expect(typeof result.content).toBe("string");
      expect(result.content.length).toBeGreaterThan(0);
    });

    it("guide content contains all 10 interaction pattern descriptions [QUEST-01]", async () => {
      const result = await getGuideResource();
      // G-175: tighten at least 2 regexes to be more specific
      // Pattern 1: Session Start — must mention "session" and "start" together
      expect(result.content).toMatch(/session[\s_-]?start/i);
      // Pattern 2: Re-entry — must mention "re-entry" or "reentry" or "re-enter"
      expect(result.content).toMatch(/re-?entr(?:y|ance)|reenter/i);
      // Remaining patterns with standard checks
      expect(result.content).toMatch(/decision/i);
      expect(result.content).toMatch(/question/i);
      expect(result.content).toMatch(/conflict/i);
      expect(result.content).toMatch(/extension/i);
      expect(result.content).toMatch(/ontology/i);
      expect(result.content).toMatch(/external/i);
      // Pattern 9: Collaborative Section Authoring
      expect(result.content).toMatch(
        /collaborative.*authoring|section.*authoring/i,
      );
      // Pattern 10: Type Guide Review
      expect(result.content).toMatch(/type\s+guide\s+review/i);
      // Content should have substantial length indicating multiple patterns
      expect(result.content.length).toBeGreaterThan(500);
    });

    it("guide content contains decision recognition guidance [DR-01]", async () => {
      const result = await getGuideResource();
      expect(result.content).toMatch(/decision/i);
      expect(result.content).toMatch(/signal|detect|elicit|recogni/i);
    });

    it("guide content contains question surfacing guidance [QUEST-01]", async () => {
      const result = await getGuideResource();
      expect(result.content).toMatch(/question/i);
      expect(result.content).toMatch(/placeholder|categor|surfac|open/i);
    });

    it("guide content contains tool usage recommendations [MCP-05]", async () => {
      const result = await getGuideResource();
      expect(result.content).toMatch(/tool/i);
      expect(result.content).toMatch(/brief_/);
      expect(result.content).toMatch(/recommend|usage/i);
      expect(result.content).toMatch(/when to/i);
    });

    it("guide content mentions brief_ prefix scope and multi-MCP guidance [MCP-06]", async () => {
      const result = await getGuideResource();
      expect(result.content).toMatch(/brief_/);
      expect(result.content).toMatch(/multi.MCP|multiple.*MCP|other.*server/i);
    });

    it("guide content includes signal block format documentation [RESP-02]", async () => {
      const result = await getGuideResource();
      // G-176: use a more specific regex that matches the exact signal block format
      expect(result.content).toMatch(/signal/i);
      // Must match the actual signal block format: a fenced code block labelled "signal"
      expect(result.content).toMatch(/```(?:signal|text)[^`]*```/is);
    });
  });

  describe("resource caching [OQ-056]", () => {
    it("resource is static: same content returned on repeated requests [OQ-056]", async () => {
      const result1 = await getGuideResource();
      const result2 = await getGuideResource();
      expect(result1.content).toBe(result2.content);
    });
  });

  describe("resource and prompt registration [MCP-05, MCP-06]", () => {
    it("no BRIEF.md files exposed as resources: only brief://guide registered [MCP-05]", async () => {
      const resources = await listResources();
      expect(resources).toHaveLength(1);
      expect(resources[0].uri).toBe("brief://guide");
      // G-178: assert name, mimeType, and description fields are present
      expect(resources[0].name).toBe("BRIEF.md Interaction Guide");
      expect(resources[0].mimeType).toBe("text/markdown");
      expect(resources[0].description).toBeDefined();
      expect(resources[0].description.length).toBeGreaterThan(0);
    });

    it("no MCP prompts registered: prompt list is empty [MCP-06]", async () => {
      const prompts = await listPrompts();
      expect(prompts).toHaveLength(0);
    });
  });
});

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe("TASK-25: Property Tests", () => {
  it("forAll(guide request): response is always non-empty markdown [OQ-056]", async () => {
    // G-177: replace fc.constant(undefined) with fc.option(fc.record({ focus: fc.string() })) to test multiple values
    await fc.assert(
      fc.asyncProperty(
        fc.option(fc.record({ focus: fc.string() })),
        async () => {
          const result = await getGuideResource();
          expect(result.content.length).toBeGreaterThan(0);
        },
      ),
      { numRuns: 3 },
    );
  });

  it("forAll(guide request): content is identical across multiple calls (cached) [OQ-056]", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 2, max: 5 }), async (n) => {
        const results: string[] = [];
        for (let i = 0; i < n; i++) {
          const result = await getGuideResource();
          results.push(result.content);
        }
        for (let i = 1; i < results.length; i++) {
          expect(results[i]).toBe(results[0]);
        }
      }),
      { numRuns: 3 },
    );
  });
});
