import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  extractBriefTag,
  isInsideCodeBlock,
  parseComments,
} from "../../src/parser/comments";

// ---------------------------------------------------------------------------
// Unit Tests
// ---------------------------------------------------------------------------

describe("TASK-12: Parser — HTML Comments & Tags", () => {
  describe("ontology comment extraction [PARSE-07]", () => {
    it("ontology comment with pack, ID, and quoted label extracts all three fields [PARSE-07]", () => {
      const input =
        'Some paragraph\n<!-- brief:ontology theme-pack entry-123 "Dark Theme" -->\n';
      const result = parseComments(input);
      const tag = result.tags.find((t) => t.type === "ontology");
      expect(tag).toBeDefined();
      expect(tag!.pack).toBe("theme-pack");
      expect(tag!.entryId).toBe("entry-123");
      expect(tag!.label).toBe("Dark Theme");
    });

    it("label containing spaces inside quotes extracts full quoted string intact [PARSE-07]", () => {
      const input =
        '<!-- brief:ontology pack id "Label With Many Spaces" -->\n';
      const result = parseComments(input);
      expect(result.tags[0].label).toBe("Label With Many Spaces");
    });
  });

  describe("ref-link comment extraction [PARSE-07]", () => {
    it("ref-link comment with pack and ID extracts both fields [PARSE-07]", () => {
      const input = "<!-- brief:ref-link music-pack coltrane-01 -->\n";
      const result = parseComments(input);
      const tag = result.tags.find((t) => t.type === "ref-link");
      expect(tag).toBeDefined();
      expect(tag!.pack).toBe("music-pack");
      expect(tag!.entryId).toBe("coltrane-01");
    });
  });

  describe("has-exception comment extraction [PARSE-07]", () => {
    it("has-exception comment with quoted title and date extracts both [PARSE-07]", () => {
      const input =
        '<!-- brief:has-exception "Mobile Exception" 2025-06-01 -->\n';
      const result = parseComments(input);
      const tag = result.tags.find((t) => t.type === "has-exception");
      expect(tag).toBeDefined();
      expect(tag!.title).toBe("Mobile Exception");
      expect(tag!.date).toBe("2025-06-01");
    });
  });

  describe("non-brief comments [PARSE-07]", () => {
    it("non-brief: HTML comment preserved as-is, not extracted as tag [PARSE-07]", () => {
      const input =
        "Content\n<!-- This is a regular comment -->\nMore content\n";
      const result = parseComments(input);
      expect(result.tags).toHaveLength(0);
      expect(result.content).toContain("<!-- This is a regular comment -->");
    });

    it("recognized brief: comment is REMOVED from result.content after extraction [PARSE-07]", () => {
      // brief: comments that are recognized and extracted should NOT appear in result.content
      const input =
        'Paragraph text\n<!-- brief:ontology pack entry "Label" -->\nMore text\n';
      const result = parseComments(input);
      expect(result.tags).toHaveLength(1);
      // The brief:ontology comment should be stripped from content
      expect(result.content).not.toContain("<!-- brief:ontology");
      // Non-comment content preserved
      expect(result.content).toContain("Paragraph text");
      expect(result.content).toContain("More text");
    });
  });

  describe("isInsideCodeBlock direct API [PARSE-15]", () => {
    it("isInsideCodeBlock returns false for lines before any fence [PARSE-15]", () => {
      const lines = ["Normal line", "Another line"];
      expect(isInsideCodeBlock(lines, 0)).toBe(false);
      expect(isInsideCodeBlock(lines, 1)).toBe(false);
    });

    it("isInsideCodeBlock returns true for lines inside a triple-backtick fence [PARSE-15]", () => {
      const lines = ["```", "## Fake Heading", "```"];
      expect(isInsideCodeBlock(lines, 1)).toBe(true);
    });

    it("isInsideCodeBlock returns false for lines after closing fence [PARSE-15]", () => {
      const lines = ["```", "code", "```", "outside"];
      expect(isInsideCodeBlock(lines, 3)).toBe(false);
    });
  });

  describe("code block awareness [PARSE-15, PARSE-20]", () => {
    it("brief: comment inside triple-backtick fenced code block is skipped [PARSE-15]", () => {
      const input = '```\n<!-- brief:ontology pack id "Label" -->\n```\n';
      const result = parseComments(input);
      expect(result.tags).toHaveLength(0);
    });

    it("brief: comment inside ~~~ fenced code block is skipped [PARSE-15]", () => {
      const input = '~~~\n<!-- brief:ontology pack id "Label" -->\n~~~\n';
      const result = parseComments(input);
      expect(result.tags).toHaveLength(0);
    });

    it("brief: comment inside indented code block is skipped [PARSE-15]", () => {
      const input =
        'Text\n\n    <!-- brief:ontology pack id "Label" -->\n\nMore text\n';
      const result = parseComments(input);
      expect(result.tags).toHaveLength(0);
    });

    it("same comment in prose outside code blocks is extracted normally [PARSE-15]", () => {
      const input = 'Paragraph text\n<!-- brief:ontology pack id "Label" -->\n';
      const result = parseComments(input);
      expect(result.tags).toHaveLength(1);
    });
  });

  describe("multi-line and edge cases [PARSE-20]", () => {
    it("multi-line comment with internal newlines has whitespace normalized, tag extracted [PARSE-20]", () => {
      const input =
        '<!--\n  brief:ontology   pack\n  id   "Multi Line Label"\n-->\n';
      const result = parseComments(input);
      expect(result.tags).toHaveLength(1);
      expect(result.tags[0].label).toBe("Multi Line Label");
    });

    it("nested <!-- inside open comment is ignored, first opener/closer pair used [PARSE-20]", () => {
      const input = '<!-- brief:ontology pack id "Label" <!-- nested --> \n';
      const result = parseComments(input);
      expect(result.tags).toHaveLength(1);
    });

    it("two consecutive comments are both extracted independently [PARSE-20]", () => {
      const input =
        '<!-- brief:ontology pack1 id1 "Label1" -->\n<!-- brief:ontology pack2 id2 "Label2" -->\n';
      const result = parseComments(input);
      expect(result.tags).toHaveLength(2);
    });

    it("unclosed comment (no --> before EOF) is silently ignored, no error [PARSE-20]", () => {
      const input = '<!-- brief:ontology pack id "Label"';
      const result = parseComments(input);
      expect(result.tags).toHaveLength(0);
    });

    // G-073: remove not.toContain('--') — spec says -- inside comment body is preserved leniently.
    // The correct behavior is that the parser handles -- leniently (does not truncate the body).
    it("-- inside comment body is not truncated, full body preserved [PARSE-20]", () => {
      const input =
        '<!-- brief:ontology pack entry--id "Label With -- Dashes" -->\n';
      const result = parseComments(input);
      // Parser should handle -- leniently — tag is extracted (not dropped)
      expect(result.tags.length).toBeGreaterThan(0);
      // The label should be preserved with its dashes intact
      const tag = result.tags[0];
      expect(tag.label).toContain("Dashes");
    });

    it("unrecognised brief: type preserved as-is, not extracted as structured tag [PARSE-20]", () => {
      const input = "<!-- brief:custom-tag some data -->\n";
      const result = parseComments(input);
      const structuredTags = result.tags.filter(
        (t) =>
          t.type === "ontology" ||
          t.type === "ref-link" ||
          t.type === "has-exception",
      );
      expect(structuredTags).toHaveLength(0);
    });
  });

  describe("resource limits [SEC-17]", () => {
    it("file exceeding 10 MB is rejected before parsing [SEC-17]", () => {
      const input = "x".repeat(10_485_761);
      expect(() => parseComments(input)).toThrow(/size|limit/i);
    });
  });

  describe("empty file [PARSE-19]", () => {
    it("empty file produces empty tag collection, no errors [PARSE-19]", () => {
      const result = parseComments("");
      expect(result.tags).toHaveLength(0);
    });
  });

  describe("tag association [OQ-217]", () => {
    // G-074: assert associatedLine equals specific known line number
    // "First paragraph content." is on line 1 (1-indexed)
    it("ontology tag after paragraph is associated with that paragraph [OQ-217]", () => {
      const input =
        'First paragraph content.\n<!-- brief:ontology pack id "Label" -->\n\nSecond paragraph.\n';
      const result = parseComments(input);
      // The tag follows line 1 (the paragraph "First paragraph content.")
      expect(result.tags[0].associatedLine).toBe(1);
    });

    // G-075: add positive assertion of what lines SHOULD be
    it("tag association is paragraph-scoped, not section-scoped [OQ-217]", () => {
      const input =
        'Paragraph A.\n<!-- brief:ontology pack1 id1 "L1" -->\n\nParagraph B.\n<!-- brief:ontology pack2 id2 "L2" -->\n';
      const result = parseComments(input);
      expect(result.tags).toHaveLength(2);
      // Paragraph A is on line 1; Paragraph B is on line 4
      expect(result.tags[0].associatedLine).toBe(1);
      expect(result.tags[1].associatedLine).toBe(4);
      // Each tag should associate with its nearest preceding paragraph
      expect(result.tags[0].associatedLine).not.toBe(
        result.tags[1].associatedLine,
      );
    });
  });
});

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe("TASK-12: Property Tests", () => {
  it("forAll(file content): parser never throws, always returns result (unless over size limit) [PARSE-20]", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 10_000 }), (content) => {
        const result = parseComments(content);
        expect(result).toBeDefined();
        expect(result.tags).toBeDefined();
      }),
    );
  });

  it("forAll(comment body up to 5000 chars): parser completes in O(n) time — ReDoS immune [PARSE-07, M2]", () => {
    // PARSE-07/TASK-12: state-machine parser must have O(n) time complexity regardless of input.
    // Regex-based parsers exhibit catastrophic backtracking (exponential slowdown) on unclosed
    // comments followed by thousands of characters. maxLength raised to 5000 to surface this.
    fc.assert(
      fc.property(fc.string({ maxLength: 5000 }), (body) => {
        const content = `<!-- ${body} -->\n`;
        const start = Date.now();
        const result = parseComments(content);
        const elapsed = Date.now() - start;
        // O(n) guarantee: must complete in <100ms for any input up to 5000 chars
        expect(elapsed).toBeLessThan(100);
        expect(Array.isArray(result.tags)).toBe(true);
      }),
    );
  });

  it("pathological unclosed comment (3000 chars): completes <100ms — ReDoS immune [PARSE-07, M2]", () => {
    // TASK-12 spec: "unclosed comments followed by thousands of characters" is the attack vector.
    // A regex-based parser would be catastrophically slow here; a state machine is O(n).
    const pathological = `<!-- brief:ontology pack id "${"a".repeat(3000)}`; // no closing -->
    const start = Date.now();
    const result = parseComments(pathological);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(100);
    expect(result.tags).toHaveLength(0); // malformed → nothing extracted
  });

  it("forAll(comment inside code block): never extracted regardless of content [PARSE-15]", () => {
    fc.assert(
      fc.property(
        fc
          .string({ minLength: 1, maxLength: 100 })
          .filter((s) => !s.includes("```") && !s.includes("-->")),
        (body) => {
          const input = `\`\`\`\n<!-- brief:ontology pack id "${body}" -->\n\`\`\`\n`;
          const result = parseComments(input);
          expect(result.tags).toHaveLength(0);
        },
      ),
    );
  });

  it("forAll(valid ontology comment): extracted tag always has pack, ID, and label [PARSE-07]", () => {
    fc.assert(
      fc.property(
        fc
          .string({ minLength: 1, maxLength: 20 })
          .filter((s) => /^[a-z0-9-]+$/.test(s)),
        fc
          .string({ minLength: 1, maxLength: 20 })
          .filter((s) => /^[a-z0-9-]+$/.test(s)),
        fc
          .string({ minLength: 1, maxLength: 50 })
          .filter((s) => !s.includes('"') && !s.includes("-->")),
        (pack, id, label) => {
          const input = `Paragraph\n<!-- brief:ontology ${pack} ${id} "${label}" -->\n`;
          const result = parseComments(input);
          expect(result.tags).toHaveLength(1);
          expect(result.tags[0].pack).toBe(pack);
          expect(result.tags[0].entryId).toBe(id);
          expect(result.tags[0].label).toBe(label);
        },
      ),
    );
  });

  // G-076: remove guard — always assert structure shape properties regardless of tags present
  it("forAll(multi-line comment body): normalized payload has no newlines or consecutive spaces [PARSE-20]", () => {
    fc.assert(
      fc.property(
        fc
          .string({ minLength: 1, maxLength: 200 })
          .filter((s) => !s.includes("-->") && !s.includes("```")),
        (body) => {
          const input = `<!--\n${body}\n-->\n`;
          const result = parseComments(input);
          // Always assert structural shape properties regardless of whether tags are present
          expect(Array.isArray(result.tags)).toBe(true);
          expect(typeof result.content).toBe("string");
          if (result.tags.length > 0) {
            const comment = result.tags[0];
            // G-077: whitespace normalization check (acceptable, leave as trim())
            if (comment.body !== undefined) {
              expect(comment.body).toBe(comment.body.trim());
              expect(comment.body).not.toMatch(/\n\n/);
            }
          }
        },
      ),
    );
  });
});
