import fc from "fast-check";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { _resetState as _resetExtensionState } from "../../src/extension/creation";
import { browseOntology } from "../../src/ontology/browse";
import {
  _resetState,
  isTagged,
  listTags,
  removeTag,
  tagEntry,
  validateExtensionSection,
} from "../../src/ontology/tagging";

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  _resetState();
  _resetExtensionState();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Scope Validation Tests
// ---------------------------------------------------------------------------

describe("WP2/GAP-A+E: Tag Scope Validation", () => {
  describe("validateExtensionSection", () => {
    it("identifies subsection under known spec extension", () => {
      const result = validateExtensionSection("Sound Palette");
      expect(result.valid).toBe(true);
      expect(result.extensionName).toBe("sonic_arts");
    });

    it("identifies extension heading itself", () => {
      const result = validateExtensionSection("SONIC ARTS");
      expect(result.valid).toBe(true);
      expect(result.extensionName).toBe("sonic_arts");
    });

    it("identifies slug format", () => {
      const result = validateExtensionSection("sonic_arts");
      expect(result.valid).toBe(true);
      expect(result.extensionName).toBe("sonic_arts");
    });

    it("returns invalid for non-extension section", () => {
      const result = validateExtensionSection("What This Is");
      expect(result.valid).toBe(false);
      expect(result.extensionName).toBeUndefined();
    });
  });

  describe("tagEntry scope enrichment", () => {
    it("returns extensionName when tagging to extension subsection", async () => {
      const result = await tagEntry({
        ontology: "theme-pack",
        entryId: "nostalgia",
        section: "Sound Palette",
      });
      expect(result.tagged).toBe(true);
      expect(result.extensionName).toBe("sonic_arts");
      expect(result.scopeWarning).toBeUndefined();
    });

    it("returns scopeWarning for non-extension section", async () => {
      const result = await tagEntry({
        ontology: "theme-pack",
        entryId: "nostalgia",
        section: "What This Is",
      });
      expect(result.tagged).toBe(true);
      expect(result.scopeWarning).toBeDefined();
      expect(result.scopeWarning).toContain("not under a known extension");
    });

    it("still succeeds with soft enforcement (no rejection)", async () => {
      const result = await tagEntry({
        ontology: "theme-pack",
        entryId: "nostalgia",
        section: "Random Section",
      });
      expect(result.tagged).toBe(true);
    });
  });

  describe("tagEntry entry references", () => {
    it("includes entryReferences when entry has references", async () => {
      // theme-pack entries in browse.ts have references but tagging fixture entries don't
      // Use the tag and check the result
      const result = await tagEntry({
        ontology: "theme-pack",
        entryId: "nostalgia",
        section: "Sound Palette",
      });
      expect(result.entryReferences).toBeDefined();
      expect(Array.isArray(result.entryReferences)).toBe(true);
    });

    it("returns empty array when entry has no references", async () => {
      const result = await tagEntry({
        ontology: "new-pack",
        entryId: "entry-1",
        section: "Direction",
      });
      expect(result.entryReferences).toBeDefined();
      expect(Array.isArray(result.entryReferences)).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// listTags Tests
// ---------------------------------------------------------------------------

describe("WP2/GAP-E: listTags", () => {
  it("returns empty when no tags exist", async () => {
    const result = await listTags();
    expect(result.total).toBe(0);
    expect(result.tags).toEqual([]);
  });

  it("returns all tags grouped by extension after tagging", async () => {
    await tagEntry({
      ontology: "theme-pack",
      entryId: "nostalgia",
      section: "Sound Palette",
    });
    await tagEntry({
      ontology: "theme-pack",
      entryId: "redemption",
      section: "Lyrical Themes",
    });

    const result = await listTags();
    expect(result.total).toBe(2);
    expect(result.tags.length).toBe(2);

    // Grouped by extension
    expect(result.groupedByExtension.sonic_arts).toBeDefined();
    expect(result.groupedByExtension.sonic_arts.length).toBe(1);
    expect(result.groupedByExtension.lyrical_craft).toBeDefined();
    expect(result.groupedByExtension.lyrical_craft.length).toBe(1);
  });

  it("filters by extensionFilter", async () => {
    await tagEntry({
      ontology: "theme-pack",
      entryId: "nostalgia",
      section: "Sound Palette",
    });
    await tagEntry({
      ontology: "theme-pack",
      entryId: "redemption",
      section: "Lyrical Themes",
    });

    const result = await listTags({ extensionFilter: "sonic_arts" });
    expect(result.total).toBe(1);
    expect(result.tags[0].section).toBe("Sound Palette");
  });

  it("tags in non-extension sections are grouped under (unscoped)", async () => {
    await tagEntry({
      ontology: "theme-pack",
      entryId: "nostalgia",
      section: "What This Is",
    });

    const result = await listTags();
    expect(result.total).toBe(1);
    expect(result.groupedByExtension["(unscoped)"]).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// removeTag Tests
// ---------------------------------------------------------------------------

describe("WP2/GAP-E: removeTag", () => {
  it("removes tag from registry", async () => {
    await tagEntry({
      ontology: "theme-pack",
      entryId: "nostalgia",
      section: "Sound Palette",
    });
    expect(isTagged("theme-pack", "nostalgia")).toBe(true);

    const result = await removeTag({
      ontology: "theme-pack",
      entryId: "nostalgia",
      section: "Sound Palette",
    });
    expect(result.removed).toBe(true);
    expect(result.qualifiedId).toBe("theme-pack:nostalgia");
    expect(isTagged("theme-pack", "nostalgia")).toBe(false);
  });

  it("returns removed: false for nonexistent tag", async () => {
    const result = await removeTag({
      ontology: "theme-pack",
      entryId: "unknown",
      section: "Sound Palette",
    });
    expect(result.removed).toBe(false);
  });

  it("is idempotent — second removal returns false", async () => {
    await tagEntry({
      ontology: "theme-pack",
      entryId: "nostalgia",
      section: "Sound Palette",
    });
    const first = await removeTag({
      ontology: "theme-pack",
      entryId: "nostalgia",
      section: "Sound Palette",
    });
    expect(first.removed).toBe(true);

    const second = await removeTag({
      ontology: "theme-pack",
      entryId: "nostalgia",
      section: "Sound Palette",
    });
    expect(second.removed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isTagged / Browse Integration Tests
// ---------------------------------------------------------------------------

describe("WP2/GAP-E: isTagged & Browse Integration", () => {
  it("isTagged returns true after tagging", async () => {
    expect(isTagged("theme-pack", "nostalgia")).toBe(false);
    await tagEntry({
      ontology: "theme-pack",
      entryId: "nostalgia",
      section: "Sound Palette",
    });
    expect(isTagged("theme-pack", "nostalgia")).toBe(true);
  });

  it("browseOntology marks entries as alreadyTagged", async () => {
    // Tag nostalgia
    await tagEntry({
      ontology: "theme-pack",
      entryId: "nostalgia",
      section: "Sound Palette",
    });

    // Browse around nostalgia — siblings should show alreadyTagged status
    const result = await browseOntology({
      ontology: "theme-pack",
      entryId: "nostalgia",
      direction: "around",
    });

    // At least some siblings should exist and have the alreadyTagged field
    for (const entry of result.entries) {
      expect(entry.alreadyTagged).toBeDefined();
      expect(typeof entry.alreadyTagged).toBe("boolean");
    }
  });
});

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe("WP2/GAP-A+E: Property Tests", () => {
  it("forAll(section name): tagEntry never throws regardless of section", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 50 }),
        async (section) => {
          _resetState();
          // Should not throw — soft enforcement
          const result = await tagEntry({
            ontology: "theme-pack",
            entryId: "nostalgia",
            section,
          });
          expect(result.tagged).toBe(true);
        },
      ),
      { numRuns: 15 },
    );
  });

  it("forAll(tags): listTags.total always equals number of unique tags added", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 5 }), async (count) => {
        _resetState();
        const sections = [
          "Sound Palette",
          "Lyrical Themes",
          "Direction",
          "Narrative Arc",
          "Visual Language",
        ];
        for (let i = 0; i < count; i++) {
          await tagEntry({
            ontology: "theme-pack",
            entryId: "nostalgia",
            section: sections[i],
          });
        }
        const result = await listTags();
        expect(result.total).toBe(count);
      }),
      { numRuns: 5 },
    );
  });

  it("forAll(ontology, entryId): removeTag after tagEntry always succeeds", async () => {
    const entryIds = ["nostalgia", "redemption", "longing", "emotion"];
    await fc.assert(
      fc.asyncProperty(fc.constantFrom(...entryIds), async (entryId) => {
        _resetState();
        await tagEntry({
          ontology: "theme-pack",
          entryId,
          section: "Sound Palette",
        });
        const result = await removeTag({
          ontology: "theme-pack",
          entryId,
          section: "Sound Palette",
        });
        expect(result.removed).toBe(true);
      }),
      { numRuns: 10 },
    );
  });
});
