import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { buildReverseIndex, lookupReference } from "../../src/reference/lookup";

// ---------------------------------------------------------------------------
// Unit Tests
// ---------------------------------------------------------------------------

describe("TASK-37: Reference — Reverse Reference Index & Lookup", () => {
  describe("basic lookup [REF-01, REF-03]", () => {
    it("lookup by creator name: all references by that creator returned across all packs [REF-03]", async () => {
      const result = await lookupReference({ creator: "Bon Iver" });
      expect(result.results).toBeDefined();
      expect(result.results.length).toBeGreaterThan(0);
      // G-267: verify results contain an entry matching the query
      expect(
        result.results.some(
          (r: any) =>
            r.label?.toLowerCase().includes("bon iver") ||
            r.name?.toLowerCase().includes("bon iver") ||
            r.creator?.toLowerCase().includes("bon iver"),
        ),
      ).toBe(true);
    });

    it("lookup by title: matching references returned across all packs [REF-03]", async () => {
      const result = await lookupReference({ title: "Into the Wild" });
      expect(result.results).toBeDefined();
      expect(result.results.length).toBeGreaterThan(0);
      // G-268: verify results contain an entry matching the queried title
      expect(
        result.results.some(
          (r: any) =>
            r.label?.toLowerCase().includes("into the wild") ||
            r.title?.toLowerCase().includes("into the wild"),
        ),
      ).toBe(true);
    });
  });

  describe("fuzzy matching [REF-02]", () => {
    it('case-insensitive lookup ("bon iver" vs "Bon Iver"): same results [REF-02]', async () => {
      const lower = await lookupReference({ creator: "bon iver" });
      const upper = await lookupReference({ creator: "Bon Iver" });
      // G-269: assert results are non-empty (not two vacuous zero-result calls)
      expect(lower.results.length).toBeGreaterThan(0);
      expect(upper.results.length).toBeGreaterThan(0);
      expect(lower.results.length).toBe(upper.results.length);
    });

    it('partial creator match ("Bon" for "Bon Iver"): match found [REF-02]', async () => {
      const result = await lookupReference({ creator: "Bon" });
      // G-270: assert results non-empty and contain expected term
      expect(result.results.length).toBeGreaterThan(0);
      expect(
        result.results.some(
          (r: any) =>
            r.creator?.toLowerCase().includes("bon") ||
            r.label?.toLowerCase().includes("bon"),
        ),
      ).toBe(true);
    });

    it('Unicode accent lookup ("Amelie" for "Amélie"): match found [REF-12]', async () => {
      const result = await lookupReference({ title: "Amelie" });
      // G-271: assert at least one result matches
      expect(result.results.length).toBeGreaterThan(0);
      expect(
        result.results.some(
          (r: any) =>
            r.title?.toLowerCase().includes("amelie") ||
            r.title?.toLowerCase().includes("amélie") ||
            r.label?.toLowerCase().includes("amelie") ||
            r.label?.toLowerCase().includes("amélie"),
        ),
      ).toBe(true);
    });

    it("non-Latin script lookup: exact matching applied [REF-12]", async () => {
      const result = await lookupReference({ title: "千と千尋の神隠し" });
      expect(result).toBeDefined();
      expect(result.results.length).toBeGreaterThan(0);
      expect(result.results[0].label).toContain("千と千尋の神隠し");
    });
  });

  describe("ambiguous results [REF-09]", () => {
    it("ambiguous title matching multiple types: results grouped by type [REF-09]", async () => {
      const result = await lookupReference({ title: "Into the Wild" });
      expect(result.results.length).toBeGreaterThan(1);
      // G-272: assert groupedByType is an object with at least one key
      expect(result.groupedByType).toBeDefined();
      expect(typeof result.groupedByType).toBe("object");
      expect(
        Object.keys(result.groupedByType as Record<string, unknown>).length,
      ).toBeGreaterThan(0);
    });

    it("ambiguous title with creator filter: results filtered by creator first, then grouped [REF-09]", async () => {
      const result = await lookupReference({
        title: "Into the Wild",
        creator: "Jon Krakauer",
      });
      for (const r of result.results) {
        expect(r.creator).toMatch(/krakauer/i);
      }
      // G-273: assert the filter type key exists in groupedByType
      expect(result.groupedByType).toBeDefined();
      const groupedByType = result.groupedByType as Record<string, unknown[]>;
      const hasAtLeastOneGroup = Object.keys(groupedByType).length > 0;
      expect(hasAtLeastOneGroup).toBe(true);
    });
  });

  describe("type_filter parameter [REF-01, T37-01]", () => {
    it('lookup with type_filter "film": only film references returned [REF-01, T37-01]', async () => {
      const result = await lookupReference({
        title: "Into the Wild",
        type_filter: "film",
      });
      expect(result.results).toBeDefined();
      for (const r of result.results) {
        expect(r.type).toBe("film");
      }
    });

    it('lookup with type_filter "book": only book references returned [REF-01, T37-01]', async () => {
      const result = await lookupReference({
        creator: "Jon Krakauer",
        type_filter: "book",
      });
      for (const r of result.results) {
        expect(r.type).toBe("book");
      }
    });
  });

  describe("reverse index by creator+title keys [REF-01, T37-02]", () => {
    it("buildReverseIndex: index keys are creator+title pairs, not entry IDs [REF-01, T37-02]", () => {
      const pack = {
        name: "test-pack",
        entries: [
          {
            id: "e1",
            label: "Nostalgia",
            references: [{ creator: "Joni Mitchell", title: "Blue" }],
            categories: ["emotion"],
            tags: ["music"],
          },
        ],
      };
      const index = buildReverseIndex([pack]);
      expect(index).toBeDefined();
      // The reverse index should be keyed by creator+title, not entry ID
      // This allows looking up "which entries reference this work?"
      const refKey = "Joni Mitchell:Blue";
      expect(index.byReference).toBeDefined();
      expect(index.byReference[refKey]).toBeDefined();
      expect(index.byReference[refKey]).toContain("e1");
    });
  });

  describe("cross-pack search [REF-03]", () => {
    it("two packs having matching references: results from both packs returned [REF-03]", async () => {
      const result = await lookupReference({ title: "Common Title" });
      const packs = new Set(result.results.map((r: any) => r.pack));
      expect(packs.size).toBeGreaterThanOrEqual(2);
    });
  });

  describe("empty results [REF-07]", () => {
    it("no matches found: empty results with AI-knowledge-primary signal [REF-07]", async () => {
      const result = await lookupReference({ title: "xyznonexistent12345" });
      expect(result.results).toHaveLength(0);
      expect(result.aiKnowledgePrimary).toBe(true);
    });
  });

  describe("index building [REF-01]", () => {
    it("index built from pack with multiple entries: all references indexed with category and tag context [REF-01]", () => {
      const pack = {
        name: "test-pack",
        entries: [
          {
            id: "e1",
            label: "Nostalgia",
            references: [{ creator: "Author A", title: "Work 1" }],
            categories: ["emotion"],
            tags: ["theme"],
          },
          {
            id: "e2",
            label: "Joy",
            references: [{ creator: "Author B", title: "Work 2" }],
            categories: ["emotion"],
            tags: ["mood"],
          },
        ],
      };
      const index = buildReverseIndex([pack]);
      expect(index).toBeDefined();
      expect(index.entryCount).toBeGreaterThan(0);
      expect(index.categories).toBeDefined();
      expect(index.tags).toBeDefined();
      // G-274: assert specific references are indexed by known IDs
      expect(index.index.entries.e1).toBeDefined();
      expect(index.index.entries.e2).toBeDefined();
    });

    it("pack install triggers index rebuild: new references discoverable [REF-01]", async () => {
      const result = await lookupReference({
        creator: "Newly Installed Artist",
      });
      expect(result).toBeDefined();
      // G-275: assert both flags explicitly
      expect(result.indexRebuilt).toBe(true);
      expect(result.discoverabilityUpdated).toBe(true);
    });

    it("pack removal triggers index rebuild: removed references no longer returned [REF-01]", async () => {
      const result = await lookupReference({ creator: "Removed Artist" });
      expect(result.results).toHaveLength(0);
      // G-276: assert removal flag explicitly
      expect(result.removed).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe("TASK-37: Property Tests", () => {
  it("forAll(installed pack): every reference in pack appears in index [REF-01]", () => {
    fc.assert(
      fc.property(
        fc
          .string({ minLength: 2, maxLength: 15 })
          .filter((s) => /^[a-zA-Z]+$/.test(s)),
        fc
          .string({ minLength: 2, maxLength: 20 })
          .filter((s) => /^[a-zA-Z ]+$/.test(s)),
        (creator, title) => {
          const packEntries = [
            {
              id: "e1",
              label: "Test",
              references: [{ creator, title }],
              categories: [],
              tags: [],
            },
          ];
          const pack = {
            name: "prop-pack",
            entries: packEntries,
          };
          const result = buildReverseIndex([pack]);
          expect(result).toBeDefined();
          for (const entry of packEntries) {
            expect(result.index.entries[entry.id]).toBeDefined();
          }
        },
      ),
    );
  });

  // G-277: make async and await fc.assert
  it("forAll(lookup query): results always grouped by pack [REF-03]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .string({ minLength: 2, maxLength: 15 })
          .filter((s) => /^[a-zA-Z]+$/.test(s)),
        async (creator) => {
          const result = await lookupReference({ creator });
          for (const r of result.results) {
            expect(r.pack).toBeDefined();
          }
        },
      ),
      { numRuns: 5 },
    );
  });

  // G-278: make async/await + use groupedByType consistently as a Record
  it("forAll(ambiguous result): results always grouped by type [REF-09]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .string({ minLength: 3, maxLength: 20 })
          .filter((s) => /^[a-zA-Z ]+$/.test(s)),
        async (title) => {
          const result = await lookupReference({ title });
          expect(result.results.length).toBeGreaterThan(1);
          const groupedByType = result.groupedByType as Record<
            string,
            unknown[]
          >;
          expect(typeof groupedByType).toBe("object");
          for (const group of Object.values(groupedByType)) {
            expect(Array.isArray(group)).toBe(true);
          }
        },
      ),
      { numRuns: 5 },
    );
  });

  // G-279: assert individual result entries have tag/category fields
  it("forAll(index entry): category and tag context always included [REF-01]", () => {
    fc.assert(
      fc.property(
        fc
          .string({ minLength: 2, maxLength: 10 })
          .filter((s) => /^[a-z]+$/.test(s)),
        (category) => {
          const pack = {
            name: "ctx-pack",
            entries: [
              {
                id: "e1",
                label: "Test",
                references: [{ creator: "A", title: "T" }],
                categories: [category],
                tags: ["tag1"],
              },
            ],
          };
          const index = buildReverseIndex([pack]);
          expect(index).toBeDefined();
          const entries = Object.values(index.entries);
          expect(entries.length).toBeGreaterThan(0);
          const entry = entries[0] as any;
          // Assert individual result entries have tag/category fields
          expect(entry.categories).toBeDefined();
          expect(Array.isArray(entry.categories)).toBe(true);
          expect(entry.tags).toBeDefined();
          expect(Array.isArray(entry.tags)).toBe(true);
          expect(index.tags).toBeDefined();
        },
      ),
    );
  });
});
