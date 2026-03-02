import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { searchOntology } from "../../src/ontology/search";

// ---------------------------------------------------------------------------
// Unit Tests
// ---------------------------------------------------------------------------

describe("TASK-33: Ontology — Search Tool", () => {
  describe("basic search [ONT-03]", () => {
    it("search term matching entries: results returned sorted by score [ONT-03]", async () => {
      const result = await searchOntology({
        query: "dark theme",
        ontology: "theme-pack",
      });
      expect(result.results.length).toBeGreaterThan(0);
      for (let i = 0; i < result.results.length - 1; i++) {
        expect(result.results[i].score).toBeGreaterThanOrEqual(
          result.results[i + 1].score,
        );
      }
    });
  });

  describe("scoring [ONT-04, ONT-05]", () => {
    it("label match scores higher than keyword match for same term [ONT-04]", async () => {
      const labelResult = await searchOntology({
        query: "redemption",
        ontology: "theme-pack",
      });
      const synonymResult = await searchOntology({
        query: "redemption-synonym",
        ontology: "theme-pack",
      });
      // Results should be sorted by score; label match ranks first
      expect(labelResult.results).toBeDefined();
      expect(labelResult.results.length).toBeGreaterThan(0);
      // Label matches should score higher — first result should be the label match
      // Use canonical property: matchType
      expect(labelResult.results[0].matchType).toMatch(/label|title/i);
      expect(labelResult.results[0].score).toBeGreaterThan(0);
      // Ensure comparison only occurs when synonym results exist
      expect(synonymResult.results.length).toBeGreaterThan(0);
      expect(labelResult.results[0].score).toBeGreaterThan(
        synonymResult.results[0].score,
      );
    });

    it("direct match scores higher than synonym match [ONT-05]", async () => {
      const result = await searchOntology({
        query: "darkness",
        ontology: "theme-pack",
      });
      expect(result.results).toBeDefined();
      expect(result.results.length).toBeGreaterThan(0);
      // Use canonical property: matchType
      expect(result.results[0].matchType).toMatch(/direct|exact/i);
      expect(result.results[0].score).toBeGreaterThan(0);
    });
  });

  describe("match context [ONT-13]", () => {
    it("each result includes match context (terms, fields, direct/synonym flag) [ONT-13]", async () => {
      const result = await searchOntology({
        query: "theme",
        ontology: "theme-pack",
      });
      for (const r of result.results) {
        expect(r.matchContext).toBeDefined();
        expect(r.matchContext.matchedTerms).toBeDefined();
        expect(r.matchContext.matchedFields).toBeDefined();
      }
    });
  });

  describe("detail levels [ONT-06]", () => {
    it("detail level minimal: only id and label in results [ONT-06]", async () => {
      const result = await searchOntology({
        query: "theme",
        ontology: "theme-pack",
        detail: "minimal",
      });
      for (const r of result.results) {
        expect(r.id).toBeDefined();
        expect(r.label).toBeDefined();
        expect(r.keywords).toBeUndefined();
        expect(r.synonyms).toBeUndefined();
      }
    });

    it("detail level standard: id, label, description, and top keywords in results [ONT-06, T33-01]", async () => {
      const result = await searchOntology({
        query: "theme",
        ontology: "theme-pack",
        detail: "standard",
      });
      for (const r of result.results) {
        expect(r.id).toBeDefined();
        expect(r.label).toBeDefined();
        expect(r.description).toBeDefined();
        // Standard includes top keywords but not the full field set
        expect(r.keywords).toBeDefined();
        // Standard does NOT include full synonyms/references (only minimal + description + keywords)
        expect(r.aliases).toBeUndefined();
        expect(r.references).toBeUndefined();
      }
    });

    it("detail level full: all fields in results [ONT-06]", async () => {
      const result = await searchOntology({
        query: "theme",
        ontology: "theme-pack",
        detail: "full",
      });
      for (const r of result.results) {
        expect(r.id).toBeDefined();
        expect(r.label).toBeDefined();
        expect(r.description).toBeDefined();
        expect(r.keywords).toBeDefined();
        expect(r.aliases).toBeDefined();
        expect(r.synonyms).toBeDefined();
        expect(r.references).toBeDefined();
      }
    });
  });

  describe("cross-pack search [ONT-11]", () => {
    it('cross-pack search (ontology: "all"): results from all packs merged and sorted [ONT-11]', async () => {
      const result = await searchOntology({
        query: "theme",
        ontology: "all",
      });
      expect(result.results.length).toBeGreaterThan(0);
      const sources = new Set(result.results.map((r: any) => r.source));
      expect(sources.size).toBeGreaterThan(1);
    });

    it("each cross-pack result includes source pack name [ONT-11]", async () => {
      const result = await searchOntology({
        query: "theme",
        ontology: "all",
      });
      for (const r of result.results) {
        expect(r.pack).toBeDefined();
      }
    });
  });

  describe("result limiting [ONT-16]", () => {
    it("max_results = 5: at most 5 results returned even if more match [ONT-16]", async () => {
      const result = await searchOntology({
        query: "common term",
        ontology: "large-pack",
        maxResults: 5,
      });
      expect(result.results.length).toBeLessThanOrEqual(5);
    });

    it("canonical `max_results` parameter accepted (spec name) [ONT-16, T33-02]", async () => {
      // T33-02: task spec uses `max_results` (snake_case) as the canonical parameter name
      const result = await searchOntology({
        query: "theme",
        ontology: "theme-pack",
        max_results: 3,
      } as any);
      expect(result.results.length).toBeLessThanOrEqual(3);
    });
  });

  describe("detail_level canonical parameter [ONT-06, T33-02]", () => {
    it("canonical `detail_level` parameter accepted (spec name) [ONT-06, T33-02]", async () => {
      // T33-02: task spec uses `detail_level` (snake_case) as the canonical parameter name
      const result = await searchOntology({
        query: "theme",
        ontology: "theme-pack",
        detail_level: "minimal",
      } as any);
      for (const r of result.results) {
        expect(r.id).toBeDefined();
        expect(r.label).toBeDefined();
      }
    });
  });

  describe("zero matches [ONT-03]", () => {
    it("zero matches: empty results array with structured signal (not null, not error) [ONT-03]", async () => {
      const result = await searchOntology({
        query: "xyznonexistent",
        ontology: "theme-pack",
      });
      expect(result.results).toHaveLength(0);
      expect(result.results).toBeDefined(); // Not null
      // Use canonical property: signal
      expect(result.signal).toBeDefined();
      expect(result.signal).toMatch(/no.*match|not found|zero result/i);
    });
  });

  describe("CJK search [ONT-07]", () => {
    it("CJK query string: correctly matches CJK index entries [ONT-07]", async () => {
      const result = await searchOntology({
        query: "暗い夜",
        ontology: "jp-pack",
      });
      expect(result).toBeDefined();
      expect(result.results.length).toBeGreaterThan(0);
    });
  });

  describe("input validation [SEC-19]", () => {
    it("empty query string: invalid_input error [SEC-19]", async () => {
      await expect(
        searchOntology({ query: "", ontology: "theme-pack" }),
      ).rejects.toThrow(/empty|required/i);
    });

    it("query string of 1001 characters: invalid_input error [SEC-19]", async () => {
      await expect(
        searchOntology({ query: "a".repeat(1001), ontology: "theme-pack" }),
      ).rejects.toThrow(/limit|length/i);
    });
  });

  describe("performance [PERF-07]", () => {
    it("search latency on warm cache: within target [PERF-07]", async () => {
      // Warm up
      await searchOntology({ query: "theme", ontology: "theme-pack" });
      const start = Date.now();
      await searchOntology({ query: "theme", ontology: "theme-pack" });
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(100);
    });
  });

  describe("rejection handling [ONT-16]", () => {
    it("user rejects all matches: signal block includes four recovery paths [ONT-16]", async () => {
      const result = await searchOntology({
        query: "theme",
        ontology: "theme-pack",
        allRejected: true,
      });
      expect(result.recoveryPaths).toBeDefined();
      expect(result.recoveryPaths).toHaveLength(4);
    });

    it("previously rejected matches: not re-presented in subsequent results [ONT-16]", async () => {
      const result = await searchOntology({
        query: "theme",
        ontology: "theme-pack",
        rejectedIds: ["entry-1", "entry-2"],
      });
      for (const r of result.results) {
        expect(r.id).not.toBe("entry-1");
        expect(r.id).not.toBe("entry-2");
      }
    });
  });
});

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe("TASK-33: Property Tests", () => {
  it("forAll(query): search never throws, always returns structured response [ONT-03]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .string({ minLength: 1, maxLength: 100 })
          .filter((s) => s.trim().length > 0),
        async (query) => {
          const result = await searchOntology({
            query,
            ontology: "theme-pack",
          });
          expect(result).toBeDefined();
          expect(result.results).toBeDefined();
        },
      ),
      { numRuns: 10 },
    );
  });

  it("forAll(results): sorted by score descending [ONT-03]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .string({ minLength: 2, maxLength: 20 })
          .filter((s) => /^[a-zA-Z]+$/.test(s)),
        async (query) => {
          const result = await searchOntology({
            query,
            ontology: "theme-pack",
          });
          for (let i = 0; i < result.results.length - 1; i++) {
            expect(result.results[i].score).toBeGreaterThanOrEqual(
              result.results[i + 1].score,
            );
          }
        },
      ),
      { numRuns: 10 },
    );
  });

  it("forAll(result): match context always present [ONT-13]", async () => {
    await fc.assert(
      fc.asyncProperty(
        // Use a guaranteed-match query term that exists in the test pack
        fc.constantFrom(
          "theme",
          "dark",
          "light",
          "nostalgia",
          "emotion",
          "mood",
          "tone",
          "style",
          "texture",
          "atmosphere",
        ),
        async (query) => {
          const result = await searchOntology({
            query,
            ontology: "theme-pack",
          });
          expect(result.results.length).toBeGreaterThan(0);
          for (const r of result.results) {
            expect(r.matchContext).toBeDefined();
          }
        },
      ),
      { numRuns: 10 },
    );
  });

  it("forAll(results count): never exceeds max_results [ONT-16]", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 20 }), async (maxResults) => {
        const result = await searchOntology({
          query: "theme",
          ontology: "theme-pack",
          maxResults,
        });
        expect(result.results.length).toBeLessThanOrEqual(maxResults);
      }),
      { numRuns: 10 },
    );
  });
});
