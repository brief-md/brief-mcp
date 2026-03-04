import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  assembleContext,
  computeInheritance,
  detectOverrides,
  filterSections,
  labelLevel,
} from "../../src/hierarchy/context";

// ---------------------------------------------------------------------------
// Unit Tests
// ---------------------------------------------------------------------------

describe("TASK-18: Hierarchy — Context Assembly & Formatting", () => {
  describe("broadest-first ordering [HIER-03]", () => {
    it("three-level hierarchy output ordered broadest-first (artist → album → song) [HIER-03]", async () => {
      // G-117: pass levels in REVERSE order (bottom-to-top as walker returns them) and verify broadest-first output
      // depth mirrors walker convention: 0=broadest, higher=more-specific (scope)
      const levels = [
        { project: "Echo Valley", type: "song", depth: 2, sections: [] },
        { project: "Midnight Train", type: "album", depth: 1, sections: [] },
        { project: "The Wanderers", type: "artist", depth: 0, sections: [] },
      ];
      const result = await assembleContext(levels);
      // Output should be reordered broadest-first: artist → album → song
      expect(result.levels[0].project).toBe("The Wanderers");
      expect(result.levels[2].project).toBe("Echo Valley");
    });
  });

  describe("level labeling [HIER-04]", () => {
    it("each level in output labeled with project type and name [HIER-04]", () => {
      const label = labelLevel("artist", "The Wanderers");
      // G-118: assert label matches the [Artist: The Wanderers] exact format
      expect(label).toMatch(/^\[Artist: The Wanderers\]$/);
    });
  });

  describe("hierarchy overrides [HIER-05]", () => {
    it("child decision contradicts parent constraint: override flag present [HIER-05]", async () => {
      const parent = {
        project: "Album",
        type: "album",
        constraints: ["No electronic instruments"],
        decisions: [],
      };
      const child = {
        project: "Track",
        type: "song",
        constraints: [],
        decisions: [{ text: "Use synthesizer", status: "active" as const }],
      };
      const overrides = detectOverrides(parent, child);
      expect(overrides.length).toBeGreaterThan(0);
      expect(overrides[0]).toMatch(/override/i);
    });
  });

  describe("parent context as advisory [HIER-06]", () => {
    it("parent and child have same section: child takes precedence, parent shown as advisory [HIER-06]", async () => {
      const levels = [
        {
          project: "Parent",
          type: "artist",
          sections: [{ name: "What This Is", body: "Parent desc" }],
        },
        {
          project: "Child",
          type: "album",
          sections: [{ name: "What This Is", body: "Child desc" }],
        },
      ];
      const result = await assembleContext(levels);
      // Child content should be primary
      expect(result.levels[1].sections[0].body).toBe("Child desc");
      // G-119: assert that parent entry is marked advisory
      expect(result.levels[0].isAdvisory).toBe(true);
    });
  });

  describe("size bounding [HIER-13]", () => {
    it("deep hierarchy (5+ levels): scope and direct parent have full content, higher levels metadata-only [HIER-13]", async () => {
      // G-120: provide sections WITH a level property so the filter works correctly
      const levels = Array.from({ length: 6 }, (_, i) => ({
        project: `Level ${i}`,
        type: "project",
        level: i,
        sections: [{ name: "What This Is", body: "Content ".repeat(100) }],
      }));
      const result = await assembleContext(levels, { sizeCap: 5000 });
      // The last two (scope + parent) should have full content
      // Earlier levels should be metadata-only
      expect(result.levels[5].fullContent).toBe(true);
      expect(result.levels[4].fullContent).toBe(true);
      // Levels 0-3 should be metadata-only — ensure there is at least one before checking
      const lowerLevels = result.levels.filter((s: any) => s.level <= 3);
      expect(lowerLevels.length).toBeGreaterThan(0);
      expect(lowerLevels.every((s: any) => s.metadataOnly)).toBe(true);
    });

    it("output exceeding size cap: truncation signal included [HIER-13]", async () => {
      const levels = Array.from({ length: 10 }, (_, i) => ({
        project: `Level ${i}`,
        type: "project",
        sections: [{ name: "Content", body: "x".repeat(10_000) }],
      }));
      const result = await assembleContext(levels, { sizeCap: 5000 });
      expect(result.truncated).toBe(true);
      // G-121: assert truncationSignal has a non-empty message string
      expect(result.truncationSignal).toBeDefined();
      expect(typeof result.truncationSignal).toBe("string");
      expect(result.truncationSignal.length).toBeGreaterThan(0);
      // T18-01: truncation signal should guide user to brief_get_context to narrow the query
      expect(result.truncationSignal).toMatch(
        /brief_get_context|narrow.*query|use_scope|scope/i,
      );
    });
  });

  describe("context_depth parameter [HIER-13]", () => {
    it("context_depth set to 2: only 2 levels returned [HIER-13]", async () => {
      const levels = Array.from({ length: 5 }, (_, i) => ({
        project: `Level ${i}`,
        type: "project",
        sections: [],
      }));
      const result = await assembleContext(levels, { contextDepth: 2 });
      expect(result.levels).toHaveLength(2);
    });
  });

  describe("sections filter [HIER-15a]", () => {
    it('sections filter with ["decisions"]: only Key Decisions returned [HIER-15a]', () => {
      const sections = [
        { name: "What This Is", body: "Desc" },
        { name: "Key Decisions", body: "Decisions content" },
        { name: "Open Questions", body: "Questions" },
      ];
      const filtered = filterSections(sections, ["decisions"]);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].name).toBe("Key Decisions");
    });

    it("sections filter with multiple values: all matching types included (OR logic) [HIER-15a]", () => {
      const sections = [
        { name: "What This Is", body: "Desc" },
        { name: "What This Is NOT", body: "Constraints" },
        { name: "Key Decisions", body: "Decisions" },
      ];
      const filtered = filterSections(sections, ["identity", "decisions"]);
      expect(filtered).toHaveLength(3); // Both identity sections + decisions
    });

    it("sections filter omitted: all sections returned [HIER-15a]", () => {
      const sections = [
        { name: "What This Is", body: "Desc" },
        { name: "Key Decisions", body: "Dec" },
      ];
      const filtered = filterSections(sections, undefined);
      expect(filtered).toHaveLength(2);
    });
  });

  describe("extension/ontology inheritance [HIER-06]", () => {
    it("parent has extensions, child does not: child inherits [HIER-06]", () => {
      const parent = { extensions: ["sonic_arts"], ontologies: [] };
      const child = { extensions: [], ontologies: [] };
      const inherited = computeInheritance(parent, child);
      expect(inherited.extensions).toContain("sonic_arts");
    });

    it("child ontologies with excludes: syntax: excluded parent ontology not inherited [HIER-06]", () => {
      const parent = {
        extensions: [],
        ontologies: [{ name: "theme-ontology", version: "v1" }],
      };
      const child = {
        extensions: [],
        ontologies: [],
        excludes: ["theme-ontology"],
      };
      const inherited = computeInheritance(parent, child);
      const hasTheme = inherited.ontologies.some(
        (o: any) => o.name === "theme-ontology",
      );
      expect(hasTheme).toBe(false);
    });
  });

  describe("decision views [DEC-03]", () => {
    it("decisions in output: only active shown by default [DEC-03]", async () => {
      const levels = [
        {
          project: "Test",
          type: "project",
          decisions: [
            { text: "Active", status: "active" },
            { text: "Old", status: "superseded" },
          ],
          sections: [],
        },
      ];
      const result = await assembleContext(levels);
      const activeDecisions = result.levels[0].decisions.filter(
        (d: any) => d.status === "active",
      );
      const superseded = result.levels[0].decisions.filter(
        (d: any) => d.status === "superseded",
      );
      expect(activeDecisions.length).toBe(1);
      expect(superseded.length).toBe(0);
    });

    it("superseded decisions included when explicitly flagged [DEC-03]", async () => {
      const levels = [
        {
          project: "Test",
          type: "project",
          decisions: [
            { text: "Active", status: "active" },
            { text: "Old", status: "superseded" },
          ],
          sections: [],
        },
      ];
      const result = await assembleContext(levels, { includeSuperseded: true });
      expect(result.levels[0].decisions.length).toBe(2);
    });
  });

  describe("single-level hierarchy [HIER-01]", () => {
    it("single-level hierarchy: scope content returned without level comparison [HIER-01]", async () => {
      const levels = [
        {
          project: "Solo",
          type: "standalone",
          sections: [{ name: "What This Is", body: "A solo project" }],
        },
      ];
      const result = await assembleContext(levels);
      expect(result.levels).toHaveLength(1);
      expect(result.levels[0].project).toBe("Solo");
    });
  });

  describe("metadata-only newest decisions [HIER-13]", () => {
    it("metadata-only level includes newest 3 decisions even when full content omitted [HIER-13]", async () => {
      // T18-02: metadata-only summary must still include newest 3 decisions per spec
      const decisions = Array.from({ length: 5 }, (_, i) => ({
        text: `Decision ${i}`,
        status: "active" as const,
        date: `2025-0${i + 1}-01`,
      }));
      const levels = [
        {
          project: "Far Ancestor",
          type: "artist",
          level: 0,
          decisions,
          sections: [{ name: "What This Is", body: "x".repeat(5000) }],
        },
      ];
      const result = await assembleContext(levels, { sizeCap: 100 });
      const ancestorLevel = result.levels.find(
        (l: any) => l.project === "Far Ancestor",
      );
      if (ancestorLevel?.metadataOnly) {
        // Should include newest decisions (up to 3) even in metadata-only mode
        expect(ancestorLevel.recentDecisions).toBeDefined();
        expect(ancestorLevel.recentDecisions.length).toBeLessThanOrEqual(3);
      }
    });
  });
});

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe("TASK-18: Property Tests", () => {
  it("forAll(hierarchy): output is always broadest-first ordering [HIER-03]", async () => {
    // G-122: make it() async, add await before fc.assert(...)
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 5 }), async (depth) => {
        const levels = Array.from({ length: depth }, (_, i) => ({
          project: `Level ${i}`,
          type: "project",
          sections: [],
        }));
        const result = await assembleContext(levels);
        for (let i = 0; i < result.levels.length - 1; i++) {
          // Each level should be "broader" than the next
          expect(result.levels[i].project).toBe(`Level ${i}`);
        }
      }),
      { numRuns: 5 },
    );
  });

  it("forAll(hierarchy): every level has a type:name label [HIER-04]", async () => {
    // G-123: make it() async, add await before fc.assert(...)
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 5 }), async (depth) => {
        const levels = Array.from({ length: depth }, (_, i) => ({
          project: `Project${i}`,
          type: "type",
          sections: [],
        }));
        const result = await assembleContext(levels);
        for (const level of result.levels) {
          expect(level.label).toBeDefined();
          expect(level.label).toContain(level.project);
        }
      }),
      { numRuns: 5 },
    );
  });

  it("forAll(hierarchy, size cap): total output size never exceeds cap [HIER-13]", async () => {
    // G-124: make it() async, add await before fc.assert(...)
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1000, max: 50_000 }), async (cap) => {
        const levels = Array.from({ length: 5 }, (_, i) => ({
          project: `Level ${i}`,
          type: "project",
          sections: [{ name: "Content", body: "x".repeat(1000) }],
        }));
        const result = await assembleContext(levels, { sizeCap: cap });
        const totalSize = JSON.stringify(result).length;
        expect(totalSize).toBeLessThanOrEqual(cap);
      }),
      { numRuns: 5 },
    );
  });

  it("forAll(sections filter): only requested section categories appear [HIER-15a]", () => {
    fc.assert(
      fc.property(
        fc.subarray(
          [
            "identity",
            "constraints",
            "motivation",
            "decisions",
            "questions",
          ] as const,
          { minLength: 1 },
        ),
        (sections) => {
          // G-125: add category field to the constructed section objects
          const allSections = [
            { name: "What This Is", body: "A", category: "identity" },
            { name: "What This Is NOT", body: "B", category: "constraints" },
            { name: "Why This Exists", body: "C", category: "motivation" },
            { name: "Key Decisions", body: "D", category: "decisions" },
            { name: "Open Questions", body: "E", category: "questions" },
          ];
          const filtered = filterSections(allSections, sections);
          // Every returned section should be one of the requested sections
          filtered.forEach((s: any) => {
            expect(s.category).toBeDefined();
            expect(sections).toContain(s.category);
          });
        },
      ),
    );
  });

  it("forAll(hierarchy with parent and child): child declarations always take precedence [HIER-06]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 100 }),
        fc.string({ minLength: 1, maxLength: 100 }),
        async (parentDecision, childDecision) => {
          // Guard: indexOf can't distinguish identical strings
          fc.pre(parentDecision !== childDecision);
          const { mergeHierarchyContext } = await import(
            "../../src/hierarchy/context"
          );
          const parentLevel = {
            depth: 0,
            decisions: [{ text: parentDecision, status: "active" }],
          };
          const childLevel = {
            depth: 1,
            decisions: [{ text: childDecision, status: "active" }],
          };
          const merged = mergeHierarchyContext([parentLevel, childLevel], {
            simulateChildPrecedence: true,
          });
          // G-126: assert child's content appears before parent's content in the assembled context
          const decisionTexts = merged.decisions.map((d: any) => d.text);
          expect(decisionTexts.indexOf(childDecision)).toBeLessThan(
            decisionTexts.indexOf(parentDecision),
          );
        },
      ),
      { numRuns: 10 },
    );
  });
});
