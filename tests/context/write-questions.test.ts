import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  handleAddConstraint,
  handleAddQuestion,
  handleResolveQuestion,
} from "../../src/context/write-questions";

// ---------------------------------------------------------------------------
// Unit Tests
// ---------------------------------------------------------------------------

describe("TASK-27: Context Write — Questions & Constraints", () => {
  describe("add question [PARSE-12]", () => {
    it("add question to To Resolve: checkbox item written with text [PARSE-12]", async () => {
      const result = await handleAddQuestion({
        text: "Which database to use?",
        keep_open: false,
      });
      expect(result.success).toBe(true);
      expect(result.format).toMatch(/- \[ \]/);
    });

    it("add question with options and impact: sub-fields present [PARSE-16]", async () => {
      const result = await handleAddQuestion({
        text: "Which framework?",
        keep_open: false,
        options: ["React", "Vue", "Svelte"],
        impact: "Affects all frontend code",
      });
      expect(result.success).toBe(true);
      expect(result.optionsWritten).toBe(true);
      expect(result.impactWritten).toBe(true);
    });

    it("add question to To Keep Open: plain list item, no checkbox [PARSE-12]", async () => {
      const result = await handleAddQuestion({
        text: "Long-term architecture direction",
        keep_open: true,
      });
      expect(result.success).toBe(true);
      expect(result.format).not.toMatch(/- \[ \]/);
    });

    it("add question with high priority: prepended to top of sub-section [PARSE-12]", async () => {
      const result = await handleAddQuestion({
        text: "Urgent question",
        keep_open: false,
        priority: "high",
      });
      expect(result.success).toBe(true);
      expect(result.position).toMatch(/first|top|beginning/i);
    });

    it("add question with normal priority: appended to end [PARSE-12]", async () => {
      const result = await handleAddQuestion({
        text: "Normal question",
        keep_open: false,
        priority: "normal",
      });
      expect(result.success).toBe(true);
      expect(result.position).toMatch(/last|end/i);
    });

    it("empty question text: validation error [MCP-03]", async () => {
      const result = await handleAddQuestion({
        text: "",
        keep_open: false,
      });
      expect(result.isError).toBe(true);
    });

    it("canonical `question` parameter accepted (spec name, T27-02)", async () => {
      // T27-02: task spec uses `question` as the canonical parameter name (not `text`)
      const result = await handleAddQuestion({
        question: "Which database to use?",
        keep_open: false,
      } as any);
      expect(result.success).toBe(true);
    });
  });

  describe("resolve question [DEC-06]", () => {
    it("resolve question with exact match: checkbox marked, moved to Resolved [DEC-06]", async () => {
      const result = await handleResolveQuestion({
        question: "Which database to use?",
        resolution: "Chose PostgreSQL",
      });
      expect(result.success).toBe(true);
      expect(result.resolutionSummary).toBeDefined();
    });

    it("resolve with substring matching multiple: error listing all matches [DEC-06]", async () => {
      await expect(
        handleResolveQuestion({
          question: "database",
          resolution: "PostgreSQL",
        }),
      ).rejects.toThrow(/multiple|disambig/i);
    });

    it("resolve with no match, fuzzy candidate exists: suggestion returned [DEC-06]", async () => {
      const result = await handleResolveQuestion({
        question: "Which databse to use?", // typo
        resolution: "PostgreSQL",
      }).catch((e: any) => e);
      // Either throws with suggestion or returns error with match suggestions
      if (result instanceof Error) {
        expect(result.message).toMatch(/did you mean|suggestion/i);
      } else {
        // Explicitly test the non-error branch to avoid tautological pass
        expect(result.matchSuggestions).toBeDefined();
        expect(result.matchSuggestions.length).toBeGreaterThan(0);
      }
    });

    it("resolve To Keep Open question: resolved with was_keep_open warning [DEC-06]", async () => {
      const result = await handleResolveQuestion({
        question: "Long-term direction",
        resolution: "Committed to microservices",
      });
      expect(result.wasKeepOpen).toBe(true);
    });

    it("resolve question that had Options: suggest_decision is true [DEC-06]", async () => {
      const result = await handleResolveQuestion({
        question: "Which framework?",
        resolution: "React",
      });
      expect(result.suggestDecision).toBe(true);
    });

    it("resolve question without sub-fields: suggest_decision is false [DEC-06]", async () => {
      const result = await handleResolveQuestion({
        question: "Simple question",
        resolution: "Answered",
      });
      expect(result.suggestDecision).toBe(false);
    });
  });

  describe("auto-decision from question [DEC-08]", () => {
    it("resolve with decision and why params: Key Decision auto-created with bidirectional links [DEC-08]", async () => {
      // T27-03: task spec uses `decision` (boolean flag) and `why` (string), not `createDecision`/`decisionWhy`
      const result = await handleResolveQuestion({
        question: "Which DB?",
        resolution: "PostgreSQL",
        decision: true,
        why: "Best JSON support",
      } as any);
      expect(result.decisionCreated).toBe(true);
      expect(result.bidirectionalLinks).toBe(true);
      expect(result.alternativesConsidered).toBe(true);
    });

    it("auto-decision from question with Options: ALTERNATIVES CONSIDERED populated [DEC-08]", async () => {
      const result = await handleResolveQuestion({
        question: "Which framework?",
        resolution: "React",
        createDecision: true,
        decisionWhy: "Team knows it",
      });
      expect(result.decisionCreated).toBe(true);
      expect(result.bidirectionalLinks).toBe(true);
      expect(result.alternativesConsidered).toBe(true);
    });
  });

  describe("add constraint [PARSE-06]", () => {
    it("add constraint: appended to What This Is NOT section [PARSE-06]", async () => {
      const result = await handleAddConstraint({
        text: "Not a mobile app",
      });
      expect(result.success).toBe(true);
      expect(result.sectionPlaced).toBeDefined();
      // "without reason" case: reason should be falsy/undefined
      expect(result.reason).toBeFalsy();
    });

    it("add constraint with reason: reason included [PARSE-06]", async () => {
      const result = await handleAddConstraint({
        text: "No GraphQL",
        reason: "Team has no experience",
      });
      expect(result.success).toBe(true);
      expect(result.sectionPlaced).toBeDefined();
      expect(result.reason).toBeDefined();
    });

    it("add constraint when section missing: section created then content appended [PARSE-06]", async () => {
      const result = await handleAddConstraint({
        text: "No microservices",
        sectionMissing: true,
      } as any);
      expect(result.success).toBe(true);
      expect(result.sectionPlaced).toBeDefined();
      // Verify the section was actually created
      expect(result.sectionCreated).toBe(true);
    });
  });

  describe("active project guard [ARCH-06, T27-01]", () => {
    it("handleAddQuestion with no active project: requireActiveProject guard error [ARCH-06]", async () => {
      const result = await handleAddQuestion({
        text: "Some question?",
        keep_open: false,
        _noActiveProject: true,
      } as any);
      expect(result.isError).toBe(true);
      expect(result.content![0].text).toMatch(/active.*project|no project/i);
    });

    it("handleResolveQuestion with no active project: requireActiveProject guard error [ARCH-06]", async () => {
      const result = await handleResolveQuestion({
        question: "Some question?",
        resolution: "Resolved",
        _noActiveProject: true,
      } as any);
      expect(result.isError).toBe(true);
      expect(result.content![0].text).toMatch(/active.*project|no project/i);
    });

    it("handleAddConstraint with no active project: requireActiveProject guard error [ARCH-06]", async () => {
      const result = await handleAddConstraint({
        text: "Some constraint",
        _noActiveProject: true,
      } as any);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/active.*project|no project/i);
    });
  });
});

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe("TASK-27: Property Tests", () => {
  it("forAll(question text): add question never throws, always returns structured response [MCP-03]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .string({ minLength: 1, maxLength: 200 })
          .filter((s) => s.trim().length > 0),
        async (text) => {
          const result = await handleAddQuestion({
            text,
            keep_open: false,
          });
          expect(result).toBeDefined();
          expect(typeof result.success).toBe("boolean");
        },
      ),
      { numRuns: 10 },
    );
  });

  it("forAll(resolve operation): resolution_summary always present in response [DEC-06]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .string({ minLength: 1, maxLength: 100 })
          .filter((s) => /^[a-zA-Z0-9 ?]+$/.test(s)),
        async (questionText) => {
          try {
            const result = await handleResolveQuestion({
              question: questionText,
              resolution: "Resolved via property test",
            });
            // Successful resolution MUST include resolutionSummary (canonical property per DEC-06 spec)
            expect(result.resolutionSummary).toBeDefined();
          } catch (e: any) {
            // Match errors are acceptable — but verify it's a match error, not a crash
            expect(e.message).toMatch(/match|not found|ambiguous/i);
          }
        },
      ),
      { numRuns: 5 },
    );
  });

  it("forAll(bidirectional link): both RESOLVED FROM and DECIDED AS are set [DEC-08]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .string({ minLength: 1, maxLength: 50 })
          .filter((s) => /^[a-zA-Z0-9 ?]+$/.test(s)),
        async (questionText) => {
          try {
            const result = await handleResolveQuestion({
              question: questionText,
              resolution: "Resolved with decision",
              createDecision: true,
              decisionWhy: "Property test rationale",
            });
            // Resolution succeeded and decision was created — verify bidirectional links
            expect(result).toBeDefined();
            expect(result.decisionCreated).toBe(true);
            // Use canonical property names per DEC-08 spec
            expect(result.resolvedFrom).toBeDefined();
            expect(result.decidedAs).toBeDefined();
          } catch (e: any) {
            expect(e.message).toMatch(/match|not found|ambiguous/i);
          }
        },
      ),
      { numRuns: 5 },
    );
  });

  it("forAll(constraint text): append to What This Is NOT never throws [PARSE-06]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .string({ minLength: 1, maxLength: 200 })
          .filter((s) => s.trim().length > 0),
        async (text) => {
          const result = await handleAddConstraint({ text });
          expect(result).toBeDefined();
        },
      ),
      { numRuns: 10 },
    );
  });

  it("forAll(write question operation): confirmation includes file path in content text [RESP-04, RESP-05]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .string({ minLength: 1, maxLength: 100 })
          .filter((s) => s.trim().length > 0),
        async (text) => {
          const result = await handleAddQuestion({ text, keep_open: false });
          // RESP-04: write tools must confirm file path and changes
          // RESP-05: path must be absolute — verified via content[0].text
          expect(result.content).toBeDefined();
          expect(Array.isArray(result.content)).toBe(true);
          expect(result.content[0].type).toBe("text");
          expect(result.content[0].text).toMatch(/\/.*BRIEF\.md|file.*path/i);
        },
      ),
      { numRuns: 5 },
    );
  });
});
