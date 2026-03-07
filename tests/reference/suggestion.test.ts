import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { _resetState as resetLookupState } from "../../src/reference/lookup";
import {
  getEntryReferences,
  suggestReferences,
} from "../../src/reference/suggestion";

// ---------------------------------------------------------------------------
// Unit Tests
// ---------------------------------------------------------------------------

describe("TASK-38: Reference — Suggestion & Entry References", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetLookupState();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("entry references [REF-05]", () => {
    it("get entry references with no filters: all references for that entry returned (up to default max) [REF-05]", async () => {
      const result = await getEntryReferences({
        ontology: "theme-pack",
        entryId: "nostalgia",
      });
      expect(result.references).toBeDefined();
      // G-280: add > 0 check in addition to <= 10
      expect(result.references.length).toBeGreaterThan(0);
      expect(result.references.length).toBeLessThanOrEqual(10); // default max
    });

    it("get entry references with type_filter: only matching type returned [REF-05]", async () => {
      const result = await getEntryReferences({
        ontology: "theme-pack",
        entryId: "nostalgia",
        typeFilter: "film",
      });
      for (const ref of result.references) {
        expect(ref.type).toBe("film");
      }
    });

    it("get entry references with extension_filter: only extension-relevant references returned [REF-05]", async () => {
      const expectedExtension = "sonic_arts";
      const result = await getEntryReferences({
        ontology: "theme-pack",
        entryId: "nostalgia",
        extensionFilter: expectedExtension,
      });
      expect(result.references).toBeDefined();
      expect(
        result.references.every((r: any) => r.extension === expectedExtension),
      ).toBe(true);
    });

    it("get entry references with both filters: both applied together [REF-05]", async () => {
      const extensionFilter = "sonic_arts";
      const result = await getEntryReferences({
        ontology: "theme-pack",
        entryId: "nostalgia",
        typeFilter: "song",
        extensionFilter,
      });
      for (const ref of result.references) {
        expect(ref.type).toBe("song");
      }
      expect(
        result.references.every((r: any) => r.extension === extensionFilter),
      ).toBe(true);
    });

    it("get entry references with max_results=3: at most 3 results returned [REF-05]", async () => {
      const result = await getEntryReferences({
        ontology: "theme-pack",
        entryId: "nostalgia",
        maxResults: 3,
      });
      expect(result.references.length).toBeLessThanOrEqual(3);
    });

    it("non-existent pack or entry: error returned [REF-05]", async () => {
      await expect(
        getEntryReferences({ ontology: "nonexistent", entryId: "none" }),
      ).rejects.toThrow(/not.?found/i);
    });
  });

  describe("suggestion flow [REF-06]", () => {
    it("suggest references with project context: pack results returned with tier-1 signal [REF-06]", async () => {
      const result = await suggestReferences({
        context: { section: "Direction", activeExtensions: ["sonic_arts"] },
      });
      expect(result.suggestions).toBeDefined();
      for (const r of result.suggestions) {
        expect(r.sourceTier).toBeDefined();
        // T38-02: sourceTier is a number (1, 2, or 3) — consistent with property test
        expect([1, 2, 3]).toContain(r.sourceTier);
      }
    });

    it("suggest references with existing_references: already-tagged entries excluded from results [REF-06a]", async () => {
      const result = await suggestReferences({
        context: { section: "Direction", activeExtensions: ["sonic_arts"] },
        existingReferences: [{ ontology: "theme-pack", entryId: "nostalgia" }],
      });
      // G-282: assert suggestions are non-empty before uniqueness check
      expect(result.suggestions.length).toBeGreaterThan(0);
      for (const r of result.suggestions) {
        expect(r.entry.entryId).not.toBe("nostalgia");
      }
    });

    it("suggest references without existing_references: all matches returned [REF-06a]", async () => {
      const result = await suggestReferences({
        context: { section: "Direction", activeExtensions: ["sonic_arts"] },
      });
      expect(result.suggestions).toBeDefined();
      expect(result.suggestions.length).toBeGreaterThan(0);
    });

    it("suggest references with sparse pack data: response includes tier-2/tier-3 availability signals [REF-06]", async () => {
      const result = await suggestReferences({
        context: { section: "Direction", activeExtensions: ["custom_ext"] },
      });
      // With sparse/no pack results for unknown extension, tier signals should be set
      expect(
        result.hasAiKnowledgeTier === true || result.hasWebSearchTier === true,
      ).toBe(true);
    });

    it("suggest references with no pack data: empty pack results with AI-knowledge signal [REF-06]", async () => {
      const result = await suggestReferences({
        context: { section: "Direction", activeExtensions: [] },
      });
      expect(result.suggestions.length).toBe(0);
      expect(result.hasAiKnowledgeTier).toBe(true);
    });
  });

  describe("derived context [REF-08]", () => {
    it("entry with ontology links and active extension: derived_context block included in response [REF-08]", async () => {
      const result = await suggestReferences({
        context: { section: "Direction", activeExtensions: ["sonic_arts"] },
      });
      expect(result.derivedContext).toBeDefined();
      // Per spec, derivedContext should contain extension-keyed metadata
      expect(result.derivedContext).toHaveProperty("sonic_arts");
    });

    it("entry without ontology links: no derived_context block [REF-08]", async () => {
      const result = await suggestReferences({
        context: { section: "Direction", activeExtensions: [] },
      });
      expect(result.derivedContext).toBeUndefined();
    });
  });
});

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe("TASK-38: Property Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetLookupState();
  });

  // G-285: make async and await fc.assert; G-289: expand to 5+ values
  it("forAll(suggestion result): source tier always indicated [REF-06]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(
          "sonic_arts",
          "narrative_creative",
          "lyrical_craft",
          "visual_storytelling",
          "strategic_planning",
        ),
        async (ext) => {
          const result = await suggestReferences({
            context: { section: "Direction", activeExtensions: [ext] },
          });
          for (const r of result.suggestions) {
            expect(r.sourceTier).toBeDefined();
            expect([1, 2, 3]).toContain(r.sourceTier);
          }
        },
      ),
      { numRuns: 3 },
    );
  });

  // G-286: make async and await fc.assert
  it("forAll(existing_references provided): no excluded entry appears in results [REF-06a]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom("nostalgia", "freedom", "spirit"),
        async (excludedId) => {
          const result = await suggestReferences({
            context: { section: "Direction", activeExtensions: ["sonic_arts"] },
            existingReferences: [
              { ontology: "theme-pack", entryId: excludedId },
            ],
          });
          for (const r of result.suggestions) {
            expect(r.entry.entryId).not.toBe(excludedId);
          }
        },
      ),
      { numRuns: 3 },
    );
  });

  // G-287: make async and await fc.assert
  it("forAll(type_filter): all returned references match the specified type [REF-05]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom("film", "song", "book", "album"),
        async (typeFilter) => {
          const result = await getEntryReferences({
            ontology: "theme-pack",
            entryId: "nostalgia",
            typeFilter,
          });
          for (const ref of result.references) {
            expect(ref.type).toBe(typeFilter);
          }
        },
      ),
      { numRuns: 4 },
    );
  });

  // G-288: make async and await fc.assert
  it("forAll(entry reference result): max_results limit always respected [REF-05]", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 20 }), async (maxResults) => {
        const result = await getEntryReferences({
          ontology: "theme-pack",
          entryId: "nostalgia",
          maxResults,
        });
        expect(result.references.length).toBeLessThanOrEqual(maxResults);
      }),
      { numRuns: 5 },
    );
  });

  // Negative property: non-existent pack always rejects
  it("forAll(invalid input): always rejects for non-existent pack [REF-05]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .string({ minLength: 2, maxLength: 20 })
          .filter(
            (s) =>
              /^[a-zA-Z]+$/.test(s) && s !== "theme-pack" && s !== "film-pack",
          ),
        async (ontology) => {
          await expect(
            getEntryReferences({ ontology, entryId: "nostalgia" }),
          ).rejects.toThrow(/not.?found/i);
        },
      ),
      { numRuns: 10 },
    );
  });

  // Structural invariant: result objects always have type field
  it("forAll(entry reference result): result objects always have type field [REF-05]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom("nostalgia", "freedom", "spirit"),
        async (entryId) => {
          const result = await getEntryReferences({
            ontology: "theme-pack",
            entryId,
          });
          for (const ref of result.references) {
            expect(Object.keys(ref)).toEqual(expect.arrayContaining(["type"]));
          }
        },
      ),
      { numRuns: 3 },
    );
  });
});
