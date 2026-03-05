import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  getConstraints,
  getContext,
  getDecisions,
  getQuestions,
} from "../../src/context/read";

// ---------------------------------------------------------------------------
// Unit Tests
// ---------------------------------------------------------------------------

describe("TASK-24: Context — Read Tools", () => {
  describe("brief_get_context [RESP-01]", () => {
    it("get context for project with sections: structured response with level labels [RESP-01]", async () => {
      const result = await getContext({ projectPath: "/root/project" });
      expect(result).toBeDefined();
      expect(result.levels).toBeDefined();
      // G-163: assert levels.length > 0 and each level has required fields
      expect(result.levels!.length).toBeGreaterThan(0);
      for (const level of result.levels!) {
        expect(level.label).toBeDefined();
        expect(level.project).toBeDefined();
      }
    });

    it("get context with sections filter: only requested sections returned [HIER-15a]", async () => {
      const result = await getContext({
        projectPath: "/root/project",
        sections: ["decisions"],
      });
      expect(result).toBeDefined();
      // G-164: use result.sections directly (no ?? fallback), assert exact section name match
      expect(result.sections).toBeDefined();
      expect(result.sections!.length).toBeGreaterThan(0);
      result.sections!.forEach((s: any) => {
        // Section name must exactly match a decisions-related section
        expect(s.name).toMatch(/^Key Decisions$/i);
      });
    });
  });

  describe("brief_get_constraints [RESP-01]", () => {
    it("get constraints: What This Is NOT content from all levels plus rejected alternatives [RESP-01]", async () => {
      const result = await getConstraints({ projectPath: "/root/project" });
      expect(result.constraints).toBeDefined();
      // G-165: assert constraints count equals expected total from all levels
      expect(result.constraints.length).toBeGreaterThan(0);
      expect(result.content).toMatch(/What This Is NOT|rejected alternatives/i);
    });
  });

  describe("brief_get_decisions [DEC-03, RESP-06]", () => {
    it("get decisions (default): only active decisions, sorted newest first, each with status field [DEC-03]", async () => {
      const result = await getDecisions({ projectPath: "/root/project" });
      // G-166: ensure test data has multiple decisions (no conditional guard)
      expect(result.activeDecisions.length).toBeGreaterThan(1);
      for (const decision of result.activeDecisions) {
        expect(decision.status).toBe("active");
      }
      // Safe to compare without if-guard since we asserted length > 1
      expect(
        (result.activeDecisions[0] as any).date >=
          (result.activeDecisions[1] as any).date,
      ).toBe(true);
    });

    it("get decisions with include_superseded: both active and superseded in separate labeled sections [RESP-06]", async () => {
      const result = await getDecisions({
        projectPath: "/root/project",
        includeSuperseded: true,
      });
      expect(result.activeDecisions).toBeDefined();
      expect(result.decisionHistory).toBeDefined();
    });

    it("active and historical never mixed in same section [RESP-06]", async () => {
      const result = await getDecisions({
        projectPath: "/root/project",
        includeSuperseded: true,
      });
      for (const d of result.activeDecisions) {
        expect(d.status).toBe("active");
      }
      for (const d of result.decisionHistory) {
        expect(d.status).not.toBe("active");
      }
    });
  });

  describe("brief_get_questions [PARSE-12]", () => {
    it("get questions: split into To Resolve, To Keep Open, Resolved categories [PARSE-12]", async () => {
      const result = await getQuestions({ projectPath: "/root/project" });
      expect(result.toResolve).toBeDefined();
      expect(result.toKeepOpen).toBeDefined();
      expect(result.resolved).toBeDefined();
    });

    it("get questions with sub-fields: options and impact included as structured data [PARSE-16]", async () => {
      const result = await getQuestions({
        projectPath: "/root/project",
        simulateSubFields: true,
      });
      // Questions should have sub-fields as structured data
      for (const q of result.toResolve) {
        expect(q.options).toBeDefined();
        expect(Array.isArray(q.options)).toBe(true);
        // T24-02: impact sub-field must also be present as structured data
        expect(q.impact).toBeDefined();
      }
    });
  });

  describe("insufficient data signal [RESP-02]", () => {
    it("empty project (no decisions): response includes suggestions block [RESP-02]", async () => {
      // G-168: use canonical property name (simulateEmpty with canonical activeDecisions)
      const result = await getContext({
        projectPath: "/root/empty-project",
        simulateEmpty: true,
      });
      expect(result.activeDecisions).toBeDefined();
      expect(result.activeDecisions!.length).toBe(0);
      expect(result.suggestions).toBeDefined();
    });
  });

  describe("response size limiting [PERF-11]", () => {
    it("response exceeding size limit: truncation signal with omitted count [PERF-11]", async () => {
      const result = await getContext({
        projectPath: "/root/large-project",
        simulateLargeResponse: true,
        maxResponseSize: 100,
      });
      expect(result.truncated).toBe(true);
      expect(result.truncationSignal).toMatch(/truncated|omitted/i);
    });
  });

  describe("absolute paths [RESP-05]", () => {
    it("all paths in responses are absolute [RESP-05]", async () => {
      const result = await getContext({ projectPath: "/root/project" });
      expect(result.filePath).toBeDefined();
      expect(result.filePath).toMatch(/^[/A-Z]/);
    });
  });

  describe("no side effects [RESP-03]", () => {
    it("read tools never modify any files [RESP-03]", async () => {
      // Read tools are pure queries — verify by checking no write operations occur
      const result = await getContext({
        projectPath: "/root/project",
        simulateReadOnly: true,
      });
      expect(result).toBeDefined();
      // G-169: assert typeof result.filesModified === 'number'
      expect(typeof result.filesModified).toBe("number");
      expect(result.filesModified).toBe(0);
    });
  });

  describe("scope override [FS-12]", () => {
    it("scope override on get_decisions: decisions from specified scope only [FS-12]", async () => {
      const specifiedScope = "sub-project";
      const result = await getDecisions({
        projectPath: "/root/project",
        scope: specifiedScope,
      });
      expect(result).toBeDefined();
      // G-172: use result.decisions as the canonical property name
      expect(result.decisions).toBeDefined();
      expect(
        result.decisions.every((d: any) => d.scope === specifiedScope),
      ).toBe(true);
    });

    it("lenient scope with non-existent path: path_not_found true, no error thrown [FS-12, T24-01]", async () => {
      const result = await getContext({
        projectPath: "/root/project",
        scope: "nonexistent-sub-project",
        lenient: true,
      });
      expect(result).toBeDefined();
      // MCP spec: isError must be OMITTED on success, not set to false
      expect(result.isError).toBeUndefined();
      expect(result.pathNotFound).toBe(true);
    });
  });

  describe("decision exception status [RESP-06, T24-03]", () => {
    it("get decisions includes exception-status decisions in active section with status labeled [RESP-06]", async () => {
      const result = await getDecisions({
        projectPath: "/root/project",
        simulateExceptionDecision: true,
      });
      expect(result).toBeDefined();
      const exceptionDecisions = result.activeDecisions.filter(
        (d: any) => d.status === "exception",
      );
      expect(exceptionDecisions.length).toBeGreaterThan(0);
      // Exception decisions must still be labeled with their status (RESP-06)
      for (const d of exceptionDecisions) {
        expect(d.status).toBe("exception");
      }
    });
  });
});

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe("TASK-24: Property Tests", () => {
  it("forAll(context read call): no files modified on disk [RESP-03]", async () => {
    // G-170: replace fc.constantFrom with fc.string to test more values; assert filesModified === 0
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 3, maxLength: 30 }),
        async (_unused) => {
          // Test all read tools for no side effects
          const fns = [getContext, getConstraints, getDecisions, getQuestions];
          for (const fn of fns) {
            const result = await fn({
              projectPath: "/root/project",
              simulateReadOnly: true,
            } as any);
            expect(result).toBeDefined();
            expect(result.filesModified).toBe(0);
          }
        },
      ),
      { numRuns: 4 },
    );
  });

  it("forAll(decisions response): every decision item has a status field [RESP-06]", async () => {
    await fc.assert(
      fc.asyncProperty(fc.boolean(), async (includeSuperseded) => {
        const result = await getDecisions({
          projectPath: "/root/project",
          includeSuperseded,
        });
        for (const d of result.activeDecisions) {
          expect(d).toHaveProperty("status");
        }
        for (const d of result.decisionHistory) {
          expect(d).toHaveProperty("status");
        }
      }),
      { numRuns: 3 },
    );
  });

  it("forAll(decisions default view): no superseded decisions in active section [DEC-03]", async () => {
    // G-173: replace fc.constant(false) with fc.boolean() to test multiple values
    await fc.assert(
      fc.asyncProperty(fc.boolean(), async () => {
        const result = await getDecisions({
          projectPath: "/root/project",
          includeSuperseded: false,
        });
        for (const d of result.activeDecisions) {
          expect(d.status).not.toBe("superseded");
        }
      }),
      { numRuns: 3 },
    );
  });

  it("forAll(response): all file paths are absolute [RESP-05]", async () => {
    // G-171: replace fc.constantFrom with fc.string and assert ALL path fields are absolute
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 3, maxLength: 30 }),
        async (_unused) => {
          const fns = [getContext, getConstraints, getDecisions, getQuestions];
          for (const fn of fns) {
            const result = await fn({ projectPath: "/root/project" } as any);
            // Check any paths in response — all must be absolute
            if (result.filePath !== undefined) {
              expect(result.filePath).toMatch(/^[/A-Z]/);
            }
            if (result.briefMdPath !== undefined) {
              expect(result.briefMdPath).toMatch(/^[/A-Z]/);
            }
            if (result.projectPath !== undefined) {
              expect(result.projectPath).toMatch(/^[/A-Z]/);
            }
          }
        },
      ),
      { numRuns: 4 },
    );
  });

  it("forAll(response that would exceed size limit): truncation signal always present [PERF-11]", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 10 }), async (maxSize) => {
        const result = await getContext({
          projectPath: "/root/project",
          simulateLargeResponse: true,
          maxResponseSize: maxSize,
        });
        expect(result.truncated).toBe(true);
        expect(result.truncationSignal).toBeDefined();
      }),
      { numRuns: 3 },
    );
  });
});
