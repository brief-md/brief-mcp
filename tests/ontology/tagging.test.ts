import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { tagEntry } from "../../src/ontology/tagging";

// ---------------------------------------------------------------------------
// Unit Tests
// ---------------------------------------------------------------------------

describe("TASK-36: Ontology — Tagging Tool", () => {
  describe("basic tagging [ONT-21, ONT-12]", () => {
    it("tag entry on paragraph: HTML comment written after target paragraph [ONT-21]", async () => {
      const result = await tagEntry({
        ontology: "theme-pack",
        entryId: "nostalgia",
        section: "Direction",
      });
      expect(result.tagged).toBe(true);
      expect(result.comment).toMatch(/<!-- brief:ontology/);
    });

    it("tag with valid pack and entry: comment includes pack, id, and label [ONT-12, T36-02]", async () => {
      const result = await tagEntry({
        ontology: "theme-pack",
        entryId: "nostalgia",
        section: "Direction",
      });
      expect(result.comment).toContain("theme-pack");
      expect(result.comment).toContain("nostalgia");
      // T36-02: label must also be present IN the HTML comment output (not just result.label)
      expect(result.label).toBeDefined();
      expect(typeof result.label).toBe("string");
      expect(result.label!.length).toBeGreaterThan(0);
      expect(result.comment).toContain(result.label);
    });

    it("tag with non-existent pack: error [ONT-21]", async () => {
      await expect(
        tagEntry({
          ontology: "nonexistent-pack",
          entryId: "entry-1",
          section: "Direction",
        }),
      ).rejects.toThrow(/not found|not_found/i);
    });

    it("tag with non-existent entry in pack: error [ONT-21]", async () => {
      await expect(
        tagEntry({
          ontology: "theme-pack",
          entryId: "nonexistent-entry",
          section: "Direction",
        }),
      ).rejects.toThrow(/not found|not_found/i);
    });
  });

  describe("paragraph-level targeting [ONT-21, T36-01]", () => {
    it("tag with paragraph parameter: comment placed after target paragraph, not section end [ONT-21]", async () => {
      const result = await tagEntry({
        ontology: "theme-pack",
        entryId: "nostalgia",
        section: "Direction",
        paragraph: "We aim to evoke a sense of place.",
      });
      expect(result.tagged).toBe(true);
      expect(result.targetType).toBe("paragraph");
      expect(result.comment).toMatch(/<!-- brief:ontology/);
    });

    it("tag with paragraph parameter targeting non-existent paragraph: error [ONT-21]", async () => {
      await expect(
        tagEntry({
          ontology: "theme-pack",
          entryId: "nostalgia",
          section: "Direction",
          paragraph: "This paragraph text does not exist in the section.",
        }),
      ).rejects.toThrow(/paragraph.*not found|not found.*paragraph/i);
    });

    it("tag without paragraph parameter: defaults to section-level targeting [ONT-21]", async () => {
      const result = await tagEntry({
        ontology: "theme-pack",
        entryId: "nostalgia",
        section: "Direction",
      });
      expect(result.tagged).toBe(true);
      expect(result.targetType).toBe("section");
    });
  });

  describe("idempotent tagging [WRITE-15]", () => {
    it("same tag applied twice: returns already-tagged flag, no duplicate written [WRITE-15]", async () => {
      await tagEntry({
        ontology: "theme-pack",
        entryId: "nostalgia",
        section: "Direction",
      });
      const result = await tagEntry({
        ontology: "theme-pack",
        entryId: "nostalgia",
        section: "Direction",
      });
      expect(result.alreadyTagged).toBe(true);
    });

    it("same entry with different label: existing comment label updated [WRITE-15]", async () => {
      await tagEntry({
        ontology: "theme-pack",
        entryId: "nostalgia",
        section: "Direction",
      });
      const result = await tagEntry({
        ontology: "theme-pack",
        entryId: "nostalgia",
        section: "Direction",
        labelOverride: "Custom Label",
      });
      expect(result.labelUpdated).toBe(true);
    });
  });

  describe("metadata sync [WRITE-05, ONT-08]", () => {
    it("first tag with a new pack: Ontologies metadata field updated with pack name and version [WRITE-05]", async () => {
      const result = await tagEntry({
        ontology: "new-pack",
        entryId: "entry-1",
        section: "Direction",
      });
      expect(result.metadataUpdated).toBe(true);
      // T36-03: verify ONT-08 pack version is included in the Ontologies metadata field value
      expect(result.packVersion).toBeDefined();
      expect(result.packVersion).toMatch(/v\d+|^\d+\.\d+/);
      // The updated Ontologies field must include the version string
      expect(result.updatedOntologiesField).toBeDefined();
      expect(result.updatedOntologiesField).toContain(result.packVersion);
    });

    it("tag when pack already in metadata: metadata not duplicated [WRITE-05]", async () => {
      await tagEntry({
        ontology: "theme-pack",
        entryId: "entry-1",
        section: "Direction",
      });
      const result = await tagEntry({
        ontology: "theme-pack",
        entryId: "entry-2",
        section: "Direction",
      });
      // Explicitly assert the value is false/falsy (not just checking toBeFalsy)
      expect(result.metadataDuplicated).toBe(false);
    });
  });

  describe("validation [ONT-21]", () => {
    it("entry ID with double-dash: rejected (breaks HTML comment syntax) [ONT-21]", async () => {
      await expect(
        tagEntry({
          ontology: "theme-pack",
          entryId: "bad--id",
          section: "Direction",
        }),
      ).rejects.toThrow(/double.?dash|--|invalid/i);
    });
  });

  describe("pack-scoped IDs [ONT-12]", () => {
    it("response includes pack-scoped entry ID: format is pack:id [ONT-12]", async () => {
      const result = await tagEntry({
        ontology: "theme-pack",
        entryId: "nostalgia",
        section: "Direction",
      });
      expect(result.qualifiedId).toMatch(/^theme-pack:nostalgia$/);
    });
  });

  describe("side effects [ONT-21]", () => {
    it("tag preserves existing content and other tags: no side effects on unrelated content [ONT-21]", async () => {
      const expectedContent = "Direction";
      const result = await tagEntry({
        ontology: "theme-pack",
        entryId: "nostalgia",
        section: expectedContent,
      });
      // Explicitly assert contentPreserved is true (not just truthy)
      expect(result.contentPreserved).toBe(true);
      expect(result.afterContent).toContain(expectedContent);
    });
  });
});

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe("TASK-36: Property Tests", () => {
  it("forAll(tag operation): idempotent — duplicate tag never written [WRITE-15]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .string({ minLength: 1, maxLength: 30 })
          .filter((s) => /^[a-z]/.test(s) && /^[a-z0-9-]+$/.test(s)),
        async (entryId) => {
          await tagEntry({
            ontology: "theme-pack",
            entryId,
            section: "Direction",
          });
          const result = await tagEntry({
            ontology: "theme-pack",
            entryId,
            section: "Direction",
          });
          expect(result.alreadyTagged).toBe(true);
        },
      ),
    );
  });

  it("forAll(new pack tag): Ontologies metadata always updated [WRITE-05]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .string({ minLength: 2, maxLength: 15 })
          .filter((s) => /^[a-z-]+$/.test(s)),
        async (packName) => {
          const result = await tagEntry({
            ontology: packName,
            entryId: "entry-1",
            section: "Direction",
          });
          expect(result.tagged).toBe(true);
          expect(result.metadataUpdated).toBe(true);
        },
      ),
      { numRuns: 5 },
    );
  });

  it("forAll(entry ID): always validated against pack before writing [ONT-21]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .string({ minLength: 1, maxLength: 30 })
          .filter((s) => /^[a-z0-9-]+$/.test(s)),
        async (entryId) => {
          try {
            const result = await tagEntry({
              ontology: "theme-pack",
              entryId,
              section: "Direction",
            });
            // Success path: validation ran and entry was found
            expect(result.entryId).toBeDefined();
            expect(result.validated).toBe(true);
          } catch (e: any) {
            // Non-existent entries should throw not_found, never write
            expect(e.message).toMatch(/not.?found|invalid/i);
          }
        },
      ),
      { numRuns: 5 },
    );
  });

  it("forAll(tag response): always includes pack-scoped entry ID [ONT-12]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom("nostalgia", "darkness", "longing", "redemption"),
        async (entryId) => {
          const result = await tagEntry({
            ontology: "theme-pack",
            entryId,
            section: "Direction",
          });
          expect(result.qualifiedId).toContain(":");
        },
      ),
      { numRuns: 3 },
    );
  });
});
