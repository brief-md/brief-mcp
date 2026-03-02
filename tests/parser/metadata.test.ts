import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  normalizeFieldName,
  normalizeType,
  parseExtensionsList,
  parseMetadata,
  parseOntologiesList,
} from "../../src/parser/metadata";

// ---------------------------------------------------------------------------
// Unit Tests
// ---------------------------------------------------------------------------

describe("TASK-09: Parser — Metadata Extraction", () => {
  describe("bold markdown metadata format [PARSE-04]", () => {
    it("bold markdown field (**Project:** Foo) extracts field name and value [PARSE-04]", () => {
      const input = "**Project:** Foo\n**Type:** Software Library\n";
      const result = parseMetadata(input);
      expect(result.fields.get("Project")).toBe("Foo");
    });

    it("bold markdown with extra space before colon (**Project :** Foo) extracts identically [PARSE-04]", () => {
      const input = "**Project :** Foo\n";
      const result = parseMetadata(input);
      expect(result.fields.get("Project")).toBe("Foo");
    });
  });

  describe("plain text metadata format [PARSE-04]", () => {
    it("plain text field (Project: Foo) extracts identically to bold format [PARSE-04]", () => {
      const input = "Project: Foo\n";
      const result = parseMetadata(input);
      expect(result.fields.get("Project")).toBe("Foo");
    });
  });

  describe("YAML frontmatter consumed range [PARSE-04]", () => {
    it("YAML frontmatter parsing reports consumed byte range so section parser knows where body begins [PARSE-04]", () => {
      const input =
        "---\nproject: Foo\ntype: Library\n---\n## What This Is\nBody content\n";
      const result = parseMetadata(input);
      // consumedRange tells downstream parsers where frontmatter ends
      expect(result.consumedRange).toBeDefined();
      expect(result.consumedRange.start).toBe(0);
      expect(result.consumedRange.end).toBeGreaterThan(0);
      // End should be at or after the closing --- delimiter
      expect(result.consumedRange.end).toBeLessThanOrEqual(input.length);
      // Body content should be outside the consumed range
      const bodyStart = input.indexOf("## What This Is");
      expect(result.consumedRange.end).toBeLessThanOrEqual(bodyStart + 1);
    });

    it("file without YAML frontmatter has consumed range of (0, 0) [PARSE-04]", () => {
      const input = "**Project:** Foo\n**Type:** Library\n";
      const result = parseMetadata(input);
      // No frontmatter consumed — both start and end at 0
      expect(result.consumedRange).toBeDefined();
      expect(result.consumedRange.start).toBe(0);
      expect(result.consumedRange.end).toBe(0);
    });
  });

  describe("YAML frontmatter [PARSE-04]", () => {
    it("YAML frontmatter with fields extracts identically to inline format [PARSE-04]", () => {
      const input = "---\nproject: Foo\ntype: Software Library\n---\n";
      const result = parseMetadata(input);
      expect(result.fields.get("Project")).toBe("Foo");
      // G-054: use canonical property name, assert specific type (string)
      expect(typeof result.fields.get("Type")).toBe("string");
    });

    it("YAML and inline both define same field: inline value wins [PARSE-04]", () => {
      const input = "---\nproject: YamlValue\n---\n**Project:** InlineValue\n";
      const result = parseMetadata(input);
      expect(result.fields.get("Project")).toBe("InlineValue");
    });

    it("malformed YAML frontmatter produces warning, falls back to inline extraction [PARSE-04]", () => {
      const input = "---\n{broken yaml content\n---\n**Project:** Fallback\n";
      const result = parseMetadata(input);
      expect(result.fields.get("Project")).toBe("Fallback");
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe("required fields [PARSE-10]", () => {
    it("all three required fields present produces no missing-field warnings [PARSE-10]", () => {
      const input =
        "**Project:** Foo\n**Type:** Library\n**Created:** 2025-01-01\n";
      const result = parseMetadata(input);
      const missingWarnings = result.warnings.filter((w) =>
        /required|missing/i.test(w),
      );
      expect(missingWarnings).toHaveLength(0);
    });

    it("missing one required field produces warning for that field, parsing continues [PARSE-10]", () => {
      const input = "**Project:** Foo\n**Type:** Library\n";
      const result = parseMetadata(input);
      const missingWarnings = result.warnings.filter((w) => /created/i.test(w));
      expect(missingWarnings.length).toBeGreaterThan(0);
      expect(result.fields.get("Project")).toBe("Foo");
    });

    it("missing all required fields produces three warnings, parsing still succeeds [PARSE-10]", () => {
      const input = "**Status:** Active\n";
      const result = parseMetadata(input);
      const missingWarnings = result.warnings.filter((w) =>
        /required|missing/i.test(w),
      );
      expect(missingWarnings).toHaveLength(3);
      expect(result.fields.get("Status")).toBe("Active");
    });
  });

  describe("empty metadata region [PARSE-01]", () => {
    it("empty metadata region returns valid result with no fields and warnings [PARSE-01]", () => {
      const input = "## What This Is\nSome content\n";
      const result = parseMetadata(input);
      expect(result.fields.size).toBe(0);
      // G-055: use one canonical property name
      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/Project/i),
          expect.stringMatching(/Type/i),
          expect.stringMatching(/Created/i),
        ]),
      );
    });
  });

  describe("field name normalization [PARSE-04]", () => {
    it("field names differing only in case resolve to same canonical field [PARSE-04]", () => {
      const result1 = normalizeFieldName("project");
      const result2 = normalizeFieldName("PROJECT");
      const result3 = normalizeFieldName("Project");
      expect(result1).toBe(result2);
      expect(result2).toBe(result3);
    });
  });

  describe("extensions parsing [PARSE-13, PARSE-22]", () => {
    it("extensions with heading format (SONIC ARTS) normalized to sonic_arts [PARSE-13]", () => {
      const result = parseExtensionsList("SONIC ARTS, NARRATIVE CREATIVE");
      expect(result).toContain("sonic_arts");
      expect(result).toContain("narrative_creative");
    });

    it("extensions with commas and whitespace are split and trimmed [PARSE-22]", () => {
      const result = parseExtensionsList("  sonic_arts , narrative_creative  ");
      expect(result).toHaveLength(2);
      expect(result[0]).toBe("sonic_arts");
      // G-056: toHaveLength(2) already guarantees result[1] exists — strengthen slightly
      expect(result[1]).toBe("narrative_creative");
    });
  });

  describe("ontologies parsing [PARSE-23]", () => {
    it("ontology with version syntax extracts name and version separately [PARSE-23]", () => {
      const result = parseOntologiesList("theme-ontology (v2024.1)");
      expect(result[0].name).toBe("theme-ontology");
      expect(result[0].version).toBe("v2024.1");
    });

    it("ontology with excludes syntax extracts name and excludes list [PARSE-23]", () => {
      const result = parseOntologiesList(
        "musicbrainz-genres (excludes: custom-themes)",
      );
      expect(result[0].name).toBe("musicbrainz-genres");
      expect(result[0].excludes).toContain("custom-themes");
    });
  });

  describe("value and content preservation [PARSE-22, COMPAT-01]", () => {
    it("value containing markdown (My **Bold** Project) preserved as literal text [PARSE-22]", () => {
      const input = "**Project:** My **Bold** Project\n";
      const result = parseMetadata(input);
      expect(result.fields.get("Project")).toBe("My **Bold** Project");
    });

    it("non-Extensions field containing commas is not split [PARSE-22]", () => {
      const input = "**Project:** First, Second, Third\n";
      const result = parseMetadata(input);
      expect(result.fields.get("Project")).toBe("First, Second, Third");
    });

    it("unknown metadata field is preserved in output [COMPAT-01]", () => {
      const input = "**CustomField:** custom value\n";
      const result = parseMetadata(input);
      expect(result.fields.get("CustomField")).toBe("custom value");
    });
  });

  describe("version compatibility [COMPAT-03]", () => {
    it("spec_version 1.3 accepted silently; 2.0 produces warning, parsing continues [COMPAT-03]", () => {
      const input1 = "**Version:** 1.3\n**Project:** Test\n";
      const result1 = parseMetadata(input1);
      const v1Warnings = result1.warnings.filter((w) => /version/i.test(w));
      expect(v1Warnings).toHaveLength(0);

      const input2 = "**Version:** 2.0\n**Project:** Test\n";
      const result2 = parseMetadata(input2);
      const v2Warnings = result2.warnings.filter((w) => /version/i.test(w));
      expect(v2Warnings.length).toBeGreaterThan(0);
      expect(result2.fields.get("Project")).toBe("Test");
    });
  });

  describe("type normalization [COMPAT-06]", () => {
    it('Type "Software Library" normalized to "software-library" [COMPAT-06]', () => {
      const result = normalizeType("Software Library");
      expect(result).toBe("software-library");
    });
  });

  describe("field order tracking [PARSE-04]", () => {
    it("field order in output matches source appearance order [PARSE-04]", () => {
      const input =
        "**Type:** Library\n**Project:** Foo\n**Created:** 2025-01-01\n";
      const result = parseMetadata(input);
      const fieldNames = Array.from(result.fieldOrder);
      expect(fieldNames.indexOf("Type")).toBeLessThan(
        fieldNames.indexOf("Project"),
      );
      expect(fieldNames.indexOf("Project")).toBeLessThan(
        fieldNames.indexOf("Created"),
      );
    });
  });
});

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe("TASK-09: Property Tests", () => {
  it("forAll(field name string): case-insensitive lookup resolves consistently regardless of casing [PARSE-04]", () => {
    fc.assert(
      fc.property(
        fc
          .string({ minLength: 1, maxLength: 30 })
          .filter((s) => /^[a-zA-Z_]+$/.test(s)),
        (name) => {
          const lower = normalizeFieldName(name.toLowerCase());
          const upper = normalizeFieldName(name.toUpperCase());
          const mixed = normalizeFieldName(name);
          expect(lower).toBe(upper);
          expect(upper).toBe(mixed);
        },
      ),
    );
  });

  it("forAll(valid metadata content): parser never throws, always returns structured result [PARSE-01]", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 5000 }), (content) => {
        const result = parseMetadata(content);
        expect(result).toBeDefined();
        expect(result.fields).toBeDefined();
        // G-057: add typeof checks for key fields
        expect(result.fields instanceof Map).toBe(true);
        expect(Array.isArray(result.warnings)).toBe(true);
        expect(result.fieldOrder).toBeDefined();
      }),
    );
  });

  it("forAll(list of extension names): comma-split-then-trim count equals input item count [PARSE-22]", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc
            .string({ minLength: 1, maxLength: 20 })
            .filter((s) => /^[a-zA-Z_]+$/.test(s) && !s.includes(",")),
          { minLength: 1, maxLength: 10 },
        ),
        (names) => {
          const input = names.join(", ");
          const result = parseExtensionsList(input);
          expect(result).toHaveLength(names.length);
        },
      ),
    );
  });

  // G-058: exclude known field names from generation, remove ?? fallback chain
  it("forAll(metadata with unknown fields): unknown fields appear in output exactly as written [COMPAT-01]", () => {
    const knownFields = [
      "Project",
      "Type",
      "Created",
      "Updated",
      "Status",
      "Extensions",
      "Ontologies",
      "Version",
    ];
    fc.assert(
      fc.property(
        fc
          .string({ minLength: 1, maxLength: 20 })
          .filter((s) => /^[a-zA-Z]+$/.test(s))
          .filter(
            (s) =>
              !knownFields
                .map((k) => k.toLowerCase())
                .includes(s.toLowerCase()),
          ),
        fc.string({ minLength: 1, maxLength: 100 }),
        (fieldName, value) => {
          const input = `**${fieldName}:** ${value}\n`;
          const result = parseMetadata(input);
          expect(result.fields.get(fieldName)).toBe(value);
        },
      ),
    );
  });

  it("forAll(Type value): normalized form contains only lowercase letters, digits, and hyphens [COMPAT-06]", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 50 }), (typeValue) => {
        const normalized = normalizeType(typeValue);
        expect(normalized).toMatch(/^[a-z0-9-]*$/);
      }),
    );
  });

  // G-059: use one canonical property (result.fields.get('Project'))
  it("forAll(YAML + inline with overlapping keys): inline always takes precedence [PARSE-04]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .string({ minLength: 1, maxLength: 50 })
          .filter((s) => /^[a-zA-Z][a-zA-Z0-9 ]*$/.test(s)),
        fc
          .string({ minLength: 1, maxLength: 50 })
          .filter((s) => /^[a-zA-Z][a-zA-Z0-9 ]*$/.test(s)),
        async (yamlValue, inlineValue) => {
          const { parseMetadata } = await import("../../src/parser/metadata");
          const content = `---\nProject: ${yamlValue}\n---\n\n**Project:** ${inlineValue}\n`;
          const result = parseMetadata(content);
          expect(result.fields.get("Project")).toBe(inlineValue);
        },
      ),
    );
  });

  // G-060: assert result of parseMetadata contains ontologies field directly
  it("Ontologies field with version AND excludes on same entry → both parsed [PARSE-23]", async () => {
    const { parseMetadata } = await import("../../src/parser/metadata");
    const content = `**Ontologies:** theme-pack (v2024.1) (excludes: custom-themes)\n`;
    const result = parseMetadata(content);
    const ontologiesRaw = result.fields.get("Ontologies");
    expect(ontologiesRaw).toBeDefined();
    const onto = parseOntologiesList(String(ontologiesRaw));
    expect(onto[0].name).toBe("theme-pack");
    expect(onto[0].version).toBe("v2024.1");
    expect(onto[0].excludes).toContain("custom-themes");
  });
});
