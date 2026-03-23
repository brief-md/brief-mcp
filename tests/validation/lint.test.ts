import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { lintBrief } from "../../src/validation/lint";

// ---------------------------------------------------------------------------
// Unit Tests
// ---------------------------------------------------------------------------

describe("TASK-29: Validation — Lint Tool", () => {
  describe("required metadata [VALID-01]", () => {
    it("file missing Project metadata: error-level finding [VALID-01]", async () => {
      const result = await lintBrief(
        "**Type:** song\n**Created:** 2025-01-01\n## What This Is\nContent\n",
      );
      const errors = result.findings.filter(
        (f: any) => f.severity === "error" && /project/i.test(f.message),
      );
      expect(errors.length).toBeGreaterThan(0);
    });

    it("file missing Type metadata: error-level finding [VALID-01]", async () => {
      const result = await lintBrief(
        "**Project:** Test\n**Created:** 2025-01-01\n## What This Is\nContent\n",
      );
      const errors = result.findings.filter(
        (f: any) => f.severity === "error" && /type/i.test(f.message),
      );
      expect(errors.length).toBeGreaterThan(0);
    });

    it("file missing Created metadata: error-level finding [VALID-01]", async () => {
      const result = await lintBrief(
        "**Project:** Test\n**Type:** song\n## What This Is\nContent\n",
      );
      const errors = result.findings.filter(
        (f: any) => f.severity === "error" && /created/i.test(f.message),
      );
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe("required sections [VALID-02]", () => {
    it("file with zero core sections: error-level finding [VALID-02]", async () => {
      const result = await lintBrief(
        "**Project:** Test\n**Type:** song\n**Created:** 2025-01-01\n",
      );
      const errors = result.findings.filter(
        (f: any) => f.severity === "error" && /section/i.test(f.message),
      );
      expect(errors.length).toBeGreaterThan(0);
    });

    it('file with all required metadata and one core section: passes "valid" tier [VALID-02]', async () => {
      const result = await lintBrief(
        "**Project:** Test\n**Type:** song\n**Created:** 2025-01-01\n## What This Is\nA song about testing.\n",
      );
      const errors = result.findings.filter((f: any) => f.severity === "error");
      expect(errors).toHaveLength(0);
    });
  });

  describe("completeness warnings [VALID-03]", () => {
    it("file missing two core sections: warning-level findings for each [VALID-03]", async () => {
      const result = await lintBrief(
        "**Project:** Test\n**Type:** song\n**Created:** 2025-01-01\n## What This Is\nContent\n",
      );
      const warnings = result.findings.filter(
        (f: any) => f.severity === "warning" && /section/i.test(f.message),
      );
      expect(warnings.length).toBeGreaterThanOrEqual(4);
    });

    it("file with inconsistent heading levels: warning-level finding [VALID-03]", async () => {
      const result = await lintBrief(
        "**Project:** Test\n**Type:** song\n**Created:** 2025-01-01\n## What This Is\nContent\n### Key Decisions\nDecisions\n",
      );
      // Different heading levels for sibling sections should produce a warning
      expect(result.findings).toBeDefined();
      const warnings = result.findings.filter(
        (f: any) => f.severity === "warning",
      );
      expect(warnings.length).toBeGreaterThan(0);
      expect(
        warnings.some((w: any) =>
          /heading|level|inconsistent/i.test(w.message),
        ),
      ).toBe(true);
    });
  });

  describe("referential integrity [VALID-05]", () => {
    it("file with REPLACES pointing to non-existent decision: warning-level finding [VALID-05]", async () => {
      const content = [
        "**Project:** Test",
        "**Type:** song",
        "**Created:** 2025-01-01",
        "## Key Decisions",
        "### New Decision",
        "WHAT: New",
        "REPLACES: Phantom Decision",
        "",
      ].join("\n");
      const result = await lintBrief(content);
      const warnings = result.findings.filter(
        (f: any) =>
          f.severity === "warning" && /replaces|reference/i.test(f.message),
      );
      expect(warnings.length).toBeGreaterThan(0);
    });

    it("file with orphaned ontology tag: warning-level finding [VALID-05]", async () => {
      const content = [
        "**Project:** Test",
        "**Type:** song",
        "**Created:** 2025-01-01",
        "## What This Is",
        "Content",
        '<!-- brief:ontology nonexistent-pack entry-1 "Label" -->',
        "",
      ].join("\n");
      const result = await lintBrief(content);
      const warnings = result.findings.filter(
        (f: any) => f.severity === "warning" && /orphan/i.test(f.message),
      );
      expect(warnings.length).toBeGreaterThan(0);
    });

    it("file with orphaned ref-link comment (referenced entry no longer exists) → info-level finding [VALID-05]", async () => {
      const content = `**Project:** Test\n**Type:** song\n**Created:** 2024-01-01\n\n## Direction\n\nSome content.\n<!-- brief:ref-link pack="old-pack" entry="deleted-entry" -->\n`;
      const result = await lintBrief(content, {
        installedPacks: [], // No packs installed, so the ref-link is orphaned
      });
      const infoFindings = result.findings.filter(
        (f: any) => f.severity === "info",
      );
      expect(
        infoFindings.some((f: any) =>
          /ref.link|orphan|missing/i.test(f.message),
        ),
      ).toBe(true);
    });
  });

  describe("info-level findings [VALID-04, VALID-06]", () => {
    it("file with CRLF line endings: info-level finding [VALID-06]", async () => {
      const result = await lintBrief(
        "**Project:** Test\r\n**Type:** song\r\n**Created:** 2025-01-01\r\n## What This Is\r\nContent\r\n",
      );
      const info = result.findings.filter(
        (f: any) =>
          f.severity === "info" && /crlf|line ending/i.test(f.message),
      );
      expect(info.length).toBeGreaterThan(0);
    });

    it("file exceeding 1000 lines: info-level finding [VALID-04]", async () => {
      const lines = [
        "**Project:** Test",
        "**Type:** song",
        "**Created:** 2025-01-01",
        "## What This Is",
      ];
      for (let i = 0; i < 1000; i++) lines.push(`Line ${i}`);
      const result = await lintBrief(lines.join("\n"));
      // Use specific regex per spec: "too many lines" or "line count exceeds"
      const info = result.findings.filter(
        (f: any) =>
          f.severity === "info" &&
          /too.many.lines|line.count.exceeds/i.test(f.message),
      );
      expect(info.length).toBeGreaterThan(0);
    });

    it("file with duplicate active decision titles: info-level finding [VALID-06]", async () => {
      const content = [
        "**Project:** Test",
        "**Type:** song",
        "**Created:** 2025-01-01",
        "## Key Decisions",
        "### Same Title",
        "WHAT: First",
        "",
        "### Same Title",
        "WHAT: Second",
        "",
      ].join("\n");
      const result = await lintBrief(content);
      const info = result.findings.filter((f: any) =>
        /duplicate/i.test(f.message),
      );
      expect(info.length).toBeGreaterThan(0);
      // Use canonical property `findings` — not `warnings`
      expect(
        result.findings.find((w: any) => w.code === "DUPLICATE_ACTIVE")!
          .severity,
      ).toBe("info");
    });
  });

  describe("ontology format [PARSE-23]", () => {
    it("ontologies field with uppercase pack name: warning-level finding [PARSE-23]", async () => {
      const content =
        "**Project:** Test\n**Type:** song\n**Created:** 2025-01-01\n**Ontologies:** Theme-Ontology\n## What This Is\nContent\n";
      const result = await lintBrief(content);
      // Use specific regex per spec: snake_case, camelCase, or PascalCase conformance check
      const warnings = result.findings.filter((f: any) =>
        /snake_case|camelCase|PascalCase/i.test(f.message),
      );
      expect(warnings.length).toBeGreaterThan(0);
      // Use canonical property `findings` — not `warnings`
      expect(
        result.findings.find((w: any) => w.code === "INVALID_PACK_NAME")!
          .severity,
      ).toBe("warning");
    });
  });

  describe("well-formed file [VALID-07]", () => {
    it("well-formed file: no findings [VALID-07]", async () => {
      const content = [
        "**Project:** Test",
        "**Type:** song",
        "**Created:** 2025-01-01",
        "**Updated:** 2025-06-01",
        "",
        "## What This Is",
        "A well-structured project.",
        "",
        "## What This Is NOT",
        "Not a poorly structured one.",
        "",
        "## Why This Exists",
        "For testing.",
        "",
        "## Key Decisions",
        "### Use TypeScript",
        "WHAT: TypeScript for types",
        "WHY: Safety",
        "WHEN: 2025-01-01",
        "",
        "## Open Questions",
        "## To Resolve",
        "- [ ] Testing question",
        "",
      ].join("\n");
      const result = await lintBrief(content);
      expect(result.findings).toHaveLength(0);
    });
  });

  describe("bundled guide notification [VALID-06, T29-01]", () => {
    it("file with extension registered but no guide loaded: info-level bundled guide notification [VALID-06, T29-01]", async () => {
      const content = [
        "**Project:** Test",
        "**Type:** song",
        "**Created:** 2025-01-01",
        "**Extensions:** sonic_arts",
        "",
        "## What This Is",
        "Content",
        "",
      ].join("\n");
      const result = await lintBrief(content, { checkBundledGuides: true });
      const info = result.findings.filter(
        (f: any) =>
          f.severity === "info" && /guide|sonic_arts|bundled/i.test(f.message),
      );
      expect(info.length).toBeGreaterThan(0);
    });
  });

  describe("additional info-level checks [VALID-06, T29-02]", () => {
    it("Setext-style headings: info-level finding recommending ATX style [VALID-06, T29-02]", async () => {
      const content = [
        "**Project:** Test",
        "**Type:** song",
        "**Created:** 2025-01-01",
        "",
        "## What This Is",
        "Content",
        "",
        "Setext Heading",
        "==============",
        "Body text",
        "",
      ].join("\n");
      const result = await lintBrief(content);
      const info = result.findings.filter(
        (f: any) =>
          f.severity === "info" && /setext|atx|heading.style/i.test(f.message),
      );
      expect(info.length).toBeGreaterThan(0);
    });

    it("H5/H6 headings in content: info-level finding (too deep nesting) [VALID-06, T29-02]", async () => {
      const content = [
        "**Project:** Test",
        "**Type:** song",
        "**Created:** 2025-01-01",
        "",
        "## What This Is",
        "Content",
        "",
        "##### Very Deep Heading",
        "Text",
        "",
      ].join("\n");
      const result = await lintBrief(content);
      const info = result.findings.filter((f: any) =>
        /h5|h6|deep.heading|heading.level/i.test(f.message),
      );
      expect(info.length).toBeGreaterThan(0);
    });

    it("double-dash separator used instead of H2: info-level finding [VALID-06, T29-02]", async () => {
      const content = [
        "**Project:** Test",
        "**Type:** song",
        "**Created:** 2025-01-01",
        "",
        "## What This Is",
        "Content",
        "",
        "Key Decisions",
        "--",
        "- Decision 1",
        "",
      ].join("\n");
      const result = await lintBrief(content);
      const info = result.findings.filter((f: any) =>
        /double.dash|separator|---/i.test(f.message),
      );
      expect(info.length).toBeGreaterThan(0);
    });

    it("unrecognised HTML comment: info-level finding [VALID-06, T29-02]", async () => {
      const content = [
        "**Project:** Test",
        "**Type:** song",
        "**Created:** 2025-01-01",
        "",
        "## What This Is",
        "Content",
        "",
        "<!-- custom-tool:unknown-directive -->",
        "",
      ].join("\n");
      const result = await lintBrief(content);
      const info = result.findings.filter((f: any) =>
        /unrecogni|comment|directive/i.test(f.message),
      );
      expect(info.length).toBeGreaterThan(0);
    });
  });

  describe("lint behavior [RESP-03]", () => {
    it("lint operation never modifies the file [RESP-03]", async () => {
      const content = "**Project:** Test\n**Type:** song\n";
      const result = await lintBrief(content);
      expect(result).toBeDefined();
      expect(result.filesModified).toBe(0);
      expect(result.readOnly).toBe(true);
    });

    it("response is structured with severity counts and findings list [RESP-01]", async () => {
      const result = await lintBrief("**Project:** Test\n");
      expect(result.findings).toBeDefined();
      expect(result.errorCount).toBeDefined();
      expect(result.warningCount).toBeDefined();
      expect(result.infoCount).toBeDefined();
    });
  });
});

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe("TASK-29: Property Tests", () => {
  it("forAll(BRIEF.md): lint never throws, always returns structured response [VALID-01]", async () => {
    await fc.assert(
      fc.asyncProperty(fc.string({ maxLength: 5000 }), async (content) => {
        const result = await lintBrief(content);
        expect(result).toBeDefined();
        expect(result.findings).toBeDefined();
      }),
      { numRuns: 20 },
    );
  });

  it("forAll(BRIEF.md): lint never modifies the file [RESP-03]", async () => {
    await fc.assert(
      fc.asyncProperty(fc.string({ maxLength: 2000 }), async (content) => {
        const result = await lintBrief(content);
        // Pure query — no file modifications
        expect(result.filesModified).toBe(0);
      }),
      { numRuns: 10 },
    );
  });

  it("forAll(finding): severity is always one of error, warning, info [VALID-01]", async () => {
    await fc.assert(
      fc.asyncProperty(fc.string({ maxLength: 2000 }), async (content) => {
        const result = await lintBrief(content);
        for (const finding of result.findings) {
          expect(["error", "warning", "info"]).toContain(finding.severity);
        }
      }),
      { numRuns: 10 },
    );
  });

  it("forAll(valid file): no error-level findings [VALID-07]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .string({ minLength: 1, maxLength: 30 })
          .filter((s) => /^[a-zA-Z0-9 ]+$/.test(s) && s.trim().length > 0),
        async (projectName) => {
          const content = `**Project:** ${projectName}\n**Type:** song\n**Created:** 2025-01-01\n## What This Is\nContent.\n`;
          const result = await lintBrief(content);
          const errors = result.findings.filter(
            (f: any) => f.severity === "error",
          );
          expect(errors).toHaveLength(0);
        },
      ),
      { numRuns: 10 },
    );
  });
});
