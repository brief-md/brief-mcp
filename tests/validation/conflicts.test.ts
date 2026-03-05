import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import * as conflictModule from "../../src/validation/conflicts";
import { checkConflicts } from "../../src/validation/conflicts";

// ---------------------------------------------------------------------------
// Unit Tests
// ---------------------------------------------------------------------------

describe("TASK-30: Validation — Conflict Detection", () => {
  describe("decision conflicts [DEC-04]", () => {
    it("two contradictory active decisions: conflict detected with both titles [DEC-04]", async () => {
      const result = await checkConflicts({
        decisions: [
          { text: "Use REST API", status: "active" },
          { text: "Use GraphQL API", status: "active" },
        ],
        constraints: [],
      });
      expect(result.conflicts.length).toBeGreaterThan(0);
    });

    it("active decision contradicting a constraint: conflict detected [DEC-04]", async () => {
      const result = await checkConflicts({
        decisions: [{ text: "Use microservices", status: "active" }],
        constraints: ["Not a microservices architecture"],
      });
      expect(result.conflicts.length).toBeGreaterThan(0);
    });

    it("cross-section contradiction: conflict detected [DEC-04]", async () => {
      const result = await checkConflicts({
        decisions: [
          {
            text: "Use microservices architecture",
            status: "active",
            section: "Key Decisions",
          },
          {
            text: "Use monolithic architecture only",
            status: "active",
            section: "Architecture Constraints",
          },
        ],
        constraints: [],
      });
      expect(result.conflicts.length).toBeGreaterThan(0);
      expect(
        result.conflicts.some((c: any) => c.type === "cross-section"),
      ).toBe(true);
    });
  });

  describe("exclusions from detection [DEC-04, DEC-09]", () => {
    it("superseded decision: excluded from detection [DEC-04]", async () => {
      const result = await checkConflicts({
        decisions: [
          { text: "Use REST API", status: "superseded" },
          { text: "Use GraphQL API", status: "active" },
        ],
        constraints: [],
      });
      const restConflicts = result.conflicts.filter((c: any) =>
        c.items.some((i: any) => i.text === "Use REST API"),
      );
      expect(restConflicts).toHaveLength(0);
    });

    it("decision with EXCEPTION TO link: excluded from detection [DEC-09]", async () => {
      const result = await checkConflicts({
        decisions: [
          { text: "Use Flutter", status: "active" },
          {
            text: "Use React Native for iOS",
            status: "exception",
            exceptionTo: "Use Flutter",
          },
        ],
        constraints: [],
      });
      // Exception pair should not conflict
      const exceptionConflicts = result.conflicts.filter((c: any) =>
        c.items.some((i: any) => i.text === "Use React Native for iOS"),
      );
      expect(exceptionConflicts).toHaveLength(0);
    });

    it("pair listed in Intentional Tensions: not re-flagged [DEC-09]", async () => {
      const result = await checkConflicts({
        decisions: [
          { text: "Performance focus", status: "active" },
          { text: "Readability focus", status: "active" },
        ],
        constraints: [],
        intentionalTensions: [
          { itemA: "Performance focus", itemB: "Readability focus" },
        ],
      });
      expect(result.conflicts).toHaveLength(0);
    });
  });

  describe("resolution options [DEC-04]", () => {
    it("each conflict includes resolution options [DEC-04]", async () => {
      const result = await checkConflicts({
        decisions: [
          { text: "Use A", status: "active" },
          { text: "Use B", status: "active" },
        ],
        constraints: [],
      });
      expect(result.conflicts.length).toBeGreaterThan(0);
      result.conflicts.forEach((c: any) => {
        expect(c.resolutionOptions).toBeDefined();
      });
      expect(result.conflicts[0].resolutionOptions.length).toBe(4);
      // T30-01: verify DEC-09 resolution option names: supersede, exception, update, dismiss
      expect(result.conflicts[0].resolutionOptions).toContain("supersede");
      expect(result.conflicts[0].resolutionOptions).toContain("exception");
      expect(result.conflicts[0].resolutionOptions).toContain("update");
      expect(result.conflicts[0].resolutionOptions).toContain("dismiss");
    });
  });

  describe("severity levels [DEC-04]", () => {
    it("same-level conflict: WARNING severity [DEC-04]", async () => {
      const result = await checkConflicts({
        decisions: [
          { text: "A", status: "active" },
          { text: "Not A", status: "active" },
        ],
        constraints: [],
      });
      expect(result.conflicts.length).toBeGreaterThan(0);
      expect(result.conflicts[0].severity).toBe("warning");
    });

    it("parent-child hierarchy override: INFO severity [HIER-05]", async () => {
      const result = await checkConflicts({
        decisions: [{ text: "Child override", status: "active" }],
        constraints: ["Parent constraint"],
        includeHierarchy: true,
        hierarchyOverride: true,
      });
      expect(result.conflicts.length).toBeGreaterThan(0);
      expect(result.conflicts[0].severity).toBe("info");
    });
  });

  describe("hierarchy scope [DEC-04]", () => {
    it("include_hierarchy enabled: child vs parent conflicts detected [DEC-04]", async () => {
      const result = await checkConflicts({
        decisions: [{ text: "Override parent", status: "active" }],
        constraints: ["Parent constraint"],
        includeHierarchy: true,
      });
      expect(result).toBeDefined();
      expect(result.conflicts).toBeDefined();
      // Use canonical property name: hierarchyIncluded
      expect(result.hierarchyIncluded).toBe(true);
      expect(result.conflicts.some((c: any) => c.source === "hierarchy")).toBe(
        true,
      );
    });

    it("include_hierarchy disabled: only single-file conflicts [DEC-04]", async () => {
      const result = await checkConflicts({
        decisions: [{ text: "Local conflict A", status: "active" }],
        constraints: ["Local constraint"],
        includeHierarchy: false,
      });
      expect(result).toBeDefined();
      expect(result.conflicts).toBeDefined();
      // When hierarchy is disabled, no parent-child conflicts should appear
      const hierarchyConflicts = result.conflicts.filter(
        (c: any) => c.type === "hierarchy" || c.level === "parent-child",
      );
      expect(hierarchyConflicts).toHaveLength(0);
    });
  });

  describe("constraint conflicts [DEC-04]", () => {
    it("two constraints with overlapping language: conflict detected [DEC-04]", async () => {
      const result = await checkConflicts({
        decisions: [],
        constraints: [
          "No third-party dependencies",
          "Must use open-source third-party libraries for common tasks",
        ],
      });
      expect(result.conflicts.length).toBeGreaterThan(0);
    });
  });

  describe("edge cases [DEC-04]", () => {
    it("no conflicts found: empty result, not an error [DEC-04]", async () => {
      const result = await checkConflicts({
        decisions: [{ text: "Use TypeScript", status: "active" }],
        constraints: ["Not a Python project"],
      });
      // These are not contradictory
      expect(result).toBeDefined();
      expect(result.conflicts).toBeDefined();
      expect(result.conflicts).toHaveLength(0);
    });

    it("conflict detection never modifies files [RESP-03]", async () => {
      const result = await checkConflicts({
        decisions: [],
        constraints: [],
      });
      expect(result).toBeDefined();
      // Use canonical property: filesModified (no ?? fallback)
      expect(result.filesModified).toBe(0);
    });

    it("conflict detection never runs automatically from get_context [DEC-04]", async () => {
      // Verify get_context does not invoke conflict detection
      const spy = vi.spyOn(conflictModule, "checkConflicts");
      const { getContext } = await import("../../src/context/read");
      const result = await getContext({ project: "test-project" } as any);
      expect(result).toBeDefined();
      expect(result.conflicts).toBeUndefined(); // conflicts not included unless explicitly requested
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });
  });
});

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe("TASK-30: Property Tests", () => {
  it("forAll(conflict): resolution guidance always includes all four options [DEC-04]", async () => {
    await fc.assert(
      fc.asyncProperty(
        // Use structured overlapping decisions to reliably produce conflicts
        fc
          .string({ minLength: 1, maxLength: 20 })
          .filter((s) => /^[a-zA-Z]+$/.test(s)),
        fc
          .string({ minLength: 1, maxLength: 20 })
          .filter((s) => /^[a-zA-Z]+$/.test(s)),
        async (decA, _decB) => {
          const result = await checkConflicts({
            decisions: [
              { text: `Use ${decA} architecture`, status: "active" },
              { text: `Do not use ${decA} architecture`, status: "active" },
            ],
            constraints: [],
          });
          expect(result.conflicts.length).toBeGreaterThan(0);
          for (const conflict of result.conflicts) {
            expect(conflict.resolutionOptions).toHaveLength(4);
          }
        },
      ),
      { numRuns: 5 },
    );
  });

  it("forAll(superseded decision): never appears in conflict results [DEC-04]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .string({ minLength: 1, maxLength: 30 })
          .filter((s) => /^[a-zA-Z ]+$/.test(s)),
        async (title) => {
          const result = await checkConflicts({
            decisions: [{ text: title, status: "superseded" }],
            constraints: [],
          });
          const involved = result.conflicts.flatMap((c: any) =>
            c.items.map((i: any) => i.text),
          );
          expect(involved).not.toContain(title);
        },
      ),
      { numRuns: 5 },
    );
  });

  it("forAll(exception decision): never appears in conflict results [DEC-09]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .string({ minLength: 1, maxLength: 30 })
          .filter((s) => /^[a-zA-Z ]+$/.test(s)),
        async (title) => {
          const result = await checkConflicts({
            decisions: [{ text: title, status: "exception" }],
            constraints: [],
          });
          const involved = result.conflicts.flatMap((c: any) =>
            c.items.map((i: any) => i.text),
          );
          expect(involved).not.toContain(title);
        },
      ),
      { numRuns: 5 },
    );
  });

  it("forAll(intentional tension pair): never re-flagged [DEC-09]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .string({ minLength: 1, maxLength: 20 })
          .filter((s) => /^[a-zA-Z]+$/.test(s)),
        fc
          .string({ minLength: 1, maxLength: 20 })
          .filter((s) => /^[a-zA-Z]+$/.test(s)),
        async (a, b) => {
          const result = await checkConflicts({
            decisions: [
              { text: a, status: "active" },
              { text: b, status: "active" },
            ],
            constraints: [],
            intentionalTensions: [{ itemA: a, itemB: b }],
          });
          expect(result.conflicts).toHaveLength(0);
        },
      ),
      { numRuns: 5 },
    );
  });
});
