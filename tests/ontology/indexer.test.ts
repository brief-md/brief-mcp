import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  buildIndex,
  expandSynonyms,
  searchIndex,
} from "../../src/ontology/indexer";

// ---------------------------------------------------------------------------
// Unit Tests
// ---------------------------------------------------------------------------

describe("TASK-32a: Ontology — Index Building", () => {
  describe("basic indexing [ONT-01]", () => {
    it("pack with entries having labels and keywords: index maps terms to correct entries [ONT-01]", () => {
      const pack = {
        name: "test-pack",
        entries: [
          {
            id: "e1",
            label: "Dark Theme",
            keywords: ["noir", "gothic"],
            description: "A dark visual theme",
          },
          {
            id: "e2",
            label: "Light Theme",
            keywords: ["bright", "minimal"],
            description: "A clean theme",
          },
        ],
      };
      const index = buildIndex(pack);
      expect(index).toBeDefined();
      // Use canonical property: entryCount
      expect(index.entryCount).toBeGreaterThan(0);
      // Search for a known term from the test entries
      const results = searchIndex(index, "Dark Theme");
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe("field scoring [ONT-02]", () => {
    it("search term matching label scores higher than same term matching description [ONT-02]", () => {
      const pack = {
        name: "test",
        entries: [
          {
            id: "e1",
            label: "Redemption",
            keywords: [],
            description: "A regular entry",
          },
          {
            id: "e2",
            label: "Other",
            keywords: [],
            description: "Redemption in description",
          },
        ],
      };
      const index = buildIndex(pack);
      const results = searchIndex(index, "Redemption");
      expect(results[0].entryId).toBe("e1"); // Label match ranks higher
    });

    it("search term matching keyword scores higher than description, lower than label [ONT-02]", () => {
      const pack = {
        name: "test",
        entries: [
          {
            id: "e1",
            label: "Entry A",
            keywords: ["redemption"],
            description: "Normal",
          },
          {
            id: "e2",
            label: "Entry B",
            keywords: [],
            description: "Redemption mentioned",
          },
        ],
      };
      const index = buildIndex(pack);
      const results = searchIndex(index, "redemption");
      expect(results[0].entryId).toBe("e1"); // Keyword match > description
    });
  });

  describe("synonym expansion [ONT-03, ONT-04]", () => {
    it("synonym pair A↔B: searching A finds entries with B [ONT-03]", () => {
      const synonyms = {
        happy: ["joyful", "cheerful"],
        joyful: ["happy", "cheerful"],
        cheerful: ["happy", "joyful"],
      };
      const expanded = expandSynonyms("happy", synonyms);
      expect(expanded).toContain("joyful");
      expect(expanded).toContain("cheerful");
      // Also verify reverse: searching 'joyful' expands to 'happy'
      const pack = {
        name: "test",
        entries: [
          {
            id: "e1",
            label: "happy",
            keywords: ["joyful", "cheerful"],
            description: "",
          },
        ],
        synonyms,
      };
      const index = buildIndex(pack);
      const results = searchIndex(index, "joyful");
      // Verify the match was found VIA synonym — the matched entry's label differs from query
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].label).not.toBe("joyful"); // matched via synonym, term differs from query
      expect(results).toContainEqual(
        expect.objectContaining({ label: "happy" }),
      );
    });

    it("pack-level synonym overrides global synonym for same term [ONT-04]", () => {
      const globalSynonyms = { theme: ["motif"] };
      const packSynonyms = { theme: ["visual-style"] };
      const expanded = expandSynonyms("theme", globalSynonyms, packSynonyms);
      expect(expanded).toContain("visual-style");
      expect(expanded).not.toContain("motif"); // global synonym should not be used when pack overrides
    });

    it("direct match vs synonym match on same entry: direct scores 1.5x higher [ONT-05]", () => {
      const pack = {
        name: "test",
        entries: [
          { id: "e1", label: "Happy", keywords: ["joyful"], description: "" },
        ],
        synonyms: { happy: ["joyful"] },
      };
      const index = buildIndex(pack);
      const directResults = searchIndex(index, "Happy");
      const synonymResults = searchIndex(index, "joyful");
      // Direct match on label should score at least 1.5x higher than synonym expansion
      expect(directResults[0].score).toBeGreaterThanOrEqual(
        synonymResults[0].score * 1.5,
      );
    });

    it("term in multiple synonym groups: expanded to union of all groups [ONT-03]", () => {
      const synonyms = {
        darkness: ["shadow", "noir"],
        noir: ["black", "dark"],
      };
      const expanded = expandSynonyms("noir", synonyms);
      expect(expanded).toContain("black");
      expect(expanded).toContain("dark");
    });

    it('bidirectional synonym expansion: searching "motif" also matches entry labeled "theme" [ONT-02, M1]', () => {
      // ONT-02: synonym relationships are bidirectional — if "theme" has synonym "motif",
      // then searching "motif" should expand to include "theme" and match the theme entry.
      const synonyms = { theme: ["motif", "visual-style"] };
      const expanded = expandSynonyms("motif", synonyms);
      // Bidirectional: searching the synonym must expand back to the canonical label
      expect(expanded).toContain("theme");
    });

    it("overlapping synonym groups deduplicated: each term appears once in expansion [ONT-14, M1]", () => {
      // ONT-14: when two synonym groups share a term, the union is taken and deduplicated.
      // "noir" appears in both groups; the expanded result must not contain it twice.
      const synonyms = {
        darkness: ["shadow", "noir"],
        night: ["dark", "noir"],
      };
      const expanded = expandSynonyms("shadow", synonyms);
      // "noir" is reachable — count its occurrences in the expansion
      const noirCount = expanded.filter((t: string) => t === "noir").length;
      expect(noirCount).toBe(1); // must appear exactly once, not duplicated
    });
  });

  describe("CJK tokenization [ONT-07]", () => {
    it("CJK text tokenized: words segmented correctly [ONT-07]", () => {
      const pack = {
        name: "jp-pack",
        entries: [
          {
            id: "e1",
            label: "暗い夜",
            keywords: [],
            description: "Dark night in Japanese",
          },
        ],
      };
      const index = buildIndex(pack);
      expect(index).toBeDefined();
      // Use canonical property: entryCount
      expect(index.entryCount).toBeGreaterThan(0);
      // Full label search
      const results = searchIndex(index, "暗い夜");
      expect(results.length).toBeGreaterThan(0);
      // Individual segmented word searches to verify segmentation works
      const segmentResults1 = searchIndex(index, "暗い");
      expect(segmentResults1.length).toBeGreaterThan(0);
      const segmentResults2 = searchIndex(index, "夜");
      expect(segmentResults2.length).toBeGreaterThan(0);
    });
  });

  describe("index rebuilding [ONT-08]", () => {
    it("index rebuilt after pack install: new entries searchable immediately [ONT-08]", () => {
      const pack1 = {
        name: "p1",
        entries: [{ id: "e1", label: "First", keywords: [], description: "" }],
      };
      const index1 = buildIndex(pack1);
      const pack2 = {
        name: "p1",
        entries: [
          { id: "e1", label: "First", keywords: [], description: "" },
          { id: "e2", label: "Second", keywords: [], description: "" },
        ],
      };
      const index2 = buildIndex(pack2);
      const results = searchIndex(index2, "Second");
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe("cross-pack merge [ONT-11]", () => {
    it("cross-pack merge: results from multiple packs combined and sorted by score [ONT-11]", async () => {
      const { mergeIndexes } = await import("../../src/ontology/indexer");
      const index1 = buildIndex({
        name: "pack-a",
        entries: [
          { id: "a1", label: "Theme A", keywords: [], description: "" },
        ],
      });
      const index2 = buildIndex({
        name: "pack-b",
        entries: [
          { id: "b1", label: "Theme B", keywords: [], description: "" },
        ],
      });
      // Build merged index and search it to verify results from both packs
      const mergedIndex = mergeIndexes([index1, index2]);
      const mergedResults = searchIndex(mergedIndex, "Theme");
      expect(mergedResults.length).toBeGreaterThanOrEqual(2);
      expect(mergedResults.some((r: any) => r.source === "pack-a")).toBe(true);
      expect(mergedResults.some((r: any) => r.source === "pack-b")).toBe(true);
    });
  });

  describe("match context [ONT-14]", () => {
    it("match context: result includes matched terms, fields, and direct/synonym flag [ONT-14]", () => {
      const index = buildIndex({
        name: "test",
        entries: [
          {
            id: "e1",
            label: "Darkness",
            keywords: ["noir"],
            description: "Dark theme",
          },
        ],
      });
      const results = searchIndex(index, "Darkness");
      expect(results[0].matchContext).toBeDefined();
      expect(results[0].matchContext.matchedTerms).toBeDefined();
      expect(results[0].matchedFields).toBeDefined();
      expect(results[0].matchType).toMatch(/direct|synonym/);
    });
  });

  describe("empty pack [ONT-01]", () => {
    it("empty pack (zero entries): empty index, no errors [ONT-01]", () => {
      const index = buildIndex({ name: "empty", entries: [] });
      expect(index).toBeDefined();
      // Verify entries count is 0 (not just defined)
      expect(index.entryCount).toBe(0);
    });
  });

  describe("search fields configuration [ONT-17]", () => {
    it("pack with search_fields config override: only configured fields indexed [ONT-17]", () => {
      const index = buildIndex({
        name: "test",
        entries: [
          {
            id: "e1",
            label: "Test",
            keywords: ["keyword"],
            description: "Description",
          },
        ],
        searchFields: ["label"],
      });
      const results = searchIndex(index, "keyword");
      // keyword should not match if only label is indexed
      expect(results).toHaveLength(0);
    });

    it("pack with no search_fields config: default fields indexed [ONT-17]", () => {
      const index = buildIndex({
        name: "test",
        entries: [
          {
            id: "e1",
            label: "Test",
            keywords: ["keyword"],
            description: "Description",
          },
        ],
      });
      const results = searchIndex(index, "keyword");
      expect(results.length).toBeGreaterThan(0);
    });
  });
});

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe("TASK-32a: Property Tests", () => {
  it("forAll(synonym group): expansion is always bidirectional [ONT-03]", () => {
    fc.assert(
      fc.property(
        fc
          .string({ minLength: 1, maxLength: 10 })
          .filter((s) => /^[a-z]+$/.test(s)),
        fc
          .string({ minLength: 1, maxLength: 10 })
          .filter((s) => /^[a-z]+$/.test(s)),
        (a, b) => {
          fc.pre(a !== b);
          const synonyms = { [a]: [b], [b]: [a] };
          const expandedA = expandSynonyms(a, synonyms);
          const expandedB = expandSynonyms(b, synonyms);
          expect(expandedA).toContain(b);
          expect(expandedB).toContain(a);
        },
      ),
    );
  });

  it("forAll(search term): label matches always score higher than description matches [ONT-02]", () => {
    fc.assert(
      fc.property(
        fc
          .string({ minLength: 2, maxLength: 15 })
          .filter((s) => /^[a-zA-Z]+$/.test(s)),
        (term) => {
          const pack = {
            name: "test",
            entries: [
              {
                id: "label-match",
                label: term,
                keywords: [],
                description: "Other",
              },
              {
                id: "desc-match",
                label: "Other",
                keywords: [],
                description: term,
              },
            ],
          };
          const index = buildIndex(pack);
          const results = searchIndex(index, term);
          expect(results.length).toBeGreaterThanOrEqual(2);
          expect(results[0].entryId).toBe("label-match");
        },
      ),
    );
  });

  it("forAll(direct match, synonym match): direct always scores >= 1.5x synonym [ONT-05]", () => {
    fc.assert(
      fc.property(
        fc
          .string({ minLength: 2, maxLength: 10 })
          .filter((s) => /^[a-z]+$/.test(s)),
        fc
          .string({ minLength: 2, maxLength: 10 })
          .filter((s) => /^[a-z]+$/.test(s)),
        (term, synonym) => {
          fc.pre(term !== synonym);
          const pack = {
            name: "test",
            entries: [
              { id: "e1", label: term, keywords: [synonym], description: "" },
            ],
            synonyms: { [term]: [synonym] },
          };
          const index = buildIndex(pack);
          const directResults = searchIndex(index, term);
          const synResults = searchIndex(index, synonym);
          expect(directResults.length).toBeGreaterThan(0);
          expect(synResults.length).toBeGreaterThan(0);
          expect(directResults[0].score).toBeGreaterThanOrEqual(
            synResults[0].score * 1.5,
          );
        },
      ),
    );
  });

  it("forAll(pack update/install): index is always rebuilt and consistent [ONT-08]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          packName: fc
            .string({ minLength: 3, maxLength: 20 })
            .filter((s) => /^[a-z][a-z0-9-]*$/.test(s)),
          entryCount: fc.integer({ min: 1, max: 50 }),
        }),
        async ({ packName, entryCount }) => {
          const { buildIndex } = await import("../../src/ontology/indexer");
          const { installPack } = await import("../../src/ontology/management");

          // Simulate a pack install that triggers rebuild
          const entries = Array.from({ length: entryCount }, (_, i) => ({
            id: `entry-${i}`,
            label: `Entry ${i}`,
            keywords: [`keyword${i}`],
          }));

          const index = await buildIndex({ pack: packName, entries });
          // After rebuild, every installed entry should be searchable
          expect(index.entryCount).toBe(entryCount);
          expect(index.packName).toBe(packName);
        },
      ),
      { numRuns: 3 },
    );
  });
});
