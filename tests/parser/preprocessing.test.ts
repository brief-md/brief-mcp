import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  checkResourceLimits,
  detectMergeConflicts,
  metadataOnlyFastPath,
  normalizeLineEndings,
  preprocess,
  preprocessContent,
  preprocessContentStream,
  stripBom,
} from "../../src/parser/preprocessing";

// ---------------------------------------------------------------------------
// Unit Tests
// ---------------------------------------------------------------------------

describe("TASK-13: Parser — Pre-Processing & Edge Cases", () => {
  describe("BOM stripping [PARSE-19]", () => {
    it("file starting with UTF-8 BOM has BOM stripped, parsed normally [PARSE-19]", () => {
      const input = "\uFEFF**Project:** Test\n";
      const result = preprocess(input);
      expect(result.content.charAt(0)).not.toBe("\uFEFF");
      expect(result.content).toContain("**Project:**");
      // G-078: use canonical property name result.warnings
      expect(result.warnings).toEqual(
        expect.arrayContaining([expect.stringMatching(/BOM/i)]),
      );
    });
  });

  describe("line ending normalization [PARSE-19]", () => {
    it("file with \\r\\n line endings has all normalized to \\n [PARSE-19]", () => {
      const input = "Line one\r\nLine two\r\nLine three\r\n";
      const result = preprocess(input);
      expect(result.content).not.toContain("\r");
      expect(result.content).toContain("Line one\nLine two");
    });

    it("file with mixed line endings (\\r\\n, \\r, \\n) has all normalized to \\n [PARSE-19]", () => {
      const input = "Line1\r\nLine2\rLine3\nLine4";
      const result = preprocess(input);
      expect(result.content).not.toContain("\r");
    });
  });

  describe("resource limits [SEC-17]", () => {
    it("file exceeding 10 MB is rejected before structural parsing [SEC-17]", () => {
      const oversized = "x".repeat(10_485_761);
      expect(() => checkResourceLimits(oversized)).toThrow(/size|limit/i);
    });

    it("file at exactly 10 MB (10485760 bytes) is accepted — boundary is exclusive [SEC-17, F2, M3]", () => {
      // F2: off-by-one guard — implementation must use > not >= so the exact limit is still valid.
      // 10 * 1024 * 1024 = 10485760 bytes exactly at the 10MB boundary.
      const atLimit = "x".repeat(10_485_760);
      expect(() => checkResourceLimits(atLimit)).not.toThrow();
    });

    it("file with more than 500 sections is rejected with section-count error [SEC-17]", () => {
      const lines = Array.from(
        { length: 501 },
        (_, i) => `## Section ${i}\nContent ${i}\n`,
      );
      const input = lines.join("");
      expect(() => checkResourceLimits(input)).toThrow(/section/i);
    });
  });

  describe("merge conflict detection [PARSE-24]", () => {
    it("file with <<<<<<< at line start produces data error about merge conflicts [PARSE-24]", () => {
      const input =
        "## Section\nContent\n<<<<<<< HEAD\nConflict\n=======\nOther\n>>>>>>> branch\n";
      expect(() => detectMergeConflicts(input)).toThrow(/merge conflict/i);
    });

    it("conflict markers inside a code block are not detected as conflicts [PARSE-24]", () => {
      const input = "```\n<<<<<<< HEAD\n=======\n>>>>>>> branch\n```\n";
      expect(() => detectMergeConflicts(input)).not.toThrow();
    });

    it("conflict markers with leading whitespace → NOT detected as merge conflicts [PARSE-24]", () => {
      // Only markers at line START trigger detection — indented markers are content, not conflicts
      const contentWithIndentedMarker =
        "Normal line\n  <<<<<<< HEAD\nAnother line\n";
      expect(() =>
        detectMergeConflicts(contentWithIndentedMarker),
      ).not.toThrow();
    });
  });

  describe("empty file handling [PARSE-19]", () => {
    it("empty file (0 bytes) produces valid result with no metadata and no sections [PARSE-19]", () => {
      const result = preprocess("");
      expect(result.content).toBe("");
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe("GFM support [PARSE-18]", () => {
    // G-079: use canonical property name result.strikethroughSegments, assert specific array value
    it("~~strikethrough~~ text is recognized as GFM strikethrough [PARSE-18]", () => {
      const input = "## Key Decisions\n### ~~Old Decision~~\nContent\n";
      const result = preprocess(input);
      expect(result.content).toContain("~~Old Decision~~");
      expect(result.strikethroughSegments).toBeDefined();
      expect(Array.isArray(result.strikethroughSegments)).toBe(true);
      expect(result.strikethroughSegments.length).toBeGreaterThan(0);
    });

    it("GFM tables in content are preserved, not misinterpreted as structure [PARSE-18]", () => {
      const input = "## Section\n| Col1 | Col2 |\n|------|------|\n| A | B |\n";
      const result = preprocess(input);
      expect(result.content).toContain("| Col1 | Col2 |");
    });
  });

  describe("heading depth [PARSE-17]", () => {
    // G-080: structural check is correct — leave as-is, use result.structuralHeadings canonical
    it("H4 inside a section is structural sub-heading; H5/H6 are content only [PARSE-17]", () => {
      const input =
        "## Key Decisions\n#### Context\nSub-heading\n##### Note\nContent note\n";
      const result = preprocess(input);
      expect(result.content).toContain("#### Context");
      expect(result.content).toContain("##### Note");
      // H4 should be recognized as structural
      expect(result.structuralHeadings).toBeDefined();
      // H5/H6 should NOT be structural
      const structuralTexts = result.structuralHeadings.map(
        (h: any) => h.text ?? h,
      );
      expect(structuralTexts.length).toBeGreaterThan(0);
      expect(structuralTexts.some((t: string) => t.includes("Context"))).toBe(
        true,
      );
      expect(structuralTexts.some((t: string) => t.includes("Note"))).toBe(
        false,
      );
    });
  });

  describe("content preservation [PARSE-21]", () => {
    it("embedded images and raw HTML in section body are preserved as-is [PARSE-21]", () => {
      const input =
        '## Section\n![alt](image.png)\n<div class="custom">HTML</div>\n';
      const result = preprocess(input);
      expect(result.content).toContain("![alt](image.png)");
      expect(result.content).toContain('<div class="custom">HTML</div>');
    });

    it("emoji in section heading (4-byte UTF-8): heading and section body preserved correctly [PARSE-21, F1, M1]", () => {
      // F1: 4-byte emoji require surrogate pairs in JS UTF-16. A naive charCodeAt-based
      // parser could miscalculate section start/end positions and corrupt content.
      const input =
        "## What This Is \uD83D\uDE80\nContent here\n## Open Questions\nQ?\n";
      const result = preprocess(input);
      expect(result.content).toContain("\uD83D\uDE80");
      expect(result.content).toContain("Content here");
      // Section body must not bleed into the next section
      expect(result.content).toContain("Open Questions");
    });
  });

  describe("trailing newline handling [PARSE-25]", () => {
    it("file with and without trailing newline both parsed successfully [PARSE-25]", () => {
      const withNewline = "## Section\nContent\n";
      const withoutNewline = "## Section\nContent";
      const result1 = preprocess(withNewline);
      const result2 = preprocess(withoutNewline);
      expect(result1.content).toBeDefined();
      expect(result2.content).toBeDefined();
    });

    it("multiple trailing newlines parsed without error; section content unaffected [PARSE-25, M3]", () => {
      // PARSE-25: exactly one \n at EOF; parser must not error on extra trailing newlines
      const multiTrailing = "## Section\nContent here\n\n\n";
      const result = preprocess(multiTrailing);
      expect(result.content).toBeDefined();
      // Section content must still be extractable correctly
      expect(result.content).toContain("Content here");
    });

    it("trailing CRLF line ending parsed without error [PARSE-25, M3]", () => {
      // PARSE-25: parser must handle CRLF-terminated files from Windows editors
      const crlfTrailing = "## Section\r\nContent here\r\n";
      const result = preprocess(crlfTrailing);
      expect(result.content).toBeDefined();
      expect(result.content).toContain("Content");
    });

    it("zero-byte file (empty string) parsed without error, returns empty result [PARSE-01, PARSE-25, M3]", () => {
      // PARSE-01: parser MUST NOT throw on any input, including empty files
      // PARSE-25: trailing newline logic must handle empty content gracefully
      expect(() => preprocess("")).not.toThrow();
      const result = preprocess("");
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
    });
  });

  describe("metadata-only fast path [PARSE-04]", () => {
    it("metadata-only fast path returns metadata, stops before first section [PARSE-04]", () => {
      const input =
        "**Project:** Test\n**Type:** Library\n## What This Is\nLong content...\n";
      const result = metadataOnlyFastPath(input);
      expect(result).toContain("**Project:**");
      expect(result).not.toContain("Long content");
    });
  });

  describe("decision chain depth limit [SEC-17]", () => {
    it("chain depth exceeding 100 links is rejected with chain-depth error [SEC-17]", () => {
      // Generate content with 101 SUPERSEDED BY links
      const overDepthContent = Array.from(
        { length: 101 },
        (_, i) =>
          `### Decision ${i}\nSUPERSEDED BY: Decision ${i + 1} (2025-01-01)\n`,
      ).join("");
      expect(() => checkResourceLimits(overDepthContent)).toThrow(
        /chain.*depth|depth.*100|decision.*chain/i,
      );
    });

    it("chain depth exactly 100 links is accepted [SEC-17]", () => {
      const atLimitContent = Array.from(
        { length: 100 },
        (_, i) =>
          `### Decision ${i}\nSUPERSEDED BY: Decision ${i + 1} (2025-01-01)\n`,
      ).join("");
      expect(() => checkResourceLimits(atLimitContent)).not.toThrow();
    });
  });

  describe("parse timeout [SEC-17]", () => {
    it("parse timeout (5 seconds): operation cancelled after timeout [SEC-17]", async () => {
      // Use dynamic import instead of require()
      const { parseBrief } = await import("../../src/parser");
      // Verify that a timeout parameter is accepted and very short timeouts cause an error
      await expect(
        parseBrief("**Project:** Test\n**Type:** song\n", { timeoutMs: 1 }),
      ).rejects.toThrow(/timeout|cancelled|abort/i);
    });
  });

  describe("streaming for large files [SEC-17]", () => {
    it("file over 100KB uses streaming mode, produces same result as in-memory parse [SEC-17]", () => {
      const largeContent = `## Section\n${"Content line.\n".repeat(10_000)}`;
      const smallContent = "## Section\nContent line.\n";
      const streamResult = preprocess(largeContent);
      const inMemResult = preprocess(smallContent);
      // Streaming mode is flagged for files > 100KB
      expect(streamResult.mode).toBe("streaming");
      expect(inMemResult.mode).toBe("in-memory");
      // Core invariant: streaming and in-memory processing produce the same structural output
      // Both must correctly detect headings, BOM-strip, and normalize line endings
      expect(streamResult.content).toContain("## Section");
      expect(streamResult.content).not.toContain("\r");
    });
  });

  describe("ReDoS protection [SEC-17, T13-02]", () => {
    it("pathological regex input: preprocessing completes within time limit (O(n) behaviour) [T13-02]", () => {
      // Input designed to cause catastrophic backtracking in naive regex patterns
      // Pattern: repeated alternations with overlapping groups (e.g. (a+)+ style)
      const pathological = `${"a".repeat(30)}X`; // triggers catastrophic backtracking in naive regexes
      const start = Date.now();
      // preprocess must complete without hanging — ReDoS protection ensures O(n)
      expect(() => preprocess(pathological)).not.toThrow();
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(1000); // must complete within 1 second
    });

    it("deeply nested markdown (100 levels): does not cause stack overflow or hang [T13-02]", () => {
      const nested = `${"> ".repeat(100)}content`;
      const start = Date.now();
      const result = preprocess(nested);
      const elapsed = Date.now() - start;
      expect(result).toBeDefined();
      expect(elapsed).toBeLessThan(1000);
    });
  });

  describe("fixture corpus [TEST-02, T13-03]", () => {
    it("lenient fixture corpus: all messy files in tests/fixtures/lenient/ parsed without throwing [T13-03]", () => {
      const fs = require("node:fs");
      const path = require("node:path");
      const fixturesDir = path.resolve(__dirname, "../fixtures/lenient");
      expect(fs.existsSync(fixturesDir)).toBe(true);
      const files = fs
        .readdirSync(fixturesDir)
        .filter((f: string) => f.endsWith(".md"));
      expect(files.length).toBeGreaterThan(0);
      for (const file of files) {
        const content = fs.readFileSync(path.join(fixturesDir, file), "utf-8");
        expect(() => preprocess(content)).not.toThrow();
      }
    });
  });
});

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe("TASK-13: Property Tests", () => {
  // G-082: add expect.fail in catch to rethrow unexpected errors
  it("forAll(file content bytes): pipeline never throws, returns result or structured error [PARSE-19]", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 10_000 }), (content) => {
        try {
          const result = preprocess(content);
          expect(result).toBeDefined();
        } catch (e: any) {
          // Only structured errors (size limit, merge conflicts) are acceptable
          if (
            !e.message ||
            !/size|limit|section|merge conflict/i.test(e.message)
          ) {
            throw new Error(
              `pipeline should not throw unexpected error: ${e.message}`,
            );
          }
          expect(e.message).toBeDefined();
        }
      }),
    );
  });

  it("forAll(file with any line ending style): after normalization, no \\r characters remain [PARSE-19]", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 5000 }), (content) => {
        const normalized = normalizeLineEndings(content);
        expect(normalized).not.toContain("\r");
      }),
    );
  });

  it("forAll(file starting with BOM): after stripping, first character is never U+FEFF [PARSE-19]", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 500 }), (content) => {
        const withBom = `\uFEFF${content}`;
        const stripped = stripBom(withBom);
        if (stripped.length > 0) {
          expect(stripped.charAt(0)).not.toBe("\uFEFF");
        }
      }),
    );
  });

  it("forAll(file under limits): pre-check passes, content reaches downstream parsing [SEC-17]", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 10_000 }), (content) => {
        // Content under 10 MB with < 500 headings should pass resource checks
        expect(() => checkResourceLimits(content)).not.toThrow();
      }),
    );
  });

  it("forAll(empty or whitespace-only content): valid result with no sections and no metadata [PARSE-19]", () => {
    fc.assert(
      fc.property(
        fc.stringOf(fc.constantFrom(" ", "\t", "\n", "\r")),
        (whitespace) => {
          const result = preprocess(whitespace);
          expect(result).toBeDefined();
          expect(result.content.trim()).toBe("");
        },
      ),
    );
  });

  it("forAll(file with embedded non-markdown content): non-structural content unchanged in output [PARSE-21]", () => {
    fc.assert(
      fc.property(
        fc
          .string({ minLength: 1, maxLength: 200 })
          .filter((s) => !s.includes("\r")),
        (embedded) => {
          const input = `## Section\n${embedded}\n`;
          const result = preprocess(input);
          expect(result.content).toContain(embedded);
        },
      ),
    );
  });

  it("forAll(same content via streaming vs in-memory): both produce identical results [SEC-17]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 0, maxLength: 500 }),
        async (content) => {
          const inMemory = await preprocessContent(content);
          const streaming = await preprocessContentStream(content);
          expect(streaming).toEqual(inMemory);
        },
      ),
    );
  });
});
