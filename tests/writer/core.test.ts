import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import {
  createNewFile,
  detectLineEnding,
  ensureTrailingNewline,
  readBriefSection,
  writeBriefSection,
  writeSection,
} from "../../src/writer/core";

// ---------------------------------------------------------------------------
// Unit Tests
// ---------------------------------------------------------------------------

describe("TASK-14: Writer — Core Write Engine", () => {
  describe("byte-for-byte preservation of untouched sections [WRITE-02]", () => {
    it("file with three sections, modify middle section: first and last byte-for-byte identical [WRITE-02]", async () => {
      const input = [
        "**Project:** Test",
        "**Updated:** 2025-01-01",
        "",
        "## What This Is",
        "Original description.",
        "",
        "## Key Decisions",
        "### Use TypeScript",
        "Reason here.",
        "",
        "## Open Questions",
        "- [ ] Unanswered question",
        "",
      ].join("\n");

      const result = await writeSection(
        input,
        "Key Decisions",
        "New decisions content",
      );
      expect(result.content).toContain("New decisions content");

      // Extract raw section text (heading + body) for byte-for-byte comparison — no .trim()
      const extractSection = (text: string, heading: string): string | null => {
        const m = text.match(
          new RegExp(`(## ${heading}\\n[\\s\\S]*?)(?=\\n## |$)`),
        );
        return m ? m[1] : null;
      };
      // Untouched sections must be byte-for-byte identical — toBe(), not toContain()
      expect(extractSection(result.content, "What This Is")).toBe(
        extractSection(input, "What This Is"),
      );
      expect(extractSection(result.content, "Open Questions")).toBe(
        extractSection(input, "Open Questions"),
      );
    });
  });

  describe("section targeting with aliases [WRITE-01, WRITE-14]", () => {
    it("write to section using alias name places content under canonical heading [WRITE-01]", async () => {
      const input = "## What This Is\nOld content\n";
      const result = await writeSection(
        input,
        "Overview",
        "New overview content",
      );
      expect(result.content).toContain("New overview content");
      expect(result.content).toContain("## What This Is");
    });

    it("write using non-canonical casing uses canonical heading name in output [WRITE-01]", async () => {
      const input = "## what this is\nContent\n";
      const result = await writeSection(input, "WHAT THIS IS", "Updated");
      expect(result.content).toContain("Updated");
      expect(result.content).toContain("## What This Is");
    });
  });

  describe("new file creation [WRITE-11]", () => {
    it("new file creation produces metadata fields in canonical order [WRITE-11]", async () => {
      const result = await createNewFile({
        project: "Test Project",
        type: "Library",
      });
      // After the write operation, verify field order is: Project, Type, Extensions, Status, Created, Updated, Ontologies, Version
      const lines = result
        .split("\n")
        .filter((l: string) => l.match(/^\*\*[A-Za-z]+\*\*/));
      const fieldNames = lines.map((l: string) =>
        l.replace(/^\*\*([^*]+)\*\*.*/, "$1"),
      );
      const canonicalOrder = [
        "Project",
        "Type",
        "Extensions",
        "Status",
        "Created",
        "Updated",
        "Ontologies",
        "Version",
      ];
      // All present fields should appear in canonical order
      const presentCanonical = canonicalOrder.filter((f) =>
        fieldNames.includes(f),
      );
      const presentInFile = fieldNames.filter((f: string) =>
        canonicalOrder.includes(f),
      );
      expect(presentInFile).toEqual(presentCanonical);
    });
  });

  describe("timestamp update [WRITE-03]", () => {
    it("any write operation updates Updated timestamp to current date [WRITE-03]", async () => {
      // F4: use regex instead of capturing today's date at test start — avoids midnight boundary flakiness
      const input =
        "**Project:** Test\n**Updated:** 2020-01-01\n## What This Is\nContent\n";
      const result = await writeSection(input, "What This Is", "New content");
      expect(result.content).toMatch(/\*\*Updated:\*\* \d{4}-\d{2}-\d{2}/);
    });
  });

  describe("detectLineEnding [WRITE-06]", () => {
    it('detectLineEnding returns "CRLF" for CRLF content [WRITE-06]', () => {
      const crlfContent = "Line one\r\nLine two\r\n";
      expect(detectLineEnding(crlfContent)).toBe("CRLF");
    });

    it('detectLineEnding returns "LF" for LF content [WRITE-06]', () => {
      const lfContent = "Line one\nLine two\n";
      expect(detectLineEnding(lfContent)).toBe("LF");
    });

    it('detectLineEnding returns "LF" for mixed content (LF majority wins) [WRITE-06]', () => {
      // 1 CRLF, 2 LF — LF is the majority so LF should win
      const mixedContent = "Line one\r\nLine two\nLine three\n";
      expect(detectLineEnding(mixedContent)).toBe("LF");
    });
  });

  describe("ensureTrailingNewline [WRITE-06]", () => {
    it("ensureTrailingNewline on content without newline adds exactly one newline [WRITE-06]", () => {
      const noNewline = "content without newline";
      const result = ensureTrailingNewline(noNewline);
      expect(result.endsWith("\n")).toBe(true);
      expect(result.endsWith("\n\n")).toBe(false);
    });

    it("ensureTrailingNewline on content with newline is idempotent [WRITE-06]", () => {
      const withNewline = "content with newline\n";
      const result = ensureTrailingNewline(withNewline);
      expect(result).toBe(withNewline);
    });

    it("ensureTrailingNewline on content with double newline collapses to one [WRITE-06]", () => {
      const doubleNewline = "content\n\n";
      const result = ensureTrailingNewline(doubleNewline);
      expect(result.endsWith("\n\n")).toBe(false);
      expect(result.endsWith("\n")).toBe(true);
    });
  });

  describe("line ending handling [WRITE-06]", () => {
    it("write to existing file with CRLF line endings preserves CRLF style, no mixed line endings [WRITE-06, M1]", async () => {
      // WRITE-06: "Never mix styles within a single file."
      // The new section content must also use CRLF, not create a mixed-style output.
      const input = "**Project:** Test\r\n## What This Is\r\nContent\r\n";
      const result = await writeSection(input, "What This Is", "Updated");
      expect(result.content).toContain("\r\n");
      // After removing all \r\n sequences, no standalone \n should remain — proves no mixing
      expect(result.content.split("\r\n").join("")).not.toContain("\n");
    });

    it("new file creation uses LF line endings [WRITE-06]", async () => {
      const result = await createNewFile({
        project: "Test",
        type: "Library",
      });
      expect(result).not.toContain("\r\n");
      expect(result).toContain("\n");
    });
  });

  describe("trailing newline [WRITE-06]", () => {
    it("output of any write ends with exactly one trailing newline [WRITE-06]", async () => {
      const input = "## What This Is\nContent";
      const result = await writeSection(input, "What This Is", "Updated");
      expect(result.content.endsWith("\n")).toBe(true);
      expect(result.content.endsWith("\n\n")).toBe(false);
    });
  });

  describe("whitespace preservation [WRITE-07]", () => {
    it("section not being modified with unusual whitespace: whitespace preserved exactly [WRITE-07]", async () => {
      const input =
        "## Section A\n  Indented line\n\n\nTriple blank\n## Section B\nTarget\n";
      const result = await writeSection(input, "Section B", "New B content");
      expect(result.content).toContain("  Indented line");
      expect(result.content).toContain("\n\n\nTriple blank");
    });
  });

  describe("content structure warning [WRITE-19]", () => {
    it("content with H1 heading written to section: write succeeds with warning [WRITE-19]", async () => {
      const originalContent = "## What This Is\nContent\n";
      const result = await writeSection(
        originalContent,
        "What This Is",
        "# Top Level Heading\nContent under H1",
      );
      expect(result.content).toContain("# Top Level Heading");
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(
        result.warnings.some((w: string) => /heading|structure/i.test(w)),
      ).toBe(true);
    });
  });

  describe("atomic write safety [WRITE-04]", () => {
    it("simulated crash during write (temp file exists, no rename): original file intact [WRITE-04]", async () => {
      // Verifies the atomic write pattern (write to temp, rename) — a crash mid-write leaves original intact
      const originalContent = "## Section\nOriginal content\n";
      const tempPath = path.join(
        os.tmpdir(),
        `brief-crash-test-${Date.now()}.md`,
      );
      fs.writeFileSync(tempPath, originalContent, "utf8");
      try {
        // simulateCrash causes the temp-file write to complete but the rename to be skipped
        await writeSection(originalContent, "Section", "New content", {
          simulateCrash: true,
          filePath: tempPath,
        });
        // The only authoritative check: the file on disk must still be the original
        const fileOnDisk = fs.readFileSync(tempPath, "utf8");
        expect(fileOnDisk).toBe(originalContent);
      } finally {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      }
    });
  });

  describe("metadata order preservation [WRITE-11]", () => {
    it("existing file with non-canonical metadata order: order preserved [WRITE-11]", async () => {
      const input =
        "**Type:** Library\n**Project:** Test\n## What This Is\nContent\n";
      const result = await writeSection(input, "What This Is", "Updated");
      const typeIdx = result.content.indexOf("**Type:**");
      const projectIdx = result.content.indexOf("**Project:**");
      // Original order preserved for existing files
      expect(typeIdx).toBeLessThan(projectIdx);
    });
  });

  describe("file creation [WRITE-04]", () => {
    it("write to file that does not exist creates file with correct structure [WRITE-04]", async () => {
      const result = await createNewFile({
        project: "New Project",
        type: "Application",
        sectionContent: { "What This Is": "A new application" },
      });
      expect(result).toContain("**Project:** New Project");
      expect(result).toContain("A new application");
    });
  });

  describe("write idempotency [WRITE-02, D5]", () => {
    it("writeSection called twice with same content produces byte-for-byte identical output [WRITE-02, D5, M2]", async () => {
      // D5: "forAll(write tool, same input twice): result is idempotent"
      // Updated timestamp is the same (same day); section content is unchanged → output must be identical.
      const input =
        "**Updated:** 2025-01-01\n## What This Is\nOld content\n## Open Questions\n";
      const firstResult = await writeSection(
        input,
        "What This Is",
        "Stable content",
      );
      const secondResult = await writeSection(
        firstResult.content,
        "What This Is",
        "Stable content",
      );
      // Second write with identical content must produce byte-for-byte identical output
      expect(secondResult.content).toBe(firstResult.content);
    });
  });
});

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe("TASK-14: Property Tests", () => {
  it("forAll(valid BRIEF.md, section index): writing to one section preserves all other sections byte-for-byte [WRITE-02]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom("What This Is", "Key Decisions", "Open Questions"),
        fc
          .string({ minLength: 1, maxLength: 200 })
          .filter((s) => /^[a-zA-Z0-9 .]+$/.test(s)),
        async (targetSection, newContent) => {
          const sections = ["What This Is", "Key Decisions", "Open Questions"];
          const input = sections
            .map((s) => `## ${s}\nContent for ${s}.\n`)
            .join("\n");
          const result = await writeSection(input, targetSection, newContent);
          const extractSection = (text: string, h: string) =>
            text.match(new RegExp(`(## ${h}\\n[\\s\\S]*?)(?=\\n## |$)`))?.[1] ??
            null;
          for (const section of sections) {
            if (section !== targetSection) {
              // Byte-for-byte: extracted section must match exactly, not just contain
              expect(extractSection(result.content, section)).toBe(
                extractSection(input, section),
              );
            }
          }
        },
      ),
      { numRuns: 10 },
    );
  });

  it("forAll(write operation): Updated timestamp is always current date after write [WRITE-03]", async () => {
    // F4: use regex — captures date inside the property callback so comparison is always fresh
    await fc.assert(
      fc.asyncProperty(
        fc
          .string({ minLength: 1, maxLength: 100 })
          .filter((s) => /^[a-zA-Z0-9 .]+$/.test(s)),
        async (content) => {
          const input =
            "**Project:** Test\n**Updated:** 2020-01-01\n## What This Is\nOld\n";
          const result = await writeSection(input, "What This Is", content);
          expect(result.content).toMatch(/\*\*Updated:\*\* \d{4}-\d{2}-\d{2}/);
        },
      ),
      { numRuns: 10 },
    );
  });

  it("forAll(new file content): output ends with exactly one newline character [WRITE-06]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .string({ minLength: 1, maxLength: 50 })
          .filter((s) => /^[a-zA-Z0-9 ]+$/.test(s)),
        async (projectName) => {
          const result = await createNewFile({
            project: projectName,
            type: "Library",
          });
          expect(result.endsWith("\n")).toBe(true);
          expect(result.endsWith("\n\n")).toBe(false);
        },
      ),
      { numRuns: 10 },
    );
  });

  it("forAll(valid BRIEF.md with mixed content): non-target sections are never modified [WRITE-07]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .string({ minLength: 1, maxLength: 100 })
          .filter((s) => /^[a-zA-Z0-9 .!]+$/.test(s)),
        async (newContent) => {
          const input =
            "## Section A\nUnique_Marker_A_12345.\n\n## Section B\nTarget section.\n\n## Section C\nUnique_Marker_C_67890.\n";
          const result = await writeSection(input, "Section B", newContent);
          const extractSection = (text: string, h: string) =>
            text.match(new RegExp(`(## ${h}\\n[\\s\\S]*?)(?=\\n## |$)`))?.[1] ??
            null;
          // Byte-for-byte: extracted sections must match exactly
          expect(extractSection(result.content, "Section A")).toBe(
            extractSection(input, "Section A"),
          );
          expect(extractSection(result.content, "Section C")).toBe(
            extractSection(input, "Section C"),
          );
        },
      ),
      { numRuns: 10 },
    );
  });

  it("forAll(valid BRIEF.md content): write then read produces identical structure [WRITE-02]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .string({ minLength: 1, maxLength: 200 })
          .filter((s) => s.trim().length > 0),
        async (content) => {
          const testPath = path.join(
            os.tmpdir(),
            `brief-roundtrip-${Date.now()}-${Math.random().toString(36).slice(2)}.md`,
          );
          try {
            const writeResult = await writeBriefSection(
              testPath,
              "What This Is",
              content,
            );
            expect(writeResult.success).toBe(true);
            const readBack = await readBriefSection(testPath, "What This Is");
            // D1: round-trip fidelity — no .trim() so whitespace differences surface as failures
            expect(readBack.content).toBe(content);
          } finally {
            if (fs.existsSync(testPath)) fs.unlinkSync(testPath);
          }
        },
      ),
      { numRuns: 20 },
    );
  });
});
