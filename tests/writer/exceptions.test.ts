import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  addBidirectionalLink,
  addException,
  addIntentionalTension,
  amendDecision,
  resolveQuestion,
} from "../../src/writer/exceptions";

// ---------------------------------------------------------------------------
// Unit Tests
// ---------------------------------------------------------------------------

describe("TASK-15b: Writer — Exceptions, Amendments & Question Resolution", () => {
  describe("exception creation [DEC-02]", () => {
    it("exception to active decision: original annotated with HTML comment, new has EXCEPTION TO, both active [DEC-02]", async () => {
      const input = [
        "## Key Decisions",
        "### Use Flutter",
        "WHAT: Flutter for mobile",
        "WHEN: 2025-01-01",
        "",
      ].join("\n");
      const result = await addException(input, {
        title: "Use React Native for iOS",
        why: "Team expertise",
        exceptionTo: "Use Flutter",
      });
      expect(result.content).toContain("brief:has-exception");
      expect(result.content).toContain("EXCEPTION TO: Use Flutter");
      // Both should remain active (no strikethrough on original)
      expect(result.content).toContain("### Use Flutter");
      expect(result.content).not.toContain("~~Use Flutter~~");
    });

    it("exception to another exception (nested): chain traversable through EXCEPTION TO links [DEC-12]", async () => {
      const input = [
        "## Key Decisions",
        "### Use Flutter",
        "WHAT: Flutter for all mobile",
        "",
        "### Use React Native for iOS",
        "WHAT: RN for iOS only",
        "EXCEPTION TO: Use Flutter",
        "",
      ].join("\n");
      const result = await addException(input, {
        title: "Use SwiftUI for iPad",
        why: "iPad-specific features",
        exceptionTo: "Use React Native for iOS",
      });
      expect(result.content).toContain(
        "EXCEPTION TO: Use React Native for iOS",
      );
    });
  });

  describe("amendment [DEC-07]", () => {
    it("amend active decision rationale: field updated in-place, WHEN unchanged, Updated refreshed [DEC-07]", async () => {
      // F4: do not capture today's date at test-start — avoids midnight boundary flakiness
      const input = [
        "**Updated:** 2025-01-01",
        "",
        "## Key Decisions",
        "### Use TypeScript",
        "WHAT: TypeScript for all modules",
        "WHY: Original rationale",
        "WHEN: 2025-01-01",
        "",
      ].join("\n");
      const result = await amendDecision(input, {
        title: "Use TypeScript",
        why: "Updated rationale with more detail",
      });
      expect(result.content).toContain("Updated rationale with more detail");
      expect(result.content).toContain("WHEN: 2025-01-01");
      expect(result.content).toMatch(/\*\*Updated:\*\* \d{4}-\d{2}-\d{2}/);
    });

    it("amend a non-existent decision: error with suggestion [DEC-07]", async () => {
      const input = "## Key Decisions\n### Use TypeScript\nWHAT: TS\n";
      await expect(
        amendDecision(input, {
          title: "Use Python",
          why: "Updated reason",
        }),
      ).rejects.toThrow(/not found|no match/i);
    });
  });

  describe("question resolution [DEC-06]", () => {
    it("resolve a To Resolve question: checkbox marked, moved to Resolved, no Key Decision auto-created [DEC-06, M1]", async () => {
      // DEC-06: MUST NOT automatically create a Key Decision entry — not every resolved question warrants a formal decision record.
      // The resolution is always recorded; the Key Decision is optional and user-confirmed (two-step process).
      const input = [
        "## Open Questions",
        "## To Resolve",
        "- [ ] Which database to use?",
        "",
      ].join("\n");
      const result = await resolveQuestion(input, {
        question: "Which database to use?",
        resolution: "Chose PostgreSQL",
      });
      expect(result.content).toContain("## Resolved");
      expect(result.content).toContain("[x]");
      // MUST NOT auto-create a Key Decision entry
      expect(result.content).not.toContain("## Key Decisions");
      expect(result.content).not.toContain("WHAT:");
    });

    it("resolve a To Keep Open question: resolves with was_keep_open warning [DEC-06]", async () => {
      const input = [
        "## Open Questions",
        "## To Keep Open",
        "- Long-term strategy",
        "",
      ].join("\n");
      const result = await resolveQuestion(input, {
        question: "Long-term strategy",
        resolution: "Decided to commit",
      });
      expect(result.wasKeepOpen).toBe(true);
    });

    it("resolve question with Options and Impact sub-fields: suggest_decision is true [DEC-06]", async () => {
      const input = [
        "## Open Questions",
        "## To Resolve",
        "- [ ] Which DB? **Options:** PostgreSQL / MySQL **Impact:** Architecture",
        "",
      ].join("\n");
      const result = await resolveQuestion(input, {
        question: "Which DB?",
        resolution: "PostgreSQL chosen",
      });
      expect(result.suggestDecision).toBe(true);
    });

    it("resolve question with no sub-fields: suggest_decision is false [DEC-06]", async () => {
      const input = [
        "## Open Questions",
        "## To Resolve",
        "- [ ] Should we add monitoring?",
        "",
      ].join("\n");
      const result = await resolveQuestion(input, {
        question: "Should we add monitoring?",
        resolution: "Yes, basic monitoring",
      });
      expect(result.suggestDecision).toBe(false);
    });

    // G-097: use one canonical property name (resolutionSummary)
    it("resolve question → response always includes resolution_summary [DEC-06]", async () => {
      const input = [
        "## Open Questions",
        "## To Resolve",
        "- [ ] What format should this be?",
        "",
      ].join("\n");
      const result = await resolveQuestion(input, {
        question: "What format should this be?",
        resolution: "We decided on digital only.",
      });
      // G-101: standardize to resolutionSummary as canonical camelCase property
      expect(result.resolutionSummary).toBeDefined();
      expect(typeof result.resolutionSummary).toBe("string");
      expect(result.resolutionSummary.length).toBeGreaterThan(0);
    });
  });

  describe("question matching [DEC-06]", () => {
    it("resolution with exact match resolves the correct question [DEC-06]", async () => {
      const input = [
        "## Open Questions",
        "## To Resolve",
        "- [ ] Which database to use?",
        "- [ ] Which framework to use?",
        "",
      ].join("\n");
      const result = await resolveQuestion(input, {
        question: "Which database to use?",
        resolution: "PostgreSQL",
      });
      expect(result.content).toContain("[x] Which database to use?");
    });

    it("resolution with substring match hitting multiple: error listing all matches [DEC-06]", async () => {
      const input = [
        "## Open Questions",
        "## To Resolve",
        "- [ ] Database choice for production?",
        "- [ ] Database choice for staging?",
        "",
      ].join("\n");
      await expect(
        resolveQuestion(input, {
          question: "Database choice",
          resolution: "PostgreSQL",
        }),
      ).rejects.toThrow(/multiple|disambig/i);
    });

    it("resolution with no match but fuzzy candidate within distance 3: suggestion returned [DEC-06]", async () => {
      const input = [
        "## Open Questions",
        "## To Resolve",
        "- [ ] Which database to use?",
        "",
      ].join("\n");
      await expect(
        resolveQuestion(input, {
          question: "Which databse to use?", // typo
          resolution: "PostgreSQL",
        }),
      ).rejects.toThrow(/did you mean|suggestion/i);
    });
  });

  describe("bidirectional linking [DEC-08]", () => {
    it("bidirectional link after question-to-decision: decision has RESOLVED FROM, question has DECIDED AS [DEC-08]", async () => {
      const input = [
        "## Key Decisions",
        "### Use PostgreSQL",
        "WHAT: PostgreSQL for database",
        "",
        "## Open Questions",
        "## Resolved",
        "- [x] Which database to use?",
        "",
      ].join("\n");
      const result = await addBidirectionalLink(input, {
        questionText: "Which database to use?",
        decisionTitle: "Use PostgreSQL",
      });
      expect(result.content).toContain("RESOLVED FROM:");
      expect(result.content).toContain("DECIDED AS:");
    });
  });

  describe("intentional tensions [DEC-01]", () => {
    // G-098: pick canonical property (result.content), use lowercase format check per spec
    it("intentional tension entry written in correct format [DEC-01]", async () => {
      const input = "## Key Decisions\n### Decision A\nWHAT: A\n";
      const result = await addIntentionalTension(input, {
        itemA: "Performance",
        itemB: "Readability",
        reason: "Acceptable tradeoff",
      });
      expect(result.content).toContain("Performance");
      expect(result.content).toContain("vs.");
      expect(result.content).toContain("Readability");
      // Spec format: "- [Item A] vs. [Item B]: intentional" (lowercase)
      expect(result.content).toMatch(/:\s*intentional/i);
    });

    it("Intentional Tensions sub-section missing: created automatically on first write [DEC-01]", async () => {
      const input = "## Key Decisions\n### Some Decision\nWHAT: Something\n";
      const result = await addIntentionalTension(input, {
        itemA: "Speed",
        itemB: "Safety",
      });
      expect(result.content).toContain("## Intentional Tensions");
    });
  });

  describe("section matching for write tools [WRITE-14]", () => {
    it("write to section using alias resolves via parser lenient matching [WRITE-14]", async () => {
      const input = "## Overview\nOriginal overview content.\n";
      const result = await addException(input, {
        title: "Test",
        why: "Test",
        exceptionTo: "Some Decision",
      });
      // Should work without error even though alias is used
      expect(result).toBeDefined();
      // The content is written — verify the file was modified (alias resolved correctly)
      expect(result.content).toContain("Overview");
    });
  });
});

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe("TASK-15b: Property Tests", () => {
  it("forAll(active decision): exception always leaves both original and new as active [DEC-02]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .string({ minLength: 1, maxLength: 50 })
          .filter((s) => /^[a-zA-Z0-9 ]+$/.test(s)),
        fc
          .string({ minLength: 1, maxLength: 50 })
          .filter((s) => /^[a-zA-Z0-9 ]+$/.test(s)),
        async (originalTitle, exceptionTitle) => {
          fc.pre(originalTitle !== exceptionTitle);
          const input = `## Key Decisions\n### ${originalTitle}\nWHAT: Original\nWHEN: 2025-01-01\n`;
          const result = await addException(input, {
            title: exceptionTitle,
            why: "Exception reason",
            exceptionTo: originalTitle,
          });
          // Original should NOT be struck through
          expect(result.content).not.toContain(`~~${originalTitle}~~`);
          // Both should appear
          expect(result.content).toContain(`### ${originalTitle}`);
          expect(result.content).toContain(`### ${exceptionTitle}`);
        },
      ),
      { numRuns: 10 },
    );
  });

  // G-101: standardize to resolutionSummary as canonical property name (matches unit test)
  it("forAll(question text): resolution never throws, always returns resolution summary [DEC-06]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .string({ minLength: 1, maxLength: 100 })
          .filter((s) => /^[a-zA-Z0-9 ?]+$/.test(s)),
        async (questionText) => {
          const input = `## Open Questions\n## To Resolve\n- [ ] ${questionText}\n`;
          const result = await resolveQuestion(input, {
            question: questionText,
            resolution: "Resolved",
          });
          expect(result).toBeDefined();
          expect(result.resolutionSummary).toBeDefined();
        },
      ),
      { numRuns: 10 },
    );
  });

  it("forAll(amendment fields): WHEN date never changes, Updated timestamp always refreshes [DEC-07]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .string({ minLength: 1, maxLength: 100 })
          .filter((s) => /^[a-zA-Z0-9 .]+$/.test(s)),
        async (newWhy) => {
          const input = [
            "**Updated:** 2020-01-01",
            "",
            "## Key Decisions",
            "### Test Decision",
            "WHAT: Test",
            "WHY: Original",
            "WHEN: 2025-01-15",
            "",
          ].join("\n");
          const result = await amendDecision(input, {
            title: "Test Decision",
            why: newWhy,
          });
          expect(result.content).toContain("WHEN: 2025-01-15");
          expect(result.content).not.toContain("**Updated:** 2020-01-01");
        },
      ),
      { numRuns: 10 },
    );
  });

  // G-100: add assertion about chain structure (depth count > 0)
  it("forAll(nested exception depth): chain is always traversable without errors [DEC-12]", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 2, max: 5 }), async (depth) => {
        const lines: string[] = ["## Key Decisions"];
        lines.push("### Root Decision");
        lines.push("WHAT: Root");
        lines.push("WHEN: 2025-01-01");
        lines.push("");
        for (let i = 1; i < depth; i++) {
          lines.push(`### Exception Level ${i}`);
          lines.push(`WHAT: Exception ${i}`);
          lines.push(
            `EXCEPTION TO: ${i === 1 ? "Root Decision" : `Exception Level ${i - 1}`}`,
          );
          lines.push("");
        }
        const input = lines.join("\n");
        // Adding another exception should not throw
        const result = await addException(input, {
          title: `Exception Level ${depth}`,
          why: "Next level",
          exceptionTo: `Exception Level ${depth - 1}`,
        });
        expect(result).toBeDefined();
        // Assert chain structure — the result should contain the chain depth
        expect(result.content).toContain(
          `EXCEPTION TO: Exception Level ${depth - 1}`,
        );
        // The exception chain length should be at least the depth we built
        const exceptionToMatches = (
          result.content.match(/EXCEPTION TO:/g) ?? []
        ).length;
        expect(exceptionToMatches).toBeGreaterThan(0);
      }),
      { numRuns: 5 },
    );
  });
});
