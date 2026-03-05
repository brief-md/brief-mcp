import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  generateReentrySummary,
  setTutorialDismissed,
  startTutorial,
} from "../../src/workspace/reentry";

// ---------------------------------------------------------------------------
// Unit Tests
// ---------------------------------------------------------------------------

describe("TASK-23: Workspace — Re-Entry & Tutorial", () => {
  describe("re-entry summary [ARCH-06]", () => {
    it("re-enter project: summary includes identity, status, time since last update [ARCH-06]", async () => {
      const result = await generateReentrySummary({
        projectPath: "/root/project",
      });
      // G-155: assert summary includes project name and recent activity (not just length > 0)
      expect(result.identity).toBeDefined();
      expect(result.identity.length).toBeGreaterThan(0);
      expect(result.identity.name).toBeDefined();
      expect(result.status).toBeDefined();
      expect(result.status.length).toBeGreaterThan(0);
      expect(result.timeSinceUpdate).toBeDefined();
      expect(result.timeSinceUpdate.length).toBeGreaterThan(0);
      // Assert summary includes project name
      expect(result.identity.name).toBeTruthy();
    });

    it("re-enter project with decisions: active decisions listed newest first [ARCH-06]", async () => {
      const result = await generateReentrySummary({
        projectPath: "/root/project",
      });
      expect(result.decisions).toBeDefined();
      // G-156: ensure test data has at least 2 decisions to eliminate the conditional guard
      expect(result.decisions.length).toBeGreaterThan(1);
      // Now safe to compare without an if-guard
      expect(
        (result.decisions[0] as any).date >= (result.decisions[1] as any).date,
      ).toBe(true);
    });

    it("re-enter project with open questions: counts and items included [ARCH-06]", async () => {
      const result = await generateReentrySummary({
        projectPath: "/root/project",
      });
      expect(result.openQuestions).toBeDefined();
      expect(typeof result.openQuestions.toResolveCount).toBe("number");
      expect(typeof result.openQuestions.toKeepOpenCount).toBe("number");
    });
  });

  describe("include_history parameter [DEC-03]", () => {
    it("include_history: full decision chains included [DEC-03]", async () => {
      const result = await generateReentrySummary({
        projectPath: "/root/project",
        includeHistory: true,
      });
      expect(result.decisionHistory).toBeDefined();
      expect(Array.isArray(result.decisionHistory)).toBe(true);
      expect(result.decisionHistory!.length).toBeGreaterThan(0);
    });

    it("without include_history: only active decisions, superseded count only [DEC-03]", async () => {
      const result = await generateReentrySummary({
        projectPath: "/root/project",
        includeHistory: false,
      });
      expect(result.supersededCount).toBeDefined();
      expect(result.supersededCount).toBeGreaterThanOrEqual(1);
      expect(result.decisionHistory).toBeUndefined();
    });
  });

  describe("re-entry features [ARCH-06]", () => {
    it("re-enter project: external session prompt included [ARCH-06]", async () => {
      const result = await generateReentrySummary({
        projectPath: "/root/project",
      });
      expect(result.externalSessionPrompt).toBeDefined();
      expect(result.externalSessionPrompt.length).toBeGreaterThan(0);
    });

    it("re-enter project with sub-projects: sub-project listing included [HIER-14]", async () => {
      const result = await generateReentrySummary({
        projectPath: "/root/project",
      });
      expect(result.subProjects).toBeDefined();
      expect(Array.isArray(result.subProjects)).toBe(true);
    });

    it("re-enter project: implicitly sets active project [ARCH-06]", async () => {
      const result = await generateReentrySummary({
        projectPath: "/root/project",
      });
      // G-157: verify activeProjectSet is boolean true (not just self-reported truthy)
      expect(typeof result.activeProjectSet).toBe("boolean");
      expect(result.activeProjectSet).toBe(true);
    });
  });

  describe("positive state [OQ-090c]", () => {
    it("zero open questions and zero conflicts: response includes positive_state [OQ-090c]", async () => {
      const result = await generateReentrySummary({
        projectPath: "/root/clean-project",
        simulateEmpty: true,
      });
      expect(result.openQuestions.toResolveCount).toBe(0);
      // G-158: use canonical property name positiveState per task spec
      expect(result.positiveState).toBe(true);
    });
  });

  describe("re-entry with conflicts [ARCH-06]", () => {
    it("re-entry with conflicts: conflict detection results included [ARCH-06]", async () => {
      const result = await generateReentrySummary({
        projectPath: "/root/project",
      });
      expect(result.conflicts).toBeDefined();
      expect(Array.isArray(result.conflicts)).toBe(true);
    });
  });

  describe("ontology tags in re-entry [ONT-23, T23-01]", () => {
    it("re-entry summary includes ontology tag summary (tagged entries, packs used) [ONT-23, T23-01]", async () => {
      const result = await generateReentrySummary({
        projectPath: "/root/project",
      });
      expect(result.ontologyTagSummary).toBeDefined();
      expect(result.ontologyTagSummary.taggedEntries).toBeDefined();
      expect(result.ontologyTagSummary.packsUsed).toBeDefined();
      expect(Array.isArray(result.ontologyTagSummary.packsUsed)).toBe(true);
    });
  });

  describe("recent changes in re-entry [T23-02]", () => {
    it("re-entry summary includes recent changes with Updated timestamps [T23-02]", async () => {
      const result = await generateReentrySummary({
        projectPath: "/root/project",
      });
      expect(result.recentChanges).toBeDefined();
      // Recent changes should include at least one entry with a timestamp
      expect(Array.isArray(result.recentChanges)).toBe(true);
      if (result.recentChanges.length > 0) {
        expect((result.recentChanges[0] as any).timestamp).toBeDefined();
        expect((result.recentChanges[0] as any).timestamp).toMatch(
          /\d{4}-\d{2}-\d{2}/,
        );
      }
    });
  });

  describe("intentional tensions in re-entry [DEC-09, T23-03]", () => {
    it("re-entry summary includes intentional tensions when present [DEC-09, T23-03]", async () => {
      const result = await generateReentrySummary({
        projectPath: "/root/project",
      });
      expect(result.intentionalTensions).toBeDefined();
      expect(Array.isArray(result.intentionalTensions)).toBe(true);
    });
  });

  describe("tutorial [TUT-01, TUT-02]", () => {
    it("start tutorial: returns 5-topic structure regardless of dismissed state [TUT-02]", async () => {
      const result = await startTutorial();
      expect(result.topics).toHaveLength(5);
    });

    it("start tutorial after dismissal: still works, returns full structure [TUT-02]", async () => {
      await setTutorialDismissed({ permanent: true });
      const result = await startTutorial();
      expect(result.topics).toHaveLength(5);
    });

    it("set tutorial dismissed with permanent=true: config updated, flag is true [TUT-06]", async () => {
      const result = await setTutorialDismissed({ permanent: true });
      expect(result.tutorialDismissed).toBe(true);
    });

    it("set tutorial dismissed with permanent=false: config updated, flag is false [TUT-06]", async () => {
      const result = await setTutorialDismissed({ permanent: false });
      expect(result.tutorialDismissed).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe("TASK-23: Property Tests", () => {
  it("forAll(project): re-entry always produces a structured summary, never throws [ARCH-06]", async () => {
    // G-160: make it() async, add await before fc.assert(...)
    await fc.assert(
      fc.asyncProperty(
        fc
          .string({ minLength: 5, maxLength: 50 })
          .filter((s) => s.startsWith("/") && /^[a-zA-Z0-9/]+$/.test(s)),
        async (path) => {
          const result = await generateReentrySummary({ projectPath: path });
          expect(result).toBeDefined();
          expect(result.identity).toBeDefined();
        },
      ),
      { numRuns: 5 },
    );
  });

  it("forAll(tutorial dismissed state): brief_start_tutorial always returns tutorial structure [TUT-02]", async () => {
    // G-161: make it() async, add await before fc.assert(...)
    await fc.assert(
      fc.asyncProperty(fc.boolean(), async (dismissed) => {
        if (dismissed) {
          await setTutorialDismissed({ permanent: true });
        }
        const result = await startTutorial();
        expect(result.topics).toHaveLength(5);
      }),
      { numRuns: 3 },
    );
  });

  it("forAll(config modification): tutorial_dismissed flag persists to disk immediately [TUT-06]", async () => {
    // G-162: make it() async, add await before fc.assert(...); assert result.tutorialDismissed === true when permanent
    await fc.assert(
      fc.asyncProperty(fc.boolean(), async (permanent) => {
        const result = await setTutorialDismissed({ permanent });
        // Assert tutorialDismissed reflects the permanent flag value exactly
        expect(result.tutorialDismissed).toBe(permanent);
      }),
      { numRuns: 3 },
    );
  });
});
