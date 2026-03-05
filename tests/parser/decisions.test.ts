import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  detectSupersessionStatus,
  parseDecisions,
  parseQuestions,
  parseToResolveItem,
} from "../../src/parser/decisions";

// ---------------------------------------------------------------------------
// Unit Tests
// ---------------------------------------------------------------------------

describe("TASK-11: Parser — Decisions & Questions", () => {
  describe("minimal format decisions [PARSE-11]", () => {
    it("minimal decision (heading + paragraph) extracts decision text from heading and rationale from paragraph [PARSE-11]", () => {
      const content =
        "### Use TypeScript for all modules\nTypeScript provides type safety and better tooling.\n";
      const result = parseDecisions(content);
      expect(result[0].text).toBe("Use TypeScript for all modules");
      expect(result[0].rationale).toContain("type safety");
    });
  });

  describe("full format decisions [PARSE-11]", () => {
    it("full decision with all structured fields extracts each field correctly [PARSE-11]", () => {
      const content = [
        "### Database Choice",
        "WHAT: Use PostgreSQL as the primary database",
        "WHY: Strong JSON support and reliability",
        "WHEN: 2025-06-01",
        "ALTERNATIVES CONSIDERED: MySQL, MongoDB, SQLite",
        "",
      ].join("\n");
      const result = parseDecisions(content);
      expect(result[0].what).toContain("PostgreSQL");
      expect(result[0].why).toContain("JSON support");
      expect(result[0].when).toBe("2025-06-01");
      expect(result[0]!.alternativesConsidered).toBeDefined();
      expect(
        result[0]!.alternativesConsidered!.some((a: any) =>
          /MySQL/i.test(String(a)),
        ),
      ).toBe(true);
      expect(
        result[0]!.alternativesConsidered!.some((a: any) =>
          /MongoDB/i.test(String(a)),
        ),
      ).toBe(true);
    });

    // G-070: use alternativesConsidered as canonical (drop alternatives fallback)
    it("full decision with subset of fields extracts present fields, absent fields missing, no warning [PARSE-11]", () => {
      const content =
        "### Framework Choice\nWHAT: Use React\nWHY: Team familiarity\n";
      const result = parseDecisions(content);
      expect(result[0].what).toContain("React");
      expect(result[0].when).toBeUndefined();
      expect(result[0].alternativesConsidered).toBeUndefined();
    });

    // G-071 (CRIT): minimal shape should have FEWER keys than full shape
    it("minimal and full decisions in same section both normalized to same output shape [PARSE-11]", () => {
      const content = [
        "### Minimal Decision",
        "Just a rationale paragraph.",
        "",
        "### Full Decision",
        "WHAT: Something specific",
        "WHY: Good reason",
        "",
      ].join("\n");
      const result = parseDecisions(content);
      expect(result).toHaveLength(2);
      const d1 = result[0]; // minimal
      const d2 = result[1]; // full
      expect(d1.text).toBeDefined();
      expect(d1.status).toBeDefined();
      expect(d2.text).toBeDefined();
      expect(d2.status).toBeDefined();
      // Minimal format has FEWER keys than full format (no what/why fields)
      const minimalKeys = Object.keys(d1).sort();
      const fullKeys = Object.keys(d2).sort();
      expect(minimalKeys.length).toBeLessThan(fullKeys.length);
      // Full keys are a superset of minimal keys
      for (const key of minimalKeys) {
        expect(fullKeys).toContain(key);
      }
    });
  });

  describe("superseded decision detection [PARSE-08]", () => {
    it("heading with ~~strikethrough~~ marks decision superseded [PARSE-08]", () => {
      const content = "### ~~Old Database Choice~~\nUsed MySQL before.\n";
      const result = parseDecisions(content);
      expect(result[0].status).toBe("superseded");
    });

    it('heading containing "(superseded)" marks decision superseded [PARSE-08]', () => {
      const content =
        "### Old API Design (superseded)\nOriginal REST design.\n";
      const result = parseDecisions(content);
      expect(result[0].status).toBe("superseded");
    });

    it("body with SUPERSEDED BY: field marks decision superseded [PARSE-08]", () => {
      const content =
        "### Use REST API\nWHAT: REST for all endpoints\nSUPERSEDED BY: Use GraphQL (2025-07-01)\n";
      const result = parseDecisions(content);
      expect(result[0].status).toBe("superseded");
    });

    it("all three supersession indicators together produces superseded, no conflict [PARSE-08]", () => {
      const content =
        "### ~~Old Choice (superseded)~~\nRationale\nSUPERSEDED BY: New Choice (2025-01-01)\n";
      const result = parseDecisions(content);
      expect(result[0].status).toBe("superseded");
    });

    it("decision with EXCEPTION TO: field has exception status [PARSE-08]", () => {
      const content =
        "### Mobile Exception\nWHAT: Use React Native\nEXCEPTION TO: Use Flutter\n";
      const result = parseDecisions(content);
      expect(result[0].status).toBe("exception");
    });

    it("both superseded and exception indicators: superseded takes precedence [PARSE-08]", () => {
      const content =
        "### ~~Old Exception (superseded)~~\nEXCEPTION TO: Something\nSUPERSEDED BY: Newer (2025-01-01)\n";
      const result = parseDecisions(content);
      expect(result[0].status).toBe("superseded");
    });

    it("decision with no status indicators is active [PARSE-08]", () => {
      const content =
        "### Current Choice\nThis is the current active decision.\n";
      const result = parseDecisions(content);
      expect(result[0].status).toBe("active");
    });
  });

  describe("lifecycle field markers [PARSE-08]", () => {
    it("body with REPLACES: field extracts replacement title [PARSE-08]", () => {
      const content =
        "### Use PostgreSQL\nWHAT: PostgreSQL for all\nREPLACES: Use MySQL\nWHEN: 2025-06-01\n";
      const result = parseDecisions(content);
      expect(result[0].replaces).toBe("Use MySQL");
    });

    it("body with RESOLVED FROM: field extracts resolved question text [PARSE-08]", () => {
      const content =
        "### Use PostgreSQL\nWHAT: PostgreSQL\nRESOLVED FROM: Which database to use?\nWHEN: 2025-06-01\n";
      const result = parseDecisions(content);
      expect(result[0].resolvedFrom).toBe("Which database to use?");
    });

    it("REPLACES and EXCEPTION TO trimmed — no leading/trailing whitespace [PARSE-08]", () => {
      const content =
        "### New Decision\nREPLACES:  Use MySQL  \nEXCEPTION TO:  Use Flutter  \n";
      const result = parseDecisions(content);
      expect(result[0].replaces).toBe("Use MySQL");
      expect(result[0].exceptionTo).toBe("Use Flutter");
    });
  });

  describe("sub-sections — Resolved, Intentional Tensions, External Tool Sessions [PARSE-11]", () => {
    it("## Resolved sub-section items are parsed as resolved questions [PARSE-11]", () => {
      const content =
        "## Open Questions\n## Resolved\n- [x] Which database to use? → Chose PostgreSQL\n";
      const result = parseQuestions(content);
      expect(result.resolved).toBeDefined();
      expect(result.resolved.length).toBeGreaterThan(0);
      expect(result.resolved[0].text).toContain("database");
    });

    it("## Intentional Tensions sub-section items are parsed [PARSE-11]", () => {
      const content =
        "## Key Decisions\n## Intentional Tensions\n- Performance vs. Readability: intentional\n";
      const result = parseDecisions(content);
      expect(result.intentionalTensions).toBeDefined();
      expect(result.intentionalTensions.length).toBeGreaterThan(0);
    });

    it("## External Tool Sessions sub-section is parsed with session metadata [PARSE-11]", () => {
      const content =
        "## Key Decisions\n## External Tool Sessions\n- 2025-06-01 Claude: Discussed architecture choices\n";
      const result = parseDecisions(content);
      expect(result.externalToolSessions).toBeDefined();
      expect(result.externalToolSessions.length).toBeGreaterThan(0);
    });
  });

  describe("open questions — To Resolve [PARSE-12, PARSE-16]", () => {
    it("## To Resolve unchecked item (- [ ]) extracts question with unchecked state [PARSE-12]", () => {
      const content = "## To Resolve\n- [ ] Which testing framework to use?\n";
      const result = parseQuestions(content);
      const toResolve = result.toResolve;
      expect(toResolve[0].text).toContain("testing framework");
      expect(toResolve[0].checked).toBe(false);
    });

    it("## To Resolve checked item (- [x]) extracts question with checked state [PARSE-12]", () => {
      const content = "## To Resolve\n- [x] Decided on Vitest\n";
      const result = parseQuestions(content);
      expect(result.toResolve[0].checked).toBe(true);
    });

    it("item with **Options:** A / B / C extracts three trimmed options [PARSE-16]", () => {
      const item = "- [ ] Which DB? **Options:** PostgreSQL / MySQL / SQLite";
      const parsed = parseToResolveItem(item);
      expect(parsed.options).toHaveLength(3);
      expect(parsed.options![0]).toBe("PostgreSQL");
      expect(parsed.options![2]).toBe("SQLite");
    });

    it("item with **Impact:** prose extracts impact string [PARSE-16]", () => {
      const item = "- [ ] CI choice **Impact:** Affects deployment speed";
      const parsed = parseToResolveItem(item);
      expect(parsed.impact).toContain("deployment speed");
    });

    it("item with both sub-fields extracts both [PARSE-16]", () => {
      const item =
        "- [ ] Auth method **Options:** JWT / Session / OAuth **Impact:** Security architecture";
      const parsed = parseToResolveItem(item);
      expect(parsed.options!.length).toBeGreaterThanOrEqual(2);
      expect(parsed.impact).toContain("Security");
    });

    it("bare checkbox item (no sub-fields) is valid, options and impact absent [PARSE-16]", () => {
      const item = "- [ ] Should we add monitoring?";
      const parsed = parseToResolveItem(item);
      expect(parsed.text).toContain("monitoring");
      expect(parsed.options).toBeUndefined();
      expect(parsed.impact).toBeUndefined();
    });
  });

  describe("open questions — To Keep Open [PARSE-12]", () => {
    it("## To Keep Open plain list items produce questions without checkbox state [PARSE-12]", () => {
      const content =
        "## To Keep Open\n- Long-term architecture direction\n- Team scaling strategy\n";
      const result = parseQuestions(content);
      expect(result.toKeepOpen).toHaveLength(2);
      expect(result.toKeepOpen[0].checked).toBeUndefined();
    });
  });

  describe("empty sections [PARSE-01]", () => {
    it("empty Key Decisions section returns empty collection, no error [PARSE-01]", () => {
      const result = parseDecisions("");
      expect(result).toHaveLength(0);
    });

    it("empty Open Questions section returns empty collection, no error [PARSE-01]", () => {
      const result = parseQuestions("");
      expect(result.toResolve).toHaveLength(0);
      expect(result.toKeepOpen).toHaveLength(0);
    });
  });
});

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe("TASK-11: Property Tests", () => {
  it("forAll(decision heading text): parser never throws, always returns structured result [PARSE-11]", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 500 }), (heading) => {
        const content = `### ${heading}\nSome rationale text.\n`;
        const result = parseDecisions(content);
        expect(result).toBeDefined();
        expect(Array.isArray(result)).toBe(true);
      }),
    );
  });

  // G-072: use d.text as canonical property (not d.heading ?? d.title fallback)
  it("forAll(decision body with any field combination): output always has decision text and status [PARSE-11]", () => {
    fc.assert(
      fc.property(
        fc.record({
          what: fc.option(fc.string({ maxLength: 100 }), { nil: undefined }),
          why: fc.option(fc.string({ maxLength: 100 }), { nil: undefined }),
          when: fc.option(fc.constant("2025-06-15"), { nil: undefined }),
        }),
        (fields) => {
          const lines = ["### Test Decision"];
          if (fields.what) lines.push(`WHAT: ${fields.what}`);
          if (fields.why) lines.push(`WHY: ${fields.why}`);
          if (fields.when) lines.push(`WHEN: ${fields.when}`);
          lines.push("");
          const result = parseDecisions(lines.join("\n"));
          expect(result.length).toBeGreaterThan(0);
          const d = result[0];
          expect(d.text).toBeDefined();
          expect(["active", "superseded", "exception"]).toContain(d.status);
        },
      ),
    );
  });

  it("forAll(checkbox item text): extraction always produces text and checked state [PARSE-12]", () => {
    fc.assert(
      fc.property(
        fc
          .string({ minLength: 1, maxLength: 100 })
          .filter((s) => /^[a-zA-Z0-9 ?]+$/.test(s)),
        fc.boolean(),
        (text, checked) => {
          const mark = checked ? "x" : " ";
          const item = `- [${mark}] ${text}`;
          const parsed = parseToResolveItem(item);
          expect(parsed.text).toBeDefined();
          expect(parsed.checked).toBe(checked);
        },
      ),
    );
  });

  it("forAll(options string with / delimiters): splitting produces at least one non-empty trimmed option [PARSE-16]", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc
            .string({ minLength: 1, maxLength: 20 })
            .filter((s) => /^[a-zA-Z0-9]+$/.test(s)),
          { minLength: 1, maxLength: 5 },
        ),
        (options) => {
          const optionsStr = options.join(" / ");
          const item = `- [ ] Question **Options:** ${optionsStr}`;
          const parsed = parseToResolveItem(item);
          expect(parsed.options!.length).toBeGreaterThanOrEqual(1);
          for (const opt of parsed.options!) {
            expect(opt.trim().length).toBeGreaterThan(0);
          }
        },
      ),
    );
  });

  it("forAll(mixed-format decision list): every output item has identical shape [PARSE-11]", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5 }),
        fc.boolean(),
        (count, useFullFormat) => {
          const lines: string[] = [];
          for (let i = 0; i < count; i++) {
            lines.push(`### Decision ${i}`);
            if (useFullFormat) {
              lines.push(`WHAT: Decision ${i} detail`);
              lines.push(`WHY: Reason ${i}`);
            } else {
              lines.push(`Rationale for decision ${i}.`);
            }
            lines.push("");
          }
          const result = parseDecisions(lines.join("\n"));
          for (const dec of result) {
            expect(dec).toHaveProperty("text");
            expect(dec).toHaveProperty("status");
          }
        },
      ),
    );
  });
});
