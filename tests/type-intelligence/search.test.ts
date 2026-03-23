import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import fc from "fast-check";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { _resetState, getTypeGuide } from "../../src/type-intelligence/loading";
import { suggestTypeGuides } from "../../src/type-intelligence/search";

// Clean disk-based type-guides before tests to avoid cross-file pollution
beforeAll(() => {
  const briefHome = process.env.BRIEF_HOME ?? path.join(os.homedir(), ".brief");
  const guidesDir = path.join(briefHome, "type-guides");
  try {
    fs.rmSync(guidesDir, { recursive: true, force: true });
  } catch {}
});

afterEach(() => {
  _resetState();
});

// Helper: ensure guides are loaded by calling getTypeGuide once
async function loadGuides(): Promise<void> {
  await getTypeGuide({ type: "_generic" });
}

describe("WP2: brief_suggest_type_guides — Type Guide Search & Suggestion", () => {
  describe("exact match", () => {
    it("returns score 1.0 and matchType 'exact' for an exact type match", async () => {
      await loadGuides();
      const result = await suggestTypeGuides({ query: "album" });
      expect(result.candidates.length).toBeGreaterThanOrEqual(1);
      const exact = result.candidates[0];
      expect(exact.type).toBe("album");
      expect(exact.matchType).toBe("exact");
      expect(exact.relevanceScore).toBe(1.0);
      expect(exact.displayName).toBeDefined();
      expect(exact.summary).toBeDefined();
      expect(exact.summary.length).toBeGreaterThan(0);
    });

    it("hasExactMatch is true when an exact match is found", async () => {
      await loadGuides();
      const result = await suggestTypeGuides({ query: "film" });
      expect(result.hasExactMatch).toBe(true);
    });

    it("spaces in query normalised to hyphens for exact match", async () => {
      await loadGuides();
      const result = await suggestTypeGuides({ query: "music release" });
      expect(result.candidates.length).toBeGreaterThanOrEqual(1);
      const top = result.candidates[0];
      expect(top.type).toBe("music-release");
      expect(top.matchType).toBe("exact");
      expect(top.relevanceScore).toBe(1.0);
    });
  });

  describe("alias match", () => {
    it("returns score 0.9 and matchType 'alias' for an alias match", async () => {
      await loadGuides();
      const result = await suggestTypeGuides({ query: "novel" });
      expect(result.candidates.length).toBeGreaterThanOrEqual(1);
      const alias = result.candidates.find((c) => c.matchType === "alias");
      expect(alias).toBeDefined();
      expect(alias!.type).toBe("fiction");
      expect(alias!.relevanceScore).toBe(0.9);
    });
  });

  describe("keyword match", () => {
    it("returns a lower score and matchType 'keyword' for keyword matches", async () => {
      await loadGuides();
      const result = await suggestTypeGuides({
        query: "production phases",
      });
      const keyword = result.candidates.find((c) => c.matchType === "keyword");
      expect(keyword).toBeDefined();
      expect(keyword!.relevanceScore).toBeLessThan(1.0);
      expect(keyword!.relevanceScore).toBeGreaterThan(0);
    });

    it("uses description and earlyDecisions for keyword matching", async () => {
      await loadGuides();
      const result = await suggestTypeGuides({
        query: "creative",
        description: "film production",
        earlyDecisions: "pre-production phases",
      });
      const filmMatch = result.candidates.find((c) => c.type === "film");
      expect(filmMatch).toBeDefined();
      expect(filmMatch!.matchType).toBe("keyword");
    });
  });

  describe("_generic exclusion", () => {
    it("excludes _generic from results", async () => {
      await loadGuides();
      const result = await suggestTypeGuides({ query: "_generic" });
      const generic = result.candidates.find((c) => c.type === "_generic");
      expect(generic).toBeUndefined();
    });

    it("excludes _generic even when querying 'generic'", async () => {
      await loadGuides();
      const result = await suggestTypeGuides({ query: "generic" });
      const generic = result.candidates.find((c) => c.type === "_generic");
      expect(generic).toBeUndefined();
    });
  });

  describe("empty query", () => {
    it("returns empty candidates for an empty query", async () => {
      await loadGuides();
      const result = await suggestTypeGuides({ query: "" });
      expect(result.candidates).toEqual([]);
      expect(result.hasExactMatch).toBe(false);
    });

    it("returns empty candidates for a whitespace-only query", async () => {
      await loadGuides();
      const result = await suggestTypeGuides({ query: "   " });
      expect(result.candidates).toEqual([]);
    });
  });

  describe("maxResults", () => {
    it("caps output to maxResults", async () => {
      await loadGuides();
      const result = await suggestTypeGuides({
        query: "guide",
        maxResults: 2,
      });
      expect(result.candidates.length).toBeLessThanOrEqual(2);
    });

    it("defaults to 5 results maximum", async () => {
      await loadGuides();
      const result = await suggestTypeGuides({ query: "guide" });
      expect(result.candidates.length).toBeLessThanOrEqual(5);
    });
  });

  describe("signal text", () => {
    it('returns "An exact type guide exists." for exact matches', async () => {
      await loadGuides();
      const result = await suggestTypeGuides({ query: "album" });
      expect(result.signal).toBe("An exact type guide exists.");
    });

    it('returns "Potential matches found." for fuzzy/keyword matches only', async () => {
      await loadGuides();
      const result = await suggestTypeGuides({
        query: "production phases post",
      });
      // Should find keyword matches but no exact
      expect(result.hasExactMatch).toBe(false);
      if (result.candidates.length > 0) {
        expect(result.signal).toBe("Potential matches found.");
      }
    });

    it('returns "No matching guides found." signal for no matches', async () => {
      await loadGuides();
      const result = await suggestTypeGuides({
        query: "xyznonexistenttypeabc",
      });
      expect(result.candidates).toEqual([]);
      expect(result.signal).toBe(
        "No matching guides found. Proceed to brief_create_type_guide.",
      );
    });
  });

  describe("deduplication", () => {
    it("does not return the same guide as both exact and keyword match", async () => {
      await loadGuides();
      const result = await suggestTypeGuides({ query: "album" });
      const albumEntries = result.candidates.filter((c) => c.type === "album");
      expect(albumEntries.length).toBe(1);
    });
  });

  describe("sorting", () => {
    it("returns candidates sorted by relevanceScore descending", async () => {
      await loadGuides();
      const result = await suggestTypeGuides({ query: "album" });
      for (let i = 1; i < result.candidates.length; i++) {
        expect(result.candidates[i - 1].relevanceScore).toBeGreaterThanOrEqual(
          result.candidates[i].relevanceScore,
        );
      }
    });
  });

  // ── Property Tests ──────────────────────────────────────────────────────

  describe("Property Tests", () => {
    it("forAll(query string): suggestTypeGuides never throws and always returns valid structure", async () => {
      await loadGuides();
      await fc.assert(
        fc.asyncProperty(fc.string({ maxLength: 200 }), async (query) => {
          const result = await suggestTypeGuides({ query });
          expect(result).toBeDefined();
          expect(Array.isArray(result.candidates)).toBe(true);
          expect(typeof result.hasExactMatch).toBe("boolean");
          expect(typeof result.signal).toBe("string");
          expect(result.signal.length).toBeGreaterThan(0);
        }),
        { numRuns: 20 },
      );
    });

    it("forAll(query string): candidates are always sorted descending by relevanceScore", async () => {
      await loadGuides();
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 }),
          async (query) => {
            const result = await suggestTypeGuides({ query });
            for (let i = 1; i < result.candidates.length; i++) {
              expect(
                result.candidates[i - 1].relevanceScore,
              ).toBeGreaterThanOrEqual(result.candidates[i].relevanceScore);
            }
          },
        ),
        { numRuns: 15 },
      );
    });

    it("forAll(query string): _generic is never in results", async () => {
      await loadGuides();
      await fc.assert(
        fc.asyncProperty(fc.string({ maxLength: 100 }), async (query) => {
          const result = await suggestTypeGuides({ query });
          const genericFound = result.candidates.find(
            (c) => c.type === "_generic",
          );
          expect(genericFound).toBeUndefined();
        }),
        { numRuns: 15 },
      );
    });

    it("forAll(query string): no duplicate types in candidates", async () => {
      await loadGuides();
      await fc.assert(
        fc.asyncProperty(fc.string({ maxLength: 100 }), async (query) => {
          const result = await suggestTypeGuides({ query });
          const types = result.candidates.map((c) => c.type);
          expect(new Set(types).size).toBe(types.length);
        }),
        { numRuns: 15 },
      );
    });

    it("forAll(maxResults): candidate count never exceeds maxResults", async () => {
      await loadGuides();
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 20 }),
          async (maxResults) => {
            const result = await suggestTypeGuides({
              query: "guide",
              maxResults,
            });
            expect(result.candidates.length).toBeLessThanOrEqual(maxResults);
          },
        ),
        { numRuns: 10 },
      );
    });

    it("forAll(query string): relevanceScore is always in [0, 1]", async () => {
      await loadGuides();
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 80 }),
          async (query) => {
            const result = await suggestTypeGuides({ query });
            for (const c of result.candidates) {
              expect(c.relevanceScore).toBeGreaterThanOrEqual(0);
              expect(c.relevanceScore).toBeLessThanOrEqual(1.0);
            }
          },
        ),
        { numRuns: 15 },
      );
    });
  });
});
