import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  classifySection,
  parseReferenceList,
  parseSections,
  resolveAlias,
} from "../../src/parser/sections";

// ---------------------------------------------------------------------------
// Unit Tests
// ---------------------------------------------------------------------------

describe("TASK-10: Parser — Sections & Headings", () => {
  describe("canonical heading resolution [PARSE-02]", () => {
    it("canonical heading ## What This Is resolves to core section [PARSE-02]", () => {
      const input = "## What This Is\nSome description content\n";
      const result = parseSections(input);
      const section = result.find((s) => s.canonicalName === "What This Is");
      expect(section).toBeDefined();
      expect(section!.classification).toBe("core");
    });

    it("mixed-case and ALL CAPS variants resolve to same canonical section [PARSE-02]", () => {
      const r1 = resolveAlias("what this is");
      const r2 = resolveAlias("WHAT THIS IS");
      const r3 = resolveAlias("What This Is");
      expect(r1).toBe(r2);
      expect(r2).toBe(r3);
    });
  });

  describe("alias resolution [PARSE-03]", () => {
    it('alias ## Overview resolves to core "What This Is" [PARSE-03]', () => {
      const result = resolveAlias("Overview");
      expect(result).toBe("What This Is");
    });

    it("each built-in alias resolves to correct canonical section [PARSE-03]", () => {
      expect(resolveAlias("What It Is")).toBe("What This Is");
      expect(resolveAlias("Description")).toBe("What This Is");
      expect(resolveAlias("About")).toBe("What This Is");
      expect(resolveAlias("Motivation")).toBe("Why This Exists");
      expect(resolveAlias("Purpose")).toBe("Why This Exists");
      expect(resolveAlias("Decisions")).toBe("Key Decisions");
      expect(resolveAlias("Design Decisions")).toBe("Key Decisions");
      expect(resolveAlias("Questions")).toBe("Open Questions");
      expect(resolveAlias("Constraints")).toBe("What This Is NOT");
    });

    // G-061: verify user-defined alias resolves correctly (not just a built-in)
    it("user alias resolves; user override of built-in preserves built-in [PARSE-03]", () => {
      // User aliases are additive only
      const result = resolveAlias("Overview", {
        userAliases: { Overview: "What This Is" },
      });
      expect(result).toBe("What This Is");
      // Also verify a purely user-defined alias resolves
      const custom = resolveAlias("MySummary", {
        userAliases: { MySummary: "What This Is" },
      });
      expect(custom).toBe("What This Is");
    });

    // G-062: fix bundled language alias test — use parseSections array directly, specific toBe assertion
    it('bundled language alias (German "Was das ist") → canonical section name returned [PARSE-03]', async () => {
      const { parseSections } = await import("../../src/parser/sections");
      const result = parseSections("## Was das ist\nInhalt\n");
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].canonicalName).toBe("What This Is");
    });

    // G-063: use import() instead of require(); verify correct canonical target
    it("user-defined alias from config → resolved to target section [PARSE-03]", async () => {
      const { parseSections } = await import("../../src/parser/sections");
      const result = parseSections("## My Custom Heading\nContent\n", {
        aliases: { "My Custom Heading": "Direction" },
      });
      expect(result[0].canonicalName).toBe("Direction");
    });

    // G-064: replace require() with import(); add positive assertion of what it SHOULD be
    it("user alias cannot override built-in alias [PARSE-03]", async () => {
      const { parseSections } = await import("../../src/parser/sections");
      // "Overview" is a built-in alias for "What This Is" — user cannot reassign it
      const result = parseSections("## Overview\nContent\n", {
        aliases: { Overview: "Direction" }, // attempt to override
      });
      // Should still resolve to the built-in target, not the user's target
      expect(result[0].canonicalName).not.toBe("Direction");
      // Positive assertion: built-in alias wins
      expect(result[0].canonicalName).toBe("What This Is");
    });
  });

  describe("heading attributes and trailing hashes [PARSE-03]", () => {
    it("trailing hashes and {...} attributes stripped before matching [PARSE-03]", () => {
      const input = "## What This Is ## {#custom-id}\nContent\n";
      const result = parseSections(input);
      const section = result.find((s) => s.canonicalName === "What This Is");
      expect(section).toBeDefined();
    });
  });

  describe("flexible heading levels [PARSE-05]", () => {
    it("H1, H2, H3 for same name all resolve identically [PARSE-05]", () => {
      const input1 = "# What This Is\nContent\n";
      const input2 = "## What This Is\nContent\n";
      const input3 = "### What This Is\nContent\n";
      const r1 = parseSections(input1);
      const r2 = parseSections(input2);
      const r3 = parseSections(input3);
      expect(r1[0].canonicalName).toBe(r2[0].canonicalName);
      expect(r2[0].canonicalName).toBe(r3[0].canonicalName);
    });
  });

  describe("code block awareness [PARSE-15]", () => {
    it("heading inside fenced code block is not a section [PARSE-15]", () => {
      const input = "## Real Section\nContent\n```\n## Not A Section\n```\n";
      const result = parseSections(input);
      const fakeSection = result.find((s) => s.headingText === "Not A Section");
      expect(fakeSection).toBeUndefined();
    });

    it("heading inside indented code block is not a section [PARSE-15]", () => {
      const input =
        "## Real Section\nContent\n\n    ## Not A Section\n\nMore content\n";
      const result = parseSections(input);
      const fakeSection = result.find((s) => s.headingText === "Not A Section");
      expect(fakeSection).toBeUndefined();
    });
  });

  describe("section ordering and content [PARSE-09]", () => {
    it("sections in non-canonical order are all parsed correctly [PARSE-09]", () => {
      const input =
        "## Open Questions\nQ content\n## What This Is\nDesc content\n## Key Decisions\nDec content\n";
      const result = parseSections(input);
      expect(result).toHaveLength(3);
      expect(result[0].canonicalName).toBe("Open Questions");
      expect(result[1].canonicalName).toBe("What This Is");
    });

    it("section body captured up to next equal-or-higher heading [PARSE-09]", () => {
      const input =
        "## Section One\nBody line 1\nBody line 2\n## Section Two\nOther body\n";
      const result = parseSections(input);
      expect(result[0].body).toContain("Body line 1");
      expect(result[0].body).toContain("Body line 2");
      expect(result[0].body).not.toContain("Other body");
    });
  });

  describe("heading depth [PARSE-17]", () => {
    it("H4 is structural sub-heading within section; H5/H6 are content-level only [PARSE-17]", () => {
      const input =
        "## Key Decisions\n#### Context\nSome context\n##### Note\nA note\n";
      const result = parseSections(input);
      // H4 is structural within the section, H5/H6 are content-level, not boundaries
      expect(result).toHaveLength(1);
      expect(result[0].body).toContain("Note");
    });
  });

  describe("extension sections [PARSE-13]", () => {
    it("section matching a known extension name is classified as extension [PARSE-13]", () => {
      // Extension sections have classification = 'extension', not 'core' or 'project-specific'
      const input = "## SONIC ARTS\nExtension content for sonic arts\n";
      const result = parseSections(input);
      expect(result[0]).toBeDefined();
      expect(result[0].classification).toBe("extension");
    });

    it("classifySection returns extension for known extension heading names [PARSE-13]", () => {
      // SONIC ARTS, NARRATIVE CREATIVE, etc. are known extension headings
      const result = classifySection("SONIC ARTS");
      expect(result).toBe("extension");
    });

    it("extension section heading preserved with original casing [PARSE-13]", () => {
      const input = "## SONIC ARTS\nContent\n";
      const result = parseSections(input);
      expect(result[0].headingText).toBe("SONIC ARTS");
    });
  });

  describe("unknown and project-specific sections [PARSE-06, COMPAT-02]", () => {
    it("unknown heading preserved as project-specific [PARSE-06]", () => {
      const input = "## My Custom Section\nCustom content\n";
      const result = parseSections(input);
      expect(result[0].classification).toBe("project-specific");
      expect(result[0].headingText).toBe("My Custom Section");
    });

    it("unrecognised ALL CAPS heading is project-specific, not rejected [COMPAT-02]", () => {
      const input = "## UNKNOWN EXTENSION\nContent\n";
      const result = parseSections(input);
      expect(result[0].classification).toBe("project-specific");
    });
  });

  describe("tool-specific sections [PARSE-14]", () => {
    it('# TOOL SPECIFIC: Cursor detected as tool-scoped with name "Cursor" [PARSE-14]', () => {
      const input = "# TOOL SPECIFIC: Cursor\nCursor-specific content\n";
      const result = parseSections(input);
      expect(result[0].classification).toBe("tool-specific");
      expect(result[0].toolName).toBe("Cursor");
    });
  });

  describe("empty and edge cases [PARSE-19]", () => {
    it("empty file produces zero sections, no error [PARSE-19]", () => {
      const result = parseSections("");
      expect(result).toHaveLength(0);
    });

    it("BOM and CRLF content handled gracefully [PARSE-19]", () => {
      const input = "\uFEFF## What This Is\r\nContent\r\n";
      const result = parseSections(input);
      expect(result.length).toBe(1);
    });

    it("Setext underline not recognised as heading [PARSE-05]", () => {
      const input = "What This Is\n============\nContent\n";
      const result = parseSections(input);
      // Setext not supported — should not create a section
      const section = result.find((s) => s.canonicalName === "What This Is");
      expect(section).toBeUndefined();
    });

    it("consecutive headings produce sections with empty body preserved [PARSE-09]", () => {
      const input = "## Section A\n## Section B\nBody of B\n";
      const result = parseSections(input);
      expect(result).toHaveLength(2);
      expect(result[0].body.trim()).toBe("");
    });
  });

  describe("duplicate section headings [OQ-010]", () => {
    it("two sections with same heading have content concatenated in document order as single section [OQ-010]", () => {
      const input =
        "## What This Is\nFirst content\n## Key Decisions\nDecision\n## What This Is\nSecond content\n";
      const result = parseSections(input);
      const whatSections = result.filter(
        (s) => s.canonicalName === "What This Is",
      );
      expect(whatSections).toHaveLength(1);
      expect(whatSections[0].body).toContain("First content");
      expect(whatSections[0].body).toContain("Second content");
      // T10-02: parseSections returns an array; warnings are attached to the merged section, not the array.
      // Use the section's own `hasDuplicate` flag (canonical) rather than accessing `result.warnings` on the array.
      expect(whatSections[0].hasDuplicate).toBe(true);
    });
  });

  describe("extension reference subsections [PARSE-16]", () => {
    it("## References: Musical subsection parsed as structured reference list [PARSE-16]", () => {
      const input =
        "## SONIC ARTS\nContent\n## References: Musical\n- John Coltrane: A Love Supreme (modal jazz)\n";
      const result = parseSections(input);
      const section = result.find((s) => s.headingText === "SONIC ARTS");
      expect(section).toBeDefined();
      expect(section!.subsections).toBeDefined();
      expect(
        section!.subsections!.some((s: any) => /references/i.test(s.type)),
      ).toBe(true);
    });

    it("reference list item parsed with creator, title, notes fields [PARSE-16]", () => {
      const item = "John Coltrane: A Love Supreme (modal jazz)";
      const parsed = parseReferenceList([item]);
      expect(parsed[0].creator).toBe("John Coltrane");
      expect(parsed[0].title).toBe("A Love Supreme");
      expect(parsed[0].notes).toBe("modal jazz");
    });
  });
});

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe("TASK-10: Property Tests", () => {
  it("forAll(heading text): case-insensitive matching produces same canonical name regardless of casing [PARSE-02]", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          "What This Is",
          "Why This Exists",
          "Key Decisions",
          "Open Questions",
          "What This Is NOT",
        ),
        (canonicalName) => {
          const lower = resolveAlias(canonicalName.toLowerCase());
          const upper = resolveAlias(canonicalName.toUpperCase());
          expect(lower).toBe(upper);
        },
      ),
    );
  });

  it("forAll(heading level in 1..3, section name): flexible level always resolves the section [PARSE-05]", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 3 }),
        fc.constantFrom("What This Is", "Key Decisions", "Open Questions"),
        (level, name) => {
          const prefix = "#".repeat(level);
          const input = `${prefix} ${name}\nContent here\n`;
          const result = parseSections(input);
          expect(result.length).toBeGreaterThanOrEqual(1);
          expect(result[0].canonicalName).toBe(name);
        },
      ),
    );
  });

  it("forAll(valid BRIEF.md content): parser never throws, always returns structured result [PARSE-01]", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 5000 }), (content) => {
        const result = parseSections(content);
        expect(result).toBeDefined();
        expect(Array.isArray(result)).toBe(true);
      }),
    );
  });

  it("forAll(list of sections in any order): parsed count equals headings outside code blocks [PARSE-09]", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc
            .string({ minLength: 1, maxLength: 20 })
            .filter((s) => /^[a-zA-Z ]+$/.test(s)),
          { minLength: 1, maxLength: 8 },
        ),
        (names) => {
          const content = names
            .map((n) => `## ${n}\nContent for ${n}\n`)
            .join("");
          const result = parseSections(content);
          const headingCount = (content.match(/^## /gm) ?? []).length;
          // G-067: lower bound check is acceptable — leave as is
          expect(result.length).toBeGreaterThanOrEqual(headingCount);
          expect(result.length).toBeLessThanOrEqual(names.length);
        },
      ),
    );
  });

  it("forAll(content with # lines inside code blocks): no code-block line appears as section [PARSE-15]", () => {
    fc.assert(
      fc.property(
        fc
          .string({ minLength: 1, maxLength: 30 })
          .filter((s) => /^[a-zA-Z ]+$/.test(s)),
        (name) => {
          const input = `## Real\nBody\n\`\`\`\n## ${name}\n\`\`\`\n`;
          const result = parseSections(input);
          const fakeSection = result.find((s) => s.headingText === name);
          expect(fakeSection).toBeUndefined();
        },
      ),
    );
  });

  // G-068: exclude known aliases from heading generation
  it("forAll(unknown section heading): heading text preserved exactly as written [PARSE-06]", async () => {
    const knownAliases = [
      "What This Is",
      "What It Is",
      "Description",
      "About",
      "Overview",
      "Why This Exists",
      "Motivation",
      "Purpose",
      "Reason",
      "Intent",
      "Goal",
      "Key Decisions",
      "Decisions",
      "Decisions Made",
      "Design Decisions",
      "Open Questions",
      "Questions",
      "Unresolved",
      "What This Is NOT",
      "What It Is Not",
      "Constraints",
      "Exclusions",
      "Not This",
    ];
    await fc.assert(
      fc.asyncProperty(
        fc
          .string({ minLength: 3, maxLength: 30 })
          .filter(
            (s) =>
              !s.startsWith("#") &&
              /\w/.test(s) &&
              !/[{}<>`[\]]/.test(s) &&
              s.trim().length > 0,
          )
          .filter(
            (s) =>
              !knownAliases.some(
                (alias) => alias.toLowerCase() === s.toLowerCase(),
              ),
          ),
        async (heading) => {
          const content = `## ${heading}\n\nSome content.\n`;
          const result = parseSections(content); // parseSections is synchronous
          expect(result.length).toBeGreaterThan(0);
          expect(result[0].headingText).toBe(heading);
          expect(result[0].classification).toBe("project-specific");
        },
      ),
    );
  });
});
