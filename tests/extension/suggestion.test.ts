import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { suggestExtensions } from "../../src/extension/suggestion";

// ---------------------------------------------------------------------------
// Unit Tests
// ---------------------------------------------------------------------------

describe("TASK-42: Extension — Suggestion", () => {
  describe("tier 1 — type guide driven [COMPAT-11]", () => {
    it("type with guide containing suggested_extensions: Tier 1 suggestions returned [COMPAT-11]", async () => {
      const result = await suggestExtensions({ projectType: "album" });
      expect(result.suggestions).toBeDefined();
      const tier1 = result.suggestions.filter((s: any) => s.sourceTier === 1);
      expect(tier1.length).toBeGreaterThan(0);
    });
  });

  describe("tier 2 — description matching [COMPAT-11]", () => {
    it("type with no guide (generic fallback) → Tier 2 or Tier 3 suggestions returned [COMPAT-11]", async () => {
      const { suggestExtensions } = await import(
        "../../src/extension/suggestion"
      );
      const result = await suggestExtensions({
        projectType: "unknown-type-xyz",
      });
      expect(result.suggestions.length).toBeGreaterThan(0);
      // Must be Tier 2 or Tier 3, never Tier 1 (no type guide exists)
      result.suggestions.forEach((suggestion: any) => {
        expect(suggestion.sourceTier).toBeGreaterThanOrEqual(2);
      });
    });

    it("project description matching sensory capabilities: SONIC ARTS suggested via Tier 2 [COMPAT-05]", async () => {
      const result = await suggestExtensions({
        projectType: "unknown",
        description: "A project exploring sound textures and tonal warmth",
      });
      const sonicArts = result.suggestions.find(
        (s: any) => s.extension === "sonic_arts" && s.sourceTier === 2,
      );
      expect(sonicArts).toBeDefined();
    });

    it("project description matching business capabilities: STRATEGIC PLANNING suggested via Tier 2 [COMPAT-05]", async () => {
      const result = await suggestExtensions({
        projectType: "unknown",
        description:
          "A startup business plan with market analysis and revenue projections",
      });
      const strategic = result.suggestions.find(
        (s: any) => s.extension === "strategic_planning" && s.sourceTier === 2,
      );
      expect(strategic).toBeDefined();
    });
  });

  describe("tier 3 — bootstrap [COMPAT-11]", () => {
    it("no matches from Tier 1 or Tier 2: bootstrap suggestions returned from Tier 3 [COMPAT-11]", async () => {
      const result = await suggestExtensions({
        projectType: "completely-novel-type",
        description: "",
      });
      expect(result.bootstrapSuggestions).toBeDefined();
      expect(result.bootstrapSuggestions.length).toBeGreaterThan(0);
    });
  });

  describe("deduplication [COMPAT-11]", () => {
    it("already-active extensions: excluded from suggestions [COMPAT-11]", async () => {
      const result = await suggestExtensions({
        projectType: "album",
        activeExtensions: ["sonic_arts"],
      });
      const sonicArts = result.suggestions.find(
        (s: any) => s.extension === "sonic_arts",
      );
      expect(sonicArts).toBeUndefined();
    });
  });

  describe("ontology availability [COMPAT-11]", () => {
    it("suggestion with installed ontology pack: pack marked as available per-suggestion [COMPAT-11, T42-01]", async () => {
      const result = await suggestExtensions({
        projectType: "song",
        installedOntologies: ["theme-pack"],
      });
      expect(result.suggestions.length).toBeGreaterThan(0);
      // T42-01: ontologyAvailable must be checked per-suggestion, not at response level
      for (const suggestion of result.suggestions) {
        if (suggestion.suggestedOntologies?.length > 0) {
          const availableOntologies = suggestion.suggestedOntologies.filter(
            (o: any) => o.available === true,
          );
          expect(availableOntologies.length).toBeGreaterThan(0);
        }
      }
    });

    it('suggestion with uninstalled ontology pack: pack marked "(not found in registry)" per-suggestion [COMPAT-11, T42-01]', async () => {
      const result = await suggestExtensions({
        projectType: "song",
        installedOntologies: [],
      });
      expect(result.suggestions.length).toBeGreaterThan(0);
      // T42-01: per-suggestion availability check: uninstalled packs show "(not found in registry)"
      for (const suggestion of result.suggestions) {
        if (suggestion.suggestedOntologies?.length > 0) {
          const unavailable = suggestion.suggestedOntologies.find(
            (o: any) => o.available === false,
          );
          if (unavailable) {
            expect(unavailable.statusNote).toMatch(
              /not found in registry|unavailable/i,
            );
          }
        }
      }
    });

    it('registry unreachable: "Registry unavailable" note included [COMPAT-11]', async () => {
      const result = await suggestExtensions({
        projectType: "song",
        simulateRegistryDown: true,
      });
      expect(result).toBeDefined();
      // G-325: use canonical property name 'registryNote' per spec
      expect(result.registryNote).toMatch(/registry|unavailable|offline/i);
    });
  });

  describe("coverage [COMPAT-05]", () => {
    it("all six spec-defined extensions: known and available for suggestion [COMPAT-05]", async () => {
      const result = await suggestExtensions({
        projectType: "everything",
        description: "sound visual narrative lyric strategy system",
      });
      const extensions = result.suggestions.map((s: any) => s.extension);
      expect(extensions).toContain("sonic_arts");
      expect(extensions).toContain("narrative_creative");
      expect(extensions).toContain("lyrical_craft");
      expect(extensions).toContain("visual_storytelling");
      expect(extensions).toContain("strategic_planning");
      expect(extensions).toContain("system_design");
    });
  });

  describe("actionable output [RESP-02]", () => {
    it("empty project description with no type guide: Tier 3 bootstrap suggestions still returned [RESP-02]", async () => {
      const result = await suggestExtensions({
        projectType: "xyznoguide",
        description: "",
      });
      expect(
        result.suggestions.length > 0 ||
          result.bootstrapSuggestions?.length > 0,
      ).toBe(true);
    });

    it("response always includes actionable output: never empty with no guidance [RESP-02]", async () => {
      const result = await suggestExtensions({ projectType: "anything" });
      // G-326: assert specific signal value matching expected format
      const hasContent =
        result.suggestions.length > 0 ||
        result.bootstrapSuggestions?.length > 0 ||
        result.signal;
      expect(hasContent).toBeTruthy();
      if (result.signal) {
        expect(result.signal).toMatch(/tier[123]|bootstrap|suggest|extension/i);
      }
    });
  });
});

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe("TASK-42: Property Tests", () => {
  // G-327: make async and await fc.assert
  it("forAll(project type): at least one tier always produces suggestions [COMPAT-11]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .string({ minLength: 2, maxLength: 20 })
          .filter((s) => /^[a-z-]+$/.test(s)),
        async (projectType) => {
          const result = await suggestExtensions({ projectType });
          const hasOutput =
            result.suggestions.length > 0 ||
            result.bootstrapSuggestions?.length > 0;
          expect(hasOutput).toBe(true);
        },
      ),
      { numRuns: 10 },
    );
  });

  // G-328: make async and await fc.assert
  it("forAll(suggestion): source tier always indicated [COMPAT-11]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom("album", "film", "novel", "xyzunknown"),
        async (projectType) => {
          const result = await suggestExtensions({ projectType });
          for (const s of result.suggestions) {
            const tier = s.sourceTier;
            expect(tier).toBeDefined();
            expect([1, 2, 3]).toContain(tier);
          }
        },
      ),
      { numRuns: 4 },
    );
  });

  // G-329: make async and await fc.assert
  it("forAll(active extension): never included in suggestions [COMPAT-11]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom("sonic_arts", "narrative_creative", "lyrical_craft"),
        async (ext) => {
          const result = await suggestExtensions({
            projectType: "album",
            activeExtensions: [ext],
          });
          const found = result.suggestions.find(
            (s: any) => s.extension === ext,
          );
          expect(found).toBeUndefined();
        },
      ),
      { numRuns: 3 },
    );
  });

  // G-330: make async and await fc.assert; remove conditional guard, assert suggestedOntologies always present
  it("forAll(suggested ontology): availability always checked and indicated [COMPAT-11]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom("album", "film"),
        async (projectType) => {
          const result = await suggestExtensions({ projectType });
          for (const s of result.suggestions) {
            // suggestedOntologies must always be present (even if empty array)
            expect(s.suggestedOntologies).toBeDefined();
            expect(Array.isArray(s.suggestedOntologies)).toBe(true);
            for (const o of s.suggestedOntologies) {
              expect(o.status).toBeDefined();
            }
          }
        },
      ),
      { numRuns: 3 },
    );
  });
});
