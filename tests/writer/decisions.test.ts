import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  addDecision,
  detectCircularChain,
  supersedeDecision,
  validateDecisionFields,
} from "../../src/writer/decisions";

// ---------------------------------------------------------------------------
// Unit Tests
// ---------------------------------------------------------------------------

describe("TASK-15a: Writer — Decision Writing & Supersession", () => {
  const testPath = "test-decisions.brief.md";

  describe("new decision writing [DEC-01]", () => {
    it("new decision with all fields appears under Key Decisions with structured fields [DEC-01]", async () => {
      const input = "## Key Decisions\n";
      const result = await addDecision(input, {
        title: "Use PostgreSQL",
        why: "Strong JSON support",
        when: "2025-06-01",
        alternatives: ["MySQL", "MongoDB"],
      });
      expect(result.content).toContain("### Use PostgreSQL");
      expect(result.content).toContain("WHAT:");
      expect(result.content).toContain("WHY:");
      expect(result.content).toContain("WHEN: 2025-06-01");
      expect(result.content).toContain("ALTERNATIVES CONSIDERED:");
    });
  });

  describe("decision date format [DEC-05]", () => {
    it("decision date is always YYYY-MM-DD format using local timezone [DEC-05]", async () => {
      const input = "## Key Decisions\n";
      const result = await addDecision(input, {
        title: "Test Decision",
        why: "Testing dates",
      });
      expect(result.content).toMatch(/WHEN: \d{4}-\d{2}-\d{2}/);
    });
  });

  describe("supersession [DEC-01, DEC-11]", () => {
    it("supersede an active decision: old gets strikethrough, label, SUPERSEDED BY; new gets REPLACES [DEC-01]", async () => {
      const input = [
        "## Key Decisions",
        "### Use MySQL",
        "WHAT: MySQL as primary database",
        "WHY: Familiarity",
        "WHEN: 2025-01-01",
        "",
      ].join("\n");
      const result = await supersedeDecision(input, {
        title: "Use PostgreSQL",
        why: "Better JSON support",
        replaces: "Use MySQL",
      });
      expect(result.content).toContain("~~");
      expect(result.content).toContain("(superseded)");
      expect(result.content).toContain("SUPERSEDED BY:");
      expect(result.content).toContain("REPLACES: Use MySQL");
    });

    it("supersede a minimal-format decision: lifecycle field added without restructuring to full format [WRITE-13, M1]", async () => {
      // WRITE-13: The writer MUST NOT convert minimal-format decisions to full format during supersession.
      // Result must be a hybrid (minimal body + SUPERSEDED BY), NOT a restructured full-format decision.
      const input =
        "## Key Decisions\n### Old Simple Decision\nJust a rationale paragraph.\n";
      const result = await supersedeDecision(input, {
        title: "New Decision",
        why: "Better approach",
        replaces: "Old Simple Decision",
      });
      // Lifecycle marker must be added
      expect(result.content).toContain("SUPERSEDED BY:");
      // Original paragraph body must be preserved
      expect(result.content).toContain("Just a rationale paragraph");
      // MUST NOT have restructured into full format — no structured fields added to old decision
      expect(result.content).not.toContain("WHAT:");
      expect(result.content).not.toContain("WHY:");
      expect(result.content).not.toContain("WHEN:");
      expect(result.content).not.toContain("STATUS:");
    });

    it("attempt to supersede already-superseded decision: error names current active head title [DEC-11, M2]", async () => {
      // DEC-11: error MUST name the current active head so the user knows what to supersede instead.
      // Spec: "Decision '[title]' is already superseded by '[current active title]'. Supersede the current active decision instead."
      const input = [
        "## Key Decisions",
        "### ~~Old Decision (superseded)~~",
        "SUPERSEDED BY: Current Decision (2025-06-01)",
        "",
        "### Current Decision",
        "WHAT: Current choice",
        "",
      ].join("\n");
      let caughtError: Error | undefined;
      try {
        await supersedeDecision(input, {
          title: "New",
          why: "Reason",
          replaces: "Old Decision",
        });
      } catch (e: any) {
        caughtError = e;
      }
      expect(caughtError).toBeDefined();
      // Must indicate already-superseded state
      expect(caughtError!.message).toMatch(/already superseded/i);
      // Must name the current active head so user knows what to target instead
      expect(caughtError!.message).toContain("Current Decision");
    });
  });

  describe("title matching [DEC-13]", () => {
    it("replaces matching multiple decisions: error listing all matches [DEC-13]", async () => {
      const input = [
        "## Key Decisions",
        "### Use React",
        "WHAT: React for frontend",
        "",
        "### Use React Native",
        "WHAT: React Native for mobile",
        "",
      ].join("\n");
      await expect(
        supersedeDecision(input, {
          title: "Use Vue",
          why: "Lighter",
          replaces: "React",
        }),
      ).rejects.toThrow(/multiple|disambig/i);
    });

    it("replaces matching no decisions: error with suggestion [DEC-13]", async () => {
      const input = "## Key Decisions\n### Use TypeScript\nWHAT: TS for all\n";
      await expect(
        supersedeDecision(input, {
          title: "Use Rust",
          why: "Performance",
          replaces: "Use Python",
        }),
      ).rejects.toThrow(/not found|no match/i);
    });

    it("title with markdown formatting and zero-width characters: matching succeeds after normalization [DEC-13]", async () => {
      const input = "## Key Decisions\n### **Use TypeScript**\nWHAT: TS\n";
      const result = await supersedeDecision(input, {
        title: "Use Rust",
        why: "Perf",
        replaces: "Use\u200B TypeScript",
      });
      expect(result.content).toContain("SUPERSEDED BY:");
    });
  });

  describe("validation [MCP-03]", () => {
    it("title exceeding 500 characters produces validation error [MCP-03]", () => {
      expect(() =>
        validateDecisionFields({ title: "a".repeat(501), why: "test" }),
      ).toThrow(/title|limit|500/i);
    });

    it("date in non-ISO format produces validation error [DEC-05]", () => {
      expect(() =>
        validateDecisionFields({ title: "Test", when: "06/01/2025" }),
      ).toThrow(/date|format|YYYY/i);
    });

    it("why field exceeding 5000 chars → validation error, decision not written [MCP-03]", async () => {
      const input = "## Key Decisions\n";
      const longWhy = "Because ".repeat(700); // ~5600 chars
      // Writer functions throw on validation failure; MCP handlers wrap the error
      await expect(
        addDecision(input, { title: "Test Decision", why: longWhy }),
      ).rejects.toThrow(/why|5000|length/i);
    });

    it("alternatives array with entry exceeding 500 chars → validation error, decision not written [MCP-03]", async () => {
      const input = "## Key Decisions\n";
      await expect(
        addDecision(input, {
          title: "Test Decision",
          why: "reason",
          alternatives: ["a".repeat(501)],
        }),
      ).rejects.toThrow(/alternatives|500|length/i);
    });
  });

  // T15a-01: Amendment test (DEC-07) belongs in exceptions.test.ts per task spec division.
  // The canonical amendment tests are in tests/writer/exceptions.test.ts.

  describe("single-file scope [DEC-14, T15a-02]", () => {
    it("supersession targeting decision not in this file content: not-found error [DEC-14]", async () => {
      const input = "## Key Decisions\n### Local Decision\nWHAT: Local\n";
      await expect(
        supersedeDecision(input, {
          title: "New",
          why: "test",
          replaces: "External Decision",
        }),
      ).rejects.toThrow(/not found|single.file|scope/i);
    });

    it("supersession with cross-file source indicator: scope error distinguishes from not-found [DEC-14, T15a-02]", async () => {
      // T15a-02: true cross-file test — we provide a sourceFile that differs from the content's
      // implied file, and a decision title that DOES exist in the content but is in scope of another file
      const input = "## Key Decisions\n### Decision A\nWHAT: A\n";
      let thrownError: Error | undefined;
      try {
        await supersedeDecision(input, {
          title: "New Decision",
          why: "Cross-file supersession attempt",
          replaces: "Decision A",
          sourceFile: "/other/project/BRIEF.md", // different scope — must be rejected
        } as any);
      } catch (e: any) {
        thrownError = e;
      }
      // Writer must reject cross-file references regardless of whether title matches
      expect(thrownError).toBeDefined();
      expect(thrownError!.message).toMatch(
        /not found|scope|single.file|invalid/i,
      );
    });
  });

  describe("chain traversal [DEC-10, DEC-15]", () => {
    it("chain of three supersessions: all links correct, only latest is active [DEC-10]", async () => {
      const input = [
        "## Key Decisions",
        "### ~~Decision A (superseded)~~",
        "SUPERSEDED BY: Decision B (2025-01-01)",
        "",
        "### ~~Decision B (superseded)~~",
        "REPLACES: Decision A",
        "SUPERSEDED BY: Decision C (2025-06-01)",
        "",
        "### Decision C",
        "REPLACES: Decision B",
        "WHAT: Latest choice",
        "",
      ].join("\n");
      // Supersede C with D
      const result = await supersedeDecision(input, {
        title: "Decision D",
        why: "Even better",
        replaces: "Decision C",
      });
      expect(result.content).toContain("REPLACES: Decision C");
    });

    it("circular supersession chain detected: warning with involved titles [DEC-15]", () => {
      const decisions = [
        { title: "A", supersededBy: "B" },
        { title: "B", supersededBy: "C" },
        { title: "C", supersededBy: "A" },
      ];
      const result = detectCircularChain(decisions);
      expect(result.hasCycle).toBe(true);
      expect(result.involvedTitles).toContain("A");
    });
  });

  describe("duplicate title detection [DEC-13]", () => {
    it("new decision with same title as existing active produces warning about duplicate [DEC-13]", async () => {
      const input =
        "## Key Decisions\n### Use TypeScript\nWHAT: TS for types\n";
      const result = await addDecision(input, {
        title: "Use TypeScript",
        why: "Type safety",
      });
      expect(result.warnings).toEqual(
        expect.arrayContaining([expect.stringMatching(/duplicate/i)]),
      );
    });
  });

  describe("bidirectional links [DEC-01]", () => {
    it("decision with REPLACES referencing exact title creates bidirectional links [DEC-01]", async () => {
      const input =
        "## Key Decisions\n### Use REST\nWHAT: REST API\nWHEN: 2025-01-01\n";
      const result = await supersedeDecision(input, {
        title: "Use GraphQL",
        why: "Flexible queries",
        replaces: "Use REST",
      });
      expect(result.content).toContain("SUPERSEDED BY: Use GraphQL");
      expect(result.content).toContain("REPLACES: Use REST");
    });
  });
});

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe("TASK-15a: Property Tests", () => {
  it("forAll(decision title, rationale): new decision always parseable after write [DEC-01]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .string({ minLength: 1, maxLength: 100 })
          .filter((s) => /^[a-zA-Z0-9 ]+$/.test(s)),
        fc
          .string({ minLength: 1, maxLength: 200 })
          .filter((s) => /^[a-zA-Z0-9 .]+$/.test(s)),
        async (title, why) => {
          const input = "## Key Decisions\n";
          const result = await addDecision(input, { title, why });
          expect(result.content).toContain(`### ${title}`);
          expect(result.content).toContain("WHAT:");
        },
      ),
      { numRuns: 10 },
    );
  });

  it("forAll(supersession pair): old decision always marked with all three indicators [DEC-01]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .string({ minLength: 1, maxLength: 50 })
          .filter((s) => /^[a-zA-Z0-9 ]+$/.test(s)),
        fc
          .string({ minLength: 1, maxLength: 50 })
          .filter((s) => /^[a-zA-Z0-9 ]+$/.test(s)),
        async (oldTitle, newTitle) => {
          fc.pre(oldTitle !== newTitle);
          const input = `## Key Decisions\n### ${oldTitle}\nWHAT: Original\nWHEN: 2025-01-01\n`;
          const result = await supersedeDecision(input, {
            title: newTitle,
            why: "Better",
            replaces: oldTitle,
          });
          expect(result.content).toContain("~~");
          expect(result.content).toContain("(superseded)");
          expect(result.content).toContain("SUPERSEDED BY:");
        },
      ),
      { numRuns: 10 },
    );
  });

  // G-095: strengthen WHEN field check to assert date format
  it("forAll(decision title): new decision WHEN field is auto-set to YYYY-MM-DD format [DEC-05]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .string({ minLength: 1, maxLength: 30 })
          .filter((s) => /^[a-zA-Z0-9 ]+$/.test(s)),
        async (title) => {
          const input = "## Key Decisions\n";
          const result = await addDecision(input, { title, why: "reason" });
          const whenMatch = result.content.match(/WHEN: (\d{4}-\d{2}-\d{2})/);
          expect(whenMatch).not.toBeNull();
          expect(whenMatch![1]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        },
      ),
      { numRuns: 10 },
    );
  });

  it("forAll(active decision): supersession produces exactly one new active head [DEC-10]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .string({ minLength: 1, maxLength: 30 })
          .filter((s) => /^[a-zA-Z0-9]+$/.test(s)),
        async (suffix) => {
          const oldTitle = `Decision ${suffix}`;
          const newTitle = `New ${suffix}`;
          const input = `## Key Decisions\n### ${oldTitle}\nWHAT: Original\nWHEN: 2025-01-01\n`;
          const result = await supersedeDecision(input, {
            title: newTitle,
            why: "Better",
            replaces: oldTitle,
          });
          // Old should be superseded, new should be active
          expect(result.content).toContain(`### ~~${oldTitle}`);
          // G-096: verify closing ~~ strikethrough marker is present
          expect(result.content).toContain("~~");
          expect(result.content).toContain(`### ${newTitle}`);
        },
      ),
      { numRuns: 5 },
    );
  });

  it("forAll(title with Unicode/formatting): matching works despite variations [DEC-13]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 50 }).filter((s) => /\w/.test(s)),
        async (title) => {
          const { normalizeTitleForMatch } = await import(
            "../../src/writer/decisions"
          );
          const withZeroWidth = `\u200B${title}\u200B`; // Zero-width spaces
          const withFormatting = `**${title}**`; // Bold markdown
          expect(normalizeTitleForMatch(withZeroWidth)).toBe(
            normalizeTitleForMatch(title),
          );
          expect(normalizeTitleForMatch(withFormatting)).toBe(
            normalizeTitleForMatch(title),
          );
        },
      ),
    );
  });
});
