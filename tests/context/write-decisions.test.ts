import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { handleAddDecision } from "../../src/context/write-decisions";

// ---------------------------------------------------------------------------
// Unit Tests
// ---------------------------------------------------------------------------

describe("TASK-26: Context Write — Decisions", () => {
  describe("new decision writing [DEC-01]", () => {
    it("new decision with title and rationale: written, confirmation returned with file path [DEC-01]", async () => {
      const result = await handleAddDecision({
        title: "Test Decision",
        why: "Strong JSON support",
      });
      expect(result.success).toBe(true);
      expect(result.filePath).toMatch(/BRIEF\.md$/);
      // RESP-04: file path must appear in MCP content text, not only as a separate field
      expect(result.content[0].text).toMatch(/BRIEF\.md/);
      expect(result.content[0].text).toContain("Test Decision");
    });
  });

  describe("supersession [DEC-01]", () => {
    it("decision with replaces: supersession flow triggered, both updated [DEC-01]", async () => {
      const result = await handleAddDecision({
        title: "Use PostgreSQL",
        why: "Better than MySQL",
        replaces: "Use MySQL",
      });
      expect(result.success).toBe(true);
      expect(result.previousDecisionUpdated).toBe(true);
      expect(result.supersededByAnnotation).toMatch(/SUPERSEDED BY/i);
    });
  });

  describe("exception [DEC-02]", () => {
    it("decision with exception_to: exception flow triggered, original annotated, both active [DEC-02]", async () => {
      const result = await handleAddDecision({
        title: "Use React Native for iOS",
        why: "Team expertise",
        exception_to: "Use Flutter",
      });
      expect(result.success).toBe(true);
      expect(result.annotationAdded).toBe(true);
      expect(result.annotation).toMatch(/brief:has-exception/);
    });
  });

  describe("amendment [DEC-07]", () => {
    it("decision with amend: in-place update, WHEN date unchanged [DEC-07]", async () => {
      const result = await handleAddDecision({
        title: "Use TypeScript",
        why: "Updated rationale",
        amend: true,
      });
      expect(result.success).toBe(true);
      expect(result.whenDatePreserved).toBe(true);
      expect(result.originalWhenDate).toBeDefined();
      // Verify the original date string was actually preserved (not just defined)
      expect(result.whenDate).toBe(result.originalWhenDate);
    });
  });

  describe("mutual exclusion [MCP-03]", () => {
    it("both replaces and exception_to provided: mutual exclusion error [MCP-03]", async () => {
      const result = await handleAddDecision({
        title: "Test",
        why: "Test",
        replaces: "Old",
        exception_to: "Other",
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/replaces|exception_to|conflict/i);
    });

    it("both amend and replaces provided: mutual exclusion error [MCP-03]", async () => {
      const result = await handleAddDecision({
        title: "Test",
        why: "Test",
        amend: true,
        replaces: "Other",
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/amend|replaces/i);
    });

    it("both amend and exception_to provided: mutual exclusion error [MCP-03, T26-01]", async () => {
      const result = await handleAddDecision({
        title: "Test",
        why: "Test",
        amend: true,
        exception_to: "Other Decision",
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(
        /amend|exception_to|mutually exclusive/i,
      );
    });
  });

  describe("validation [MCP-03]", () => {
    it("empty title: validation error [MCP-03]", async () => {
      const result = await handleAddDecision({ title: "", why: "test" });
      expect(result.isError).toBe(true);
    });

    it("title exceeding 500 characters: validation error [MCP-03]", async () => {
      const result = await handleAddDecision({
        title: "a".repeat(501),
        why: "test",
      });
      expect(result.isError).toBe(true);
    });

    it("invalid date format via canonical `date` parameter: validation error [DEC-05, T26-02]", async () => {
      // T26-02: task spec uses `date` as the canonical parameter name (not `when`)
      const result = await handleAddDecision({
        title: "Test",
        why: "Test",
        date: "06/01/2025",
      } as any);
      expect(result.isError).toBe(true);
    });

    it("invalid date format: validation error [DEC-05]", async () => {
      const result = await handleAddDecision({
        title: "Test",
        why: "Test",
        when: "06/01/2025",
      });
      expect(result.isError).toBe(true);
    });

    it("date omitted: defaults to current date [DEC-05]", async () => {
      const result = await handleAddDecision({
        title: "Test",
        why: "Test",
      });
      expect(result.success).toBe(true);
      expect(result.whenDate).toMatch(/\d{4}-\d{2}-\d{2}/);
    });

    it("whitespace-only title: treated as missing, validation error [MCP-03]", async () => {
      const result = await handleAddDecision({ title: "   ", why: "test" });
      expect(result.isError).toBe(true);
    });
  });

  describe("error handling [MCP-03]", () => {
    it("replaces referencing non-existent decision: error with suggestion [DEC-13]", async () => {
      const result = await handleAddDecision({
        title: "New",
        why: "Reason",
        replaces: "Nonexistent Decision",
      });
      expect(result.isError).toBe(true);
      expect(result.suggestion).toMatch(/did you mean|not found/i);
    });
  });

  describe("external session integration [DEC-16]", () => {
    it("decision after external session capture: conflict detection auto-triggered [DEC-16]", async () => {
      // Verify conflict detection runs after session capture
      const result = await handleAddDecision({
        title: "Post-session decision",
        why: "Decided after external session",
        afterExternalSession: true,
      } as any);
      expect(result).toBeDefined();
      expect(result.conflictsDetected).toBe(true);
      // Verify the external session details are mentioned in the response
      expect(result.content[0].text).toMatch(
        /external session|Post-session decision/i,
      );
    });
  });

  describe("active project guard [ARCH-06]", () => {
    it("no active project set: requireActiveProject guard error [ARCH-06]", async () => {
      // When no active project is set, should get a clear error
      const result = await handleAddDecision({
        title: "Test",
        why: "Test",
        _noActiveProject: true,
      } as any);
      expect(result.isError).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe("TASK-26: Property Tests", () => {
  it("forAll(decision parameters): handler never throws, always returns structured response [MCP-03]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          title: fc.string({ maxLength: 100 }),
          why: fc.string({ maxLength: 200 }),
        }),
        async (params) => {
          const result = await handleAddDecision(params);
          expect(result).toBeDefined();
          expect(result.success).toBeDefined();
          expect(typeof result.success).toBe("boolean");
        },
      ),
      { numRuns: 10 },
    );
  });

  it("forAll(title string): empty or whitespace-only always rejected [MCP-03]", async () => {
    await fc.assert(
      fc.asyncProperty(fc.stringMatching(/^[ \t\n]*$/), async (title) => {
        const result = await handleAddDecision({ title, why: "test" });
        expect(result.isError).toBe(true);
      }),
      { numRuns: 5 },
    );
  });

  it("forAll(mutually exclusive params): conflict always detected [MCP-03]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.string({ minLength: 1, maxLength: 20 }),
        async (replaces, exceptionTo) => {
          const result = await handleAddDecision({
            title: "Test",
            why: "Test",
            replaces,
            exception_to: exceptionTo,
          });
          expect(result.isError).toBe(true);
        },
      ),
      { numRuns: 5 },
    );
  });

  it("forAll(write operation): confirmation includes file path [RESP-04]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .string({ minLength: 1, maxLength: 50 })
          .filter((s) => /^[a-zA-Z0-9 ]+$/.test(s) && s.trim().length > 0),
        async (title) => {
          const result = await handleAddDecision({ title, why: "reason" });
          expect(result.success).toBe(true);
          // RESP-04 + RESP-05: file path must appear in MCP content text and be absolute
          expect(result.content[0].text).toMatch(/\/.*BRIEF\.md|file.*path/i);
        },
      ),
      { numRuns: 5 },
    );
  });
});
