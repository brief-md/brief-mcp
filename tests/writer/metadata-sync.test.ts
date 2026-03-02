import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  checkIdempotentExtension,
  checkIdempotentTag,
  preserveToolSpecificSections,
  syncExtensionMetadata,
  syncOntologyMetadata,
  translateExtensionName,
  validateExtensionName,
  writeExternalSessionBreadcrumb,
} from "../../src/writer/metadata-sync";

// ---------------------------------------------------------------------------
// Unit Tests
// ---------------------------------------------------------------------------

describe("TASK-16: Writer — Metadata Sync & Section Targeting", () => {
  describe("extension metadata sync [WRITE-05]", () => {
    it("add extension: name appears in Extensions metadata in lowercase_underscore format [WRITE-05]", async () => {
      const input =
        "**Project:** Test\n**Extensions:** \n## What This Is\nContent\n";
      const result = await syncExtensionMetadata(input, {
        action: "add",
        extensionName: "SONIC ARTS",
      });
      expect(result).toContain("sonic_arts");
    });

    it("add extension when heading uses ALL CAPS: metadata uses lowercase_underscores [WRITE-08]", async () => {
      const result = translateExtensionName("SONIC ARTS", "toMetadata");
      expect(result).toBe("sonic_arts");
    });

    it("remove extension: name removed from Extensions metadata field [WRITE-12]", async () => {
      const input = "**Extensions:** sonic_arts, narrative_creative\n";
      const result = await syncExtensionMetadata(input, {
        action: "remove",
        extensionName: "sonic_arts",
      });
      expect(result).not.toContain("sonic_arts");
      expect(result).toContain("narrative_creative");
    });
  });

  describe("ontology metadata sync [WRITE-05]", () => {
    // G-102: use canonical property — syncOntologyMetadata returns content string directly
    it("tag with new ontology pack: pack name added to Ontologies metadata field [WRITE-05]", async () => {
      const input = "**Ontologies:** \n";
      const result = await syncOntologyMetadata(input, {
        pack: "theme-ontology",
        version: "v2024.1",
      });
      expect(result).toContain("theme-ontology");
      expect(result).toMatch(/\(v[\d.]+\)/);
    });
  });

  describe("idempotent ontology tagging [WRITE-15]", () => {
    it("tag same paragraph with same pack and entry: returns already-tagged flag [WRITE-15]", async () => {
      const input =
        'Some paragraph.\n<!-- brief:ontology theme-pack entry-1 "Theme A" -->\n';
      const result = await checkIdempotentTag(input, {
        pack: "theme-pack",
        entryId: "entry-1",
        label: "Theme A",
        targetLine: 1,
      });
      expect(result.alreadyTagged).toBe(true);
    });

    it("tag same entry with different label: existing comment label updated [WRITE-15]", async () => {
      const input =
        'Paragraph.\n<!-- brief:ontology theme-pack entry-1 "Old Label" -->\n';
      const result = await checkIdempotentTag(input, {
        pack: "theme-pack",
        entryId: "entry-1",
        label: "New Label",
        targetLine: 1,
      });
      expect(result.alreadyTagged).toBe(false);
      expect(result.content).toContain("New Label");
    });
  });

  describe("idempotent extension creation [WRITE-18]", () => {
    it("create extension that already exists: returns already-exists flag [WRITE-18]", async () => {
      const input =
        "**Extensions:** sonic_arts\n## SONIC ARTS\nExisting content\n";
      const result = await checkIdempotentExtension(input, "SONIC ARTS");
      expect(result.alreadyExists).toBe(true);
      expect(result.existingContent).toContain("Existing content");
    });

    it("extension heading exists but not in metadata: metadata updated to include it [WRITE-18]", async () => {
      const input = "**Extensions:** \n## SONIC ARTS\nContent\n";
      const result = await checkIdempotentExtension(input, "SONIC ARTS");
      expect(result.metadataUpdated).toBe(true);
    });
  });

  describe("external session breadcrumb [WRITE-16a]", () => {
    // G-103: use canonical property (result is the content string) + assert full format
    it("external session breadcrumb appended in correct format [WRITE-16a]", async () => {
      const input = "## Open Questions\nContent\n";
      const result = await writeExternalSessionBreadcrumb(input, {
        date: "2026-02-20",
        tool: "Ableton Live",
        decisionCount: 3,
        titles: [
          "Key set to F minor",
          "Tempo locked at 82 BPM",
          "Reverb on bus",
        ],
      });
      // Spec format: "- [session_date] [tool]: [n] decisions captured — [comma-separated decision titles]"
      expect(result).toContain("2026-02-20");
      expect(result).toContain("Ableton Live");
      expect(result).toContain("3 decisions captured");
      // Assert full breadcrumb format with date, tool, count, and comma-separated titles
      expect(result).toMatch(/- 2026-02-20 Ableton Live: 3 decisions captured/);
      expect(result).toMatch(/Key set to F minor,/);
    });

    it("External Tool Sessions sub-section missing: created on first breadcrumb write [WRITE-16a]", async () => {
      const input = "## Key Decisions\n### Some Decision\nWHAT: X\n";
      const result = await writeExternalSessionBreadcrumb(input, {
        date: "2026-02-20",
        tool: "Figma",
        decisionCount: 1,
        titles: ["Use design tokens"],
      });
      expect(result).toContain("## External Tool Sessions");
    });
  });

  describe("extension name validation [SEC-19]", () => {
    it("extension name with valid characters (A-Z, 0-9, spaces) is accepted [SEC-19]", () => {
      expect(() => validateExtensionName("SONIC ARTS")).not.toThrow();
      expect(() => validateExtensionName("NARRATIVE CREATIVE")).not.toThrow();
    });

    it("extension name with invalid characters rejected with error [SEC-19]", () => {
      expect(() => validateExtensionName("sonic_arts")).toThrow();
      expect(() => validateExtensionName("SONIC-ARTS!")).toThrow();
    });
  });

  describe("tool-specific section preservation [WRITE-09]", () => {
    it("file with tool-specific sections from other tools: preserved byte-for-byte [WRITE-09]", async () => {
      const toolSection =
        "# TOOL SPECIFIC: Cursor\nCursor settings here\nKeep this exact content.\n";
      const input = `**Project:** Test\n## What This Is\nContent\n${toolSection}`;
      const result = await preserveToolSpecificSections(input, {
        modifySection: "What This Is",
        newContent: "Updated content",
      });
      expect(result).toContain(toolSection);
    });
  });

  describe("brief-mcp tool-specific section policy [WRITE-10]", () => {
    it("attempt to write brief-mcp tool-specific section when data fits in core section: rejected [WRITE-10]", async () => {
      // The writer should refuse to create a brief-mcp tool-specific section
      // when the data can go elsewhere
      await expect(
        preserveToolSpecificSections("## What This Is\nContent\n", {
          modifySection: "TOOL SPECIFIC: brief-mcp",
          newContent: "Could go in core section",
          canFitInCoreSection: true,
        }),
      ).rejects.toThrow(/last resort|policy/i);
    });
  });

  describe("canonical metadata order [WRITE-11]", () => {
    // G-104: remove conditional guard — guarantee typeFieldIdx exists by using known-good test data
    it("new file metadata written in canonical order [WRITE-11]", async () => {
      const input = "";
      const result = await syncExtensionMetadata(input, {
        action: "add",
        extensionName: "TEST EXT",
        isNewFile: true,
      });
      expect(result).toContain("**Project:**");
      expect(result).toContain("**Type:**");
      const projectIdx = result.indexOf("**Project:**");
      const typeIdx = result.indexOf("**Type:**");
      expect(projectIdx).toBeLessThan(typeIdx);
      const fieldNames = (result.match(/\*\*([A-Za-z]+):\*\*/g) ?? []).map(
        (m: string) => m.replace(/\*\*/g, "").replace(":", ""),
      );
      const typeFieldIdx = fieldNames.indexOf("Type");
      const createdFieldIdx = fieldNames.indexOf("Created");
      // Remove conditional guard — new file MUST have both Type and Created in canonical order
      expect(typeFieldIdx).not.toBe(-1);
      expect(createdFieldIdx).not.toBe(-1);
      expect(typeFieldIdx).toBeLessThan(createdFieldIdx);
    });

    it("update one metadata field in existing file: only that value changes [WRITE-11]", async () => {
      const input = "**Type:** Library\n**Project:** Test\n**Extensions:** \n";
      const result = await syncExtensionMetadata(input, {
        action: "add",
        extensionName: "SONIC ARTS",
      });
      // Type and Project should remain in original order
      const typeIdx = result.indexOf("**Type:**");
      const projectIdx = result.indexOf("**Project:**");
      expect(typeIdx).toBeLessThan(projectIdx);
    });
  });

  describe("version field [OQ-091]", () => {
    // G-105: assert version field matches a version-like pattern
    it("Version field set on new file contains spec version string, not project version [OQ-091]", async () => {
      const result = await syncExtensionMetadata("", {
        action: "add",
        extensionName: "TEST",
        isNewFile: true,
      });
      expect(result).toContain("**Version:**");
      // Assert the version value is a semver-like string (e.g., "1.0" or "1.0.0")
      expect(result).toMatch(/\*\*Version:\*\*\s*\d+\.\d+/);
    });
  });
});

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe("TASK-16: Property Tests", () => {
  it("forAll(extension name): heading format <-> metadata format translation is reversible [WRITE-08]", () => {
    fc.assert(
      fc.property(
        fc
          .string({ minLength: 1, maxLength: 20 })
          .filter((s) => /^[A-Z][A-Z0-9 ]*$/.test(s) && !s.endsWith(" ")),
        (headingName) => {
          const metadata = translateExtensionName(headingName, "toMetadata");
          const backToHeading = translateExtensionName(metadata, "toHeading");
          expect(backToHeading).toBe(headingName);
        },
      ),
    );
  });

  it("forAll(tag operation): idempotent — applying same tag twice produces identical file content [WRITE-15]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .string({ minLength: 1, maxLength: 20 })
          .filter((s) => /^[a-z0-9-]+$/.test(s)),
        fc
          .string({ minLength: 1, maxLength: 20 })
          .filter((s) => /^[a-z0-9-]+$/.test(s)),
        async (pack, entryId) => {
          const input = "Paragraph text.\n";
          const tagOp = { pack, entryId, label: "Test Label", targetLine: 1 };
          const result1 = await checkIdempotentTag(input, tagOp);
          if (!result1.alreadyTagged && result1.content) {
            const result2 = await checkIdempotentTag(result1.content, tagOp);
            expect(result2.alreadyTagged).toBe(true);
          }
        },
      ),
      { numRuns: 10 },
    );
  });

  it("forAll(write operation): all tool-specific sections from other tools preserved byte-for-byte [WRITE-09]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .string({ minLength: 1, maxLength: 20 })
          .filter((s) => /^[a-zA-Z]+$/.test(s)),
        fc
          .string({ minLength: 1, maxLength: 100 })
          .filter((s) => /^[a-zA-Z0-9 .]+$/.test(s)),
        async (toolName, toolContent) => {
          const toolSection = `# TOOL SPECIFIC: ${toolName}\n${toolContent}\n`;
          const input = `## What This Is\nContent\n${toolSection}`;
          const result = await preserveToolSpecificSections(input, {
            modifySection: "What This Is",
            newContent: "Updated",
          });
          expect(result).toContain(toolSection);
        },
      ),
      { numRuns: 10 },
    );
  });

  // G-106 (LOW): Invalid extension name filter — acceptable, leave as-is
  it("forAll(extension name in [A-Z0-9 ]+): create succeeds; outside that set: create fails [SEC-19]", () => {
    fc.assert(
      fc.property(
        fc
          .string({ minLength: 1, maxLength: 20 })
          .filter((s) => /^[A-Z][A-Z0-9 ]*[A-Z0-9]$/.test(s)),
        (validName) => {
          expect(() => validateExtensionName(validName)).not.toThrow();
        },
      ),
    );

    fc.assert(
      fc.property(
        fc
          .string({ minLength: 1, maxLength: 20 })
          .filter((s) => /[^A-Z0-9 ]/.test(s) && s.length > 0),
        (invalidName) => {
          expect(() => validateExtensionName(invalidName)).toThrow();
        },
      ),
    );
  });
});
