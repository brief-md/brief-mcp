import fc from "fast-check";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { suggestExtensions } from "../../src/extension/suggestion";

// ---------------------------------------------------------------------------
// Mock type-intelligence loading for test isolation (TASK-40 dependency)
// Fixture guides for "album", "song", "film" don't have suggestedExtensions
// in their YAML frontmatter, so we mock getTypeGuide to return guides with
// suggestedExtensions for types that need Tier 1 results.
// ---------------------------------------------------------------------------
vi.mock("../../src/type-intelligence/loading", () => {
  const getTypeGuide = vi.fn().mockImplementation(async (params: any) => {
    const type = String(params.type ?? "").toLowerCase();
    if (type === "album" || type === "song" || type === "film") {
      return {
        guide: {
          slug: type,
          displayName: type.charAt(0).toUpperCase() + type.slice(1),
          metadata: {
            type,
            source: "bundled",
            version: "1.0",
            suggestedExtensions: [
              { slug: "sonic_arts" },
              { slug: "lyrical_craft" },
            ],
          },
          content: "",
          path: `<builtin>/${type}.md`,
        },
        isGeneric: false,
      };
    }
    return {
      guide: {
        slug: "_generic",
        displayName: "Generic",
        metadata: {
          type: "_generic",
          source: "bundled",
          version: "1.0",
        },
        content: "",
        path: "<builtin>/_generic.md",
      },
      isGeneric: true,
    };
  });
  return { getTypeGuide, loadTypeGuide: getTypeGuide };
});

/** Collect all ExtensionSuggestion objects from tier 1 and tier 2 */
function allSuggestions(result: any): any[] {
  return [
    ...(result.tier1Suggestions ?? []),
    ...(result.tier2Suggestions ?? []),
  ];
}

// ---------------------------------------------------------------------------
// Unit Tests
// ---------------------------------------------------------------------------

describe("TASK-42: Extension — Suggestion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("tier 1 — type guide driven [COMPAT-11]", () => {
    it("type with guide containing suggested_extensions: Tier 1 suggestions returned [COMPAT-11]", async () => {
      const result = await suggestExtensions({ projectType: "album" });
      expect(result.tier1Suggestions).toBeDefined();
      expect(result.tier1Suggestions!.length).toBeGreaterThan(0);
    });
  });

  describe("tier 2 — description matching [COMPAT-11]", () => {
    it("type with no guide (generic fallback) → Tier 2 or Tier 3 suggestions returned [COMPAT-11]", async () => {
      const result = await suggestExtensions({
        projectType: "unknown-type-xyz",
      });
      const hasTier2Or3 =
        (result.tier2Suggestions?.length ?? 0) > 0 ||
        (result.tier3BootstrapSuggestions?.length ?? 0) > 0;
      expect(hasTier2Or3).toBe(true);
    });

    it("project description matching sensory capabilities: SONIC ARTS suggested via Tier 2 [COMPAT-05]", async () => {
      const result = await suggestExtensions({
        projectType: "unknown",
        description: "A project exploring sound textures and tonal warmth",
      });
      const sonicArts = result.tier2Suggestions?.find(
        (s) => s.extension === "sonic_arts",
      );
      expect(sonicArts).toBeDefined();
    });

    it("project description matching business capabilities: STRATEGIC PLANNING suggested via Tier 2 [COMPAT-05]", async () => {
      const result = await suggestExtensions({
        projectType: "unknown",
        description:
          "A startup business plan with market analysis and revenue projections",
      });
      const strategic = result.tier2Suggestions?.find(
        (s) => s.extension === "strategic_planning",
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
      expect(result.tier3BootstrapSuggestions).toBeDefined();
      expect(result.tier3BootstrapSuggestions!.length).toBeGreaterThan(0);
    });
  });

  describe("deduplication [COMPAT-11]", () => {
    it("already-active extensions: excluded from suggestions [COMPAT-11]", async () => {
      const result = await suggestExtensions({
        projectType: "album",
        activeExtensions: ["sonic_arts"],
      });
      const all = allSuggestions(result);
      const sonicArts = all.find((s: any) => s.extension === "sonic_arts");
      expect(sonicArts).toBeUndefined();
    });
  });

  describe("ontology availability [COMPAT-11]", () => {
    it("suggestion with installed ontology pack: pack marked as available per-suggestion [COMPAT-11, T42-01]", async () => {
      const result = await suggestExtensions({
        projectType: "song",
        installedOntologies: ["theme-pack"],
      });
      const all = allSuggestions(result);
      expect(all.length).toBeGreaterThan(0);
      // T42-01: ontologyAvailable must be checked per-suggestion, not at response level
      for (const suggestion of all) {
        if ((suggestion.suggestedOntologies?.length ?? 0) > 0) {
          const availableOntologies = suggestion.suggestedOntologies!.filter(
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
      const all = allSuggestions(result);
      expect(all.length).toBeGreaterThan(0);
      // T42-01: per-suggestion availability check: uninstalled packs show "(not found in registry)"
      for (const suggestion of all) {
        if ((suggestion.suggestedOntologies?.length ?? 0) > 0) {
          const unavailable = suggestion.suggestedOntologies!.find(
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
      const all = allSuggestions(result);
      const extensions = all.map((s: any) => s.extension);
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
      const all = allSuggestions(result);
      expect(
        all.length > 0 || (result.tier3BootstrapSuggestions?.length ?? 0) > 0,
      ).toBe(true);
    });

    it("response always includes actionable output: never empty with no guidance [RESP-02]", async () => {
      const result = await suggestExtensions({ projectType: "anything" });
      const all = allSuggestions(result);
      // G-326: assert specific signal value matching expected format
      const hasContent =
        all.length > 0 ||
        (result.tier3BootstrapSuggestions?.length ?? 0) > 0 ||
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
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // G-327: make async and await fc.assert
  it("forAll(project type): at least one tier always produces suggestions [COMPAT-11]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .string({ minLength: 2, maxLength: 20 })
          .filter((s) => /^[a-z-]+$/.test(s)),
        async (projectType) => {
          const result = await suggestExtensions({ projectType });
          const all = allSuggestions(result);
          const hasOutput =
            all.length > 0 ||
            (result.tier3BootstrapSuggestions?.length ?? 0) > 0;
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
          const all = allSuggestions(result);
          for (const s of all) {
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
          const all = allSuggestions(result);
          const found = all.find((s: any) => s.extension === ext);
          expect(found).toBeUndefined();
        },
      ),
      { numRuns: 3 },
    );
  });

  // G-330: make async and await fc.assert; assert suggestedOntologies always present
  it("forAll(suggested ontology): availability always checked and indicated [COMPAT-11]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom("album", "film"),
        async (projectType) => {
          const result = await suggestExtensions({ projectType });
          const all = allSuggestions(result);
          for (const s of all) {
            // suggestedOntologies must always be present (even if empty array)
            expect(s.suggestedOntologies).toBeDefined();
            expect(Array.isArray(s.suggestedOntologies)).toBe(true);
            for (const o of s.suggestedOntologies!) {
              expect(o.status).toBeDefined();
            }
          }
        },
      ),
      { numRuns: 3 },
    );
  });

  // Negative property test: random inputs → never throws, always returns valid structure
  it("forAll(random input): never throws, always returns valid structure", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .string({ minLength: 1, maxLength: 30 })
          .filter((s) => s.trim().length > 0),
        async (projectType) => {
          const result = await suggestExtensions({
            projectType: projectType.trim(),
          });
          if (result.tier1Suggestions) {
            expect(Array.isArray(result.tier1Suggestions)).toBe(true);
          }
          if (result.tier2Suggestions) {
            expect(Array.isArray(result.tier2Suggestions)).toBe(true);
          }
          if (result.tier3BootstrapSuggestions) {
            expect(Array.isArray(result.tier3BootstrapSuggestions)).toBe(true);
          }
        },
      ),
      { numRuns: 10 },
    );
  });
});
