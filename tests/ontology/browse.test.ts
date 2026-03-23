import fc from "fast-check";
import { beforeEach, describe, expect, it } from "vitest";
import {
  _installFixtures,
  browseOntology,
  FIXTURE_ENTRY_IDS_BY_PACK,
  getOntologyEntry,
} from "../../src/ontology/browse";
import { clearIndexes } from "../../src/ontology/management";

// Force-reinstall fixtures before each test to avoid stale pack data
// from disk-loaded packs overwriting the in-memory fixtures in other test files.
beforeEach(() => {
  clearIndexes();
  _installFixtures();
});

// ---------------------------------------------------------------------------
// Unit Tests
// ---------------------------------------------------------------------------

describe("TASK-34: Ontology — Browsing & Entry Retrieval", () => {
  describe("entry retrieval [ONT-06, ONT-12]", () => {
    it("get entry by pack and id: full entry details returned [ONT-12]", async () => {
      const result = await getOntologyEntry({
        ontology: "theme-pack",
        entryId: "nostalgia",
      });
      expect(result.entry).toBeDefined();
      expect(result.entry.id).toBe("nostalgia");
    });

    it("get entry with fields selector: only requested fields returned [ONT-06]", async () => {
      const result = await getOntologyEntry({
        ontology: "theme-pack",
        entryId: "nostalgia",
        fields: ["id", "label"],
      });
      expect(result.entry.id).toBeDefined();
      expect(result.entry.label).toBeDefined();
      expect(result.entry.description).toBeUndefined();
    });

    it("get entry with detail_level minimal: only id and label [ONT-06]", async () => {
      const result = await getOntologyEntry({
        ontology: "theme-pack",
        entryId: "nostalgia",
        detailLevel: "minimal",
      });
      expect(result.entry.id).toBeDefined();
      expect(result.entry.label).toBeDefined();
      expect(result.entry.keywords).toBeUndefined();
    });

    it("get entry with detail_level standard: id, label, description, keywords; no aliases or references [ONT-06, T34-01]", async () => {
      const result = await getOntologyEntry({
        ontology: "theme-pack",
        entryId: "nostalgia",
        detailLevel: "standard",
      });
      expect(result.entry.id).toBeDefined();
      expect(result.entry.label).toBeDefined();
      expect(result.entry.description).toBeDefined();
      expect(result.entry.keywords).toBeDefined();
      // Standard does NOT include full aliases or references
      expect(result.entry.aliases).toBeUndefined();
      expect(result.entry.references).toBeUndefined();
    });

    it("get entry with detail_level full: all fields [ONT-06]", async () => {
      const result = await getOntologyEntry({
        ontology: "theme-pack",
        entryId: "nostalgia",
        detailLevel: "full",
      });
      expect(result.entry.id).toBeDefined();
      expect(result.entry.label).toBeDefined();
      expect(result.entry.description).toBeDefined();
      expect(result.entry.keywords).toBeDefined();
    });

    it("non-existent entry: not_found error [ONT-12]", async () => {
      await expect(
        getOntologyEntry({
          ontology: "theme-pack",
          entryId: "nonexistent-xyz",
        }),
      ).rejects.toThrow(/not_found|not found/i);
    });

    it("non-existent pack: not_found error [ONT-12]", async () => {
      await expect(
        getOntologyEntry({ ontology: "nonexistent-pack", entryId: "entry-1" }),
      ).rejects.toThrow(/not_found|not found/i);
    });
  });

  describe("browsing navigation [ONT-18]", () => {
    it('browse direction "up": parent entries returned [ONT-18]', async () => {
      const result = await browseOntology({
        ontology: "theme-pack",
        entryId: "nostalgia",
        direction: "up",
      });
      expect(result.entries).toBeDefined();
      expect(Array.isArray(result.entries)).toBe(true);
      expect(result.entries.every((e: any) => e.isParent || e.isAncestor)).toBe(
        true,
      );
      // Structural check: parent entries should have a lower depth/level than the queried entry
      expect(
        result.entries.every(
          (e: any) =>
            e.depth < (result as any).queryDepth ||
            e.level < (result as any).queryLevel,
        ),
      ).toBe(true);
    });

    it('browse direction "down": child entries returned [ONT-18]', async () => {
      const result = await browseOntology({
        ontology: "theme-pack",
        entryId: "emotion",
        direction: "down",
      });
      expect(result.entries).toBeDefined();
      expect(Array.isArray(result.entries)).toBe(true);
      expect(
        result.entries.every((e: any) => e.isChild || e.isDescendant),
      ).toBe(true);
      // Structural check: child entries should have a greater depth/level than the queried entry
      expect(
        result.entries.every(
          (e: any) =>
            e.depth > (result as any).queryDepth ||
            e.level > (result as any).queryLevel,
        ),
      ).toBe(true);
    });

    it('browse direction "around": sibling entries returned [ONT-18]', async () => {
      const result = await browseOntology({
        ontology: "theme-pack",
        entryId: "nostalgia",
        direction: "around",
      });
      expect(result.entries).toBeDefined();
      expect(result.entries.every((e: any) => e.isSibling)).toBe(true);
      // Structural check: siblings should share the same parent as the queried entry
      expect(
        result.entries.every((e: any) => e.parentId === result.queryParentId),
      ).toBe(true);
    });

    it('browse direction "all": parents, children, and siblings returned [ONT-18]', async () => {
      const result = await browseOntology({
        ontology: "theme-pack",
        entryId: "nostalgia",
        direction: "all",
      });
      expect(result.entries).toBeDefined();
      expect(result.entries.some((e: any) => e.isParent)).toBe(true);
      expect(result.entries.some((e: any) => e.isChild)).toBe(true);
      expect(result.entries.some((e: any) => e.isSibling)).toBe(true);
      // Structural check: at least one entry at each relationship level
      expect(
        result.entries.some((e: any) => e.depth < (result as any).queryDepth),
      ).toBe(true); // parent
      expect(
        result.entries.some((e: any) => e.depth > (result as any).queryDepth),
      ).toBe(true); // child
    });

    it("circular parent chain: traversal breaks with warning, partial results returned [ONT-18]", async () => {
      const result = await browseOntology({
        ontology: "circular-pack",
        entryId: "entry-a",
        direction: "up",
      });
      expect(result.warning).toMatch(/cycle|circular/i);
      expect(result.entries).toBeDefined();
    });
  });

  describe("pack-scoped IDs [ONT-12]", () => {
    it("all entry IDs in responses: pack-scoped format (pack:id) [ONT-12]", async () => {
      const result = await getOntologyEntry({
        ontology: "theme-pack",
        entryId: "nostalgia",
      });
      expect(result.entry.qualifiedId).toMatch(/^theme-pack:/);
    });

    it("entry existing in two different packs: distinguished by pack scope [ONT-12]", async () => {
      const result1 = await getOntologyEntry({
        ontology: "pack-a",
        entryId: "shared-id",
      });
      const result2 = await getOntologyEntry({
        ontology: "pack-b",
        entryId: "shared-id",
      });
      expect(result1.entry.qualifiedId).not.toBe(result2.entry.qualifiedId);
    });
  });
});

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe("TASK-34: Property Tests", () => {
  it("forAll(entry request): response always includes pack-scoped ID [ONT-12]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...FIXTURE_ENTRY_IDS_BY_PACK["theme-pack"]),
        async (entryId) => {
          const result = await getOntologyEntry({
            ontology: "theme-pack",
            entryId,
          });
          expect(result.entry.qualifiedId).toContain(":");
        },
      ),
      { numRuns: 5 },
    );
  });

  it("forAll(detail level): response fields always match requested level [ONT-06]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom("minimal", "standard", "full"),
        async (detailLevel) => {
          const result = await getOntologyEntry({
            ontology: "theme-pack",
            entryId: "nostalgia",
            detailLevel,
          });
          expect(result.entry.id).toBeDefined();
          expect(result.entry.label).toBeDefined();
          if (detailLevel === "minimal") {
            expect(result.entry.keywords).toBeUndefined();
          }
        },
      ),
      { numRuns: 3 },
    );
  });

  it("forAll(browse traversal): cycle detection prevents infinite loops [ONT-18]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom("up", "down", "around", "all"),
        async (direction) => {
          const result = await browseOntology({
            ontology: "circular-pack",
            entryId: "entry-a",
            direction,
          });
          expect(result).toBeDefined();
          expect(result.entries).toBeDefined();
          expect(result.cycleDetected).toBe(true);
          expect(result.warning).toMatch(/cycle|circular/i);
        },
      ),
      { numRuns: 4 },
    );
  });

  it("forAll(direction): only requested relationship direction returned [ONT-18]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom("up", "down", "around"),
        async (direction) => {
          const result = await browseOntology({
            ontology: "theme-pack",
            entryId: "nostalgia",
            direction,
          });
          expect(result.direction).toBe(direction);
        },
      ),
      { numRuns: 3 },
    );
  });
});
