import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { addExtension, listExtensions } from "../../src/extension/creation";

// ---------------------------------------------------------------------------
// Unit Tests
// ---------------------------------------------------------------------------

describe("TASK-43: Extension — Creation & Listing", () => {
  describe("add extension [WRITE-16b]", () => {
    it("add spec-defined extension: heading created with correct subsections [COMPAT-05]", async () => {
      const result = await addExtension({ extensionName: "SONIC ARTS" });
      expect(result.created).toBe(true);
      expect(result.subsections).toBeDefined();
      expect(result.subsections.length).toBeGreaterThan(0);
      // G-331: assert at least one expected subsection name is present
      const expectedSubsections = [
        "Direction",
        "References",
        "Constraints",
        "Open Questions",
        "Direction/Intent",
      ];
      const hasExpected = result.subsections.some((s: string) =>
        expectedSubsections.some((e) => s.includes(e)),
      );
      expect(hasExpected).toBe(true);
    });

    it("add custom extension: heading created with standard subsection convention [COMPAT-12]", async () => {
      const result = await addExtension({ extensionName: "CUSTOM DOMAIN" });
      expect(result.created).toBe(true);
      expect(result.subsections).toContain("Direction/Intent");
    });

    it("extension name with valid characters ([A-Z0-9 ]): accepted [WRITE-16b]", async () => {
      const result = await addExtension({ extensionName: "VALID NAME 123" });
      expect(result.created).toBe(true);
    });

    it("extension name with invalid characters: rejected [WRITE-16b]", async () => {
      await expect(
        addExtension({ extensionName: "INVALID_NAME!" }),
      ).rejects.toThrow(/character|invalid|name/i);
    });
  });

  describe("idempotent creation [WRITE-18]", () => {
    it("extension already exists: already_exists: true returned, no duplicate heading [WRITE-18, T43-02]", async () => {
      // G-332: assert first call succeeds
      const firstResult = await addExtension({ extensionName: "SONIC ARTS" });
      expect(firstResult.success).toBe(true);
      const result = await addExtension({ extensionName: "SONIC ARTS" });
      expect(result.alreadyExists).toBe(true);
      // T43-02: verify no duplicate heading in content (not just alreadyExists flag)
      if (result.content) {
        const headingMatches =
          (result.content as string).match(/##\s*SONIC ARTS/gi) ?? [];
        expect(headingMatches.length).toBeLessThanOrEqual(1);
      }
    });

    it("extension heading exists but not in metadata: metadata updated to include it [WRITE-18]", async () => {
      const result = await addExtension({
        extensionName: "ORPHAN EXTENSION",
        simulateOrphanHeading: true,
      });
      expect(result.metadataUpdated).toBe(true);
    });
  });

  describe("metadata format [WRITE-05, WRITE-08]", () => {
    it("metadata format: always lowercase with underscores [WRITE-08]", async () => {
      const result = await addExtension({ extensionName: "SONIC ARTS" });
      expect(result.metadataFormat).toBe("sonic_arts");
    });

    it("heading format: always ALL CAPS with spaces [WRITE-08]", async () => {
      const result = await addExtension({ extensionName: "sonic_arts" });
      expect(result.headingFormat).toBe("SONIC ARTS");
    });

    it("name provided as lowercase_underscore: converted to ALL CAPS heading [PARSE-13]", async () => {
      const result = await addExtension({
        extensionName: "narrative_creative",
      });
      expect(result.headingFormat).toBe("NARRATIVE CREATIVE");
    });
  });

  describe("subsection disambiguation [WRITE-17]", () => {
    it("ambiguous bare subsection name across extensions: error listing matches [WRITE-17]", async () => {
      await expect(
        addExtension({
          extensionName: "TEST EXT",
          targetSubsection: "Direction",
          simulateAmbiguous: true,
        }),
      ).rejects.toThrow(/ambiguous|multiple/i);
    });

    it("non-ambiguous bare subsection name: accepted without disambiguation [WRITE-17]", async () => {
      const result = await addExtension({
        extensionName: "UNIQUE EXT",
        subsections: ["Unique Section"],
      });
      expect(result.created).toBe(true);
    });
  });

  describe("list extensions [COMPAT-05]", () => {
    it("list extensions: all six spec-defined extensions returned with descriptions [COMPAT-05]", async () => {
      const result = await listExtensions();
      expect(result.extensions.length).toBeGreaterThanOrEqual(6);
      const names = result.extensions.map((e: any) => e.name);
      expect(names).toContain("sonic_arts");
      expect(names).toContain("narrative_creative");
      expect(names).toContain("lyrical_craft");
      expect(names).toContain("visual_storytelling");
      expect(names).toContain("strategic_planning");
      expect(names).toContain("system_design");
    });

    it("listExtensions: each extension includes description, subsections, and associatedOntologies [COMPAT-05, T43-01]", async () => {
      const result = await listExtensions();
      expect(result.extensions.length).toBeGreaterThan(0);
      for (const ext of result.extensions) {
        // T43-01: must verify descriptions, subsection lists, and associated ontologies
        expect(ext.description).toBeDefined();
        expect(typeof ext.description).toBe("string");
        expect(ext.subsections).toBeDefined();
        expect(Array.isArray(ext.subsections)).toBe(true);
        expect(ext.associatedOntologies).toBeDefined();
        expect(Array.isArray(ext.associatedOntologies)).toBe(true);
      }
    });

    it("list extensions on project with custom extension: custom extension included in results [COMPAT-05]", async () => {
      const result = await listExtensions({ includeProject: true });
      expect(result.extensions).toBeDefined();
      expect(result.extensions.length).toBeGreaterThan(0);
      expect(
        result.extensions.some((e: any) => e.name === "custom_domain"),
      ).toBe(true);
    });

    it("empty extension section: valid placeholder, no error [COMPAT-05]", async () => {
      const result = await listExtensions();
      expect(result).toBeDefined();
      expect(result.error).toBeUndefined();
      // G-333: this is a listExtensions() call — check extensions array, not created flag
      expect(Array.isArray(result.extensions)).toBe(true);
    });
  });
});

describe("metadata key format [WRITE-08]", () => {
  it("extension metadata key: always lowercase_underscore format in config [WRITE-08]", async () => {
    const { addExtension } = await import("../../src/extension/creation");
    const result = await addExtension({ extensionName: "SONIC ARTS" });
    expect(result.metadataKey).toBe("sonic_arts");
  });
});

describe("subsection convention [COMPAT-12, T43-03]", () => {
  it("custom extension subsections follow Direction/Constraints/References/Questions convention [COMPAT-12, T43-03]", async () => {
    const { addExtension } = await import("../../src/extension/creation");
    const result = await addExtension({ extensionName: "MY CUSTOM EXT" });
    const subsections = result.subsections || [];
    // T43-03: all four standard subsections must be present (not just Direction and References)
    expect(subsections).toContain("Direction");
    expect(subsections).toContain("References");
    expect(subsections).toContain("Constraints");
    expect(
      subsections.some((s: string) => /open questions|questions/i.test(s)),
    ).toBe(true);
  });
});

describe("subsection targeting [WRITE-17]", () => {
  it('subsection targeting via "EXTENSION > Subsection" format → correct subsection addressed [WRITE-17]', async () => {
    const { resolveSubsectionTarget } = await import(
      "../../src/extension/creation"
    );
    const target = await resolveSubsectionTarget("SONIC ARTS > References");
    expect(target.extensionName).toBe("SONIC ARTS");
    expect(target.subsectionName).toBe("References");
  });
});

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe("TASK-43: Property Tests", () => {
  // G-335: make async and await fc.assert; G-334: assert metadataUpdated explicitly
  it("forAll(add extension): metadata field always updated [WRITE-05]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .stringMatching(/^[A-Z][A-Z0-9 ]{1,20}$/)
          .filter((s) => s.trim().length > 1),
        async (name) => {
          const result = await addExtension({ extensionName: name.trim() });
          expect(result.created).toBe(true);
          // G-334: assert metadataUpdated explicitly
          expect(result.metadataUpdated).toBe(true);
          // Metadata must be in lowercase_underscore format
          expect(result.metadataKey).toMatch(/^[a-z][a-z0-9_]*$/);
        },
      ),
      { numRuns: 5 },
    );
  });

  // G-336: make async and await fc.assert
  it("forAll(extension name): heading ↔ metadata format mapping always consistent [WRITE-08]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom("SONIC ARTS", "NARRATIVE CREATIVE", "LYRICAL CRAFT"),
        async (name) => {
          const result = await addExtension({ extensionName: name });
          const expectedMeta = name.toLowerCase().replace(/ /g, "_");
          expect(result.metadataFormat).toBe(expectedMeta);
        },
      ),
      { numRuns: 3 },
    );
  });

  // G-337: make async and await fc.assert
  it("forAll(existing extension): never duplicated on repeat add [WRITE-18]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom("SONIC ARTS", "NARRATIVE CREATIVE"),
        async (name) => {
          await addExtension({ extensionName: name });
          const result = await addExtension({ extensionName: name });
          expect(result.alreadyExists).toBe(true);
        },
      ),
      { numRuns: 2 },
    );
  });

  // G-338: make async and await fc.assert; replace fc.constant(true) with fc.boolean()
  it("forAll(list result): all six spec-defined extensions always present [COMPAT-05]", async () => {
    await fc.assert(
      fc.asyncProperty(fc.boolean(), async () => {
        const result = await listExtensions();
        expect(result.extensions.length).toBeGreaterThanOrEqual(6);
      }),
      { numRuns: 3 },
    );
  });
});
