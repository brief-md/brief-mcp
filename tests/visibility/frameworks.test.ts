import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  detectOrphanedTags,
  getProjectFrameworks,
  removeOntology,
} from "../../src/visibility/frameworks";

// ---------------------------------------------------------------------------
// Unit Tests
// ---------------------------------------------------------------------------

describe("TASK-44: Visibility — Framework Visibility & Ontology Management", () => {
  describe("get frameworks [HIER-06]", () => {
    it("project with local extensions: extensions listed with source: local [HIER-06]", async () => {
      const result = await getProjectFrameworks({ project: "test-project" });
      const local = result.extensions.filter((e: any) => e.source === "local");
      expect(local.length).toBeGreaterThan(0);
    });

    it("project inheriting parent extensions: extensions listed with source: inherited [HIER-06]", async () => {
      const result = await getProjectFrameworks({ project: "child-project" });
      const inherited = result.extensions.filter(
        (e: any) => e.source === "inherited",
      );
      expect(inherited.length).toBeGreaterThan(0);
    });

    it("local and inherited ontologies: both listed with correct source [HIER-06]", async () => {
      const result = await getProjectFrameworks({ project: "mixed-project" });
      expect(result.ontologies).toBeDefined();
      const sources = result.ontologies.map((o: any) => o.source);
      expect(sources).toContain("local");
      expect(sources).toContain("inherited");
    });

    it("ontology tag counts: each ontology includes tag count [ONT-15]", async () => {
      const result = await getProjectFrameworks({ project: "test-project" });
      for (const o of result.ontologies) {
        expect(o.tagCount).toBeDefined();
        expect(typeof o.tagCount).toBe("number");
      }
    });

    it("version info: each ontology includes version [ONT-08]", async () => {
      const result = await getProjectFrameworks({ project: "test-project" });
      for (const o of result.ontologies) {
        expect(o.version).toBeDefined();
      }
    });

    it("child with (excludes: pack): excluded pack not listed in active frameworks [ONT-20]", async () => {
      const result = await getProjectFrameworks({
        project: "excluding-project",
      });
      const packNames = result.ontologies.map((o: any) => o.name);
      expect(packNames).not.toContain("excluded-pack");
    });
  });

  describe("remove ontology [ONT-20]", () => {
    it("remove local ontology: pack removed from Ontologies metadata field [ONT-20]", async () => {
      const result = await removeOntology({ ontology: "local-pack" });
      // G-339: assert removed explicitly
      expect(result.removed).toBe(true);
    });

    it("remove inherited ontology: (excludes: pack-name) added to child metadata [ONT-20]", async () => {
      const result = await removeOntology({ ontology: "inherited-pack" });
      // G-340: assert excludeAdded explicitly
      expect(result.excludeAdded).toBe(true);
    });

    it("remove inherited ontology: parent file never modified [ONT-20]", async () => {
      const result = await removeOntology({ ontology: "inherited-pack" });
      // G-341: assert parentModified is false explicitly
      expect(result.parentModified).toBe(false);
    });

    it("remove_tags: true: all brief:ontology comments for that pack stripped [ONT-20]", async () => {
      const result = await removeOntology({
        ontology: "local-pack",
        removeTags: true,
      });
      expect(result.tagsRemoved).toBeGreaterThan(0);
    });

    it("remove_tags: true: free text content preserved [ONT-20]", async () => {
      const result = await removeOntology({
        ontology: "local-pack",
        removeTags: true,
      });
      // G-342: assert contentPreserved explicitly
      expect(result.contentPreserved).toBe(true);
      expect(result.afterContent).not.toContain("<!-- brief:ontology");
    });

    it("remove_tags: false: HTML comments preserved [ONT-20]", async () => {
      const result = await removeOntology({
        ontology: "local-pack",
        removeTags: false,
      });
      expect(result.tagsRemoved).toBeUndefined();
      // G-343: assert tagsPreserved explicitly
      expect(result.tagsPreserved).toBe(true);
    });

    it("pack not found in project: error returned [ONT-20]", async () => {
      await expect(
        removeOntology({ ontology: "nonexistent-pack" }),
      ).rejects.toThrow(/not found/i);
    });

    it("no active project: guard error [ARCH-06]", async () => {
      await expect(
        removeOntology({ ontology: "pack", noActiveProject: true }),
      ).rejects.toThrow(/active.*project|no project/i);
    });

    it("detects orphaned tags", async () => {
      // G-344: use specific tag ID so check is against the actual tag reference, not just text content
      const result = await detectOrphanedTags({
        content:
          '<!-- brief:ontology theme-pack orphaned-entry-123 "Orphaned Label" -->',
      });
      expect(result.orphanedTags.length).toBeGreaterThan(0);
      // Check specific tag ID appears in orphanedTags array (qualified {pack}:{id} format)
      expect(
        result.orphanedTags.some(
          (t: string) =>
            t.includes("theme-pack") && t.includes("orphaned-entry-123"),
        ),
      ).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe("TASK-44: Property Tests", () => {
  // G-345: make async and await fc.assert
  it("forAll(remove ontology): parent files never modified [ONT-20]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom("inherited-pack-a", "inherited-pack-b"),
        async (packName) => {
          const result = await removeOntology({ ontology: packName });
          expect(result.parentModified).toBe(false);
        },
      ),
      { numRuns: 3 },
    );
  });

  // G-346: make async and await fc.assert
  it("forAll(remove_tags): only target pack comments removed, other packs untouched [ONT-20]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom("pack-a", "pack-b"),
        async (packName) => {
          const result = await removeOntology({
            ontology: packName,
            removeTags: true,
          });
          expect(result.otherPacksPreserved).toBe(true);
        },
      ),
      { numRuns: 3 },
    );
  });

  // G-347: make async and await fc.assert
  it("forAll(framework listing): source (local vs inherited) always indicated [HIER-06]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom("test-project", "child-project"),
        async (project) => {
          const result = await getProjectFrameworks({ project });
          for (const ext of result.extensions) {
            expect(["local", "inherited"]).toContain(ext.source);
          }
        },
      ),
      { numRuns: 2 },
    );
  });

  // G-348: make async and await fc.assert; add more values to constantFrom
  it("forAll(child exclusion): excluded packs never appear in active frameworks [ONT-20]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom("excluded-pack", "excluded-pack-b", "excluded-pack-c"),
        async (excludedPack) => {
          const result = await getProjectFrameworks({
            project: "excluding-project",
          });
          const names = result.ontologies.map((o: any) => o.name);
          expect(names).not.toContain(excludedPack);
        },
      ),
      { numRuns: 2 },
    );
  });

  it("forAll(invalid input): always rejects for nonexistent pack removal", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .string({ minLength: 1, maxLength: 20 })
          .filter((s) => /^[a-zA-Z0-9-]+$/.test(s))
          .map((s) => `nonexistent-zz-${s}`),
        async (badPack) => {
          await expect(removeOntology({ ontology: badPack })).rejects.toThrow(
            /not found/i,
          );
        },
      ),
      { numRuns: 10 },
    );
  });

  it("forAll(framework listing): output structure always has extensions and ontologies arrays", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom("test-project", "child-project", "mixed-project"),
        async (project) => {
          const result = await getProjectFrameworks({ project });
          expect(result).toHaveProperty("extensions");
          expect(result).toHaveProperty("ontologies");
          expect(Array.isArray(result.extensions)).toBe(true);
          expect(Array.isArray(result.ontologies)).toBe(true);
        },
      ),
      { numRuns: 3 },
    );
  });
});
