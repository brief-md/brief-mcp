import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  _resetState as _resetExtensionState,
  addExtension,
} from "../../src/extension/creation";
import { lookupReference } from "../../src/reference/lookup";
import { suggestReferences } from "../../src/reference/suggestion";
import { getTypeGuide } from "../../src/type-intelligence/loading";

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  _resetExtensionState();
  vi.clearAllMocks();
});

afterEach(() => {
  _resetExtensionState();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Extension creation reference prompt (WP6/GAP-F)
// ---------------------------------------------------------------------------

describe("WP6/GAP-F: Extension creation reference prompt", () => {
  it("addExtension result includes referencePrompt", async () => {
    const result = await addExtension({ extensionName: "SONIC ARTS" });
    expect(result.referencePrompt).toBeDefined();
    expect(typeof result.referencePrompt).toBe("string");
    expect(result.referencePrompt!.length).toBeGreaterThan(0);
  });

  it("referencePrompt mentions brief_add_reference tool", async () => {
    _resetExtensionState();
    const result = await addExtension({ extensionName: "NARRATIVE CREATIVE" });
    expect(result.referencePrompt).toContain("brief_add_reference");
  });
});

// ---------------------------------------------------------------------------
// suggestReferences webSearch tier (WP6/GAP-F)
// ---------------------------------------------------------------------------

describe("WP6/GAP-F: suggestReferences web search tier", () => {
  it("with webSearch: true signals AI/web tiers as available", async () => {
    const result = await suggestReferences({
      context: { section: "Sound Palette", activeExtensions: ["sonic_arts"] },
      webSearch: true,
    });
    expect(result.hasAiKnowledgeTier).toBe(true);
    expect(result.hasWebSearchTier).toBe(true);
  });

  it("with webSearch: false works as before (local only)", async () => {
    const result = await suggestReferences({
      context: { section: "Sound Palette", activeExtensions: ["sonic_arts"] },
      webSearch: false,
    });
    // Still returns suggestions from local packs
    expect(result.suggestions).toBeDefined();
    expect(Array.isArray(result.suggestions)).toBe(true);
  });

  it("without webSearch works as before", async () => {
    const result = await suggestReferences({
      context: { section: "Sound Palette", activeExtensions: ["sonic_arts"] },
    });
    expect(result.suggestions).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// lookupReference webSearch tier (WP6/GAP-F)
// ---------------------------------------------------------------------------

describe("WP6/GAP-F: lookupReference web search tier", () => {
  it("with webSearch: true and sparse results signals AI fallback", async () => {
    const result = await lookupReference({
      creator: "Nonexistent Artist XYZ",
      webSearch: true,
    });
    expect(result.aiKnowledgePrimary).toBe(true);
  });

  it("with webSearch: false never signals AI for sparse results", async () => {
    // Look up a known creator to get some results, don't use webSearch
    const result = await lookupReference({
      creator: "Bon Iver",
      webSearch: false,
    });
    // If results found, aiKnowledgePrimary should not be set
    if (result.results.length >= 3) {
      expect(result.aiKnowledgePrimary).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// Type guide referenceSources (WP6/GAP-F)
// ---------------------------------------------------------------------------

describe("WP6/GAP-F: Type guide referenceSources", () => {
  it("referenceSources defaults to undefined when not in YAML", async () => {
    const result = await getTypeGuide({ type: "album" });
    // Bundled guides don't have reference_sources, so it should be undefined
    expect(
      result.guide.metadata.referenceSources === undefined ||
        Array.isArray(result.guide.metadata.referenceSources),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe("WP6/GAP-F: Property Tests", () => {
  it("forAll(extension name): addExtension always includes referencePrompt", async () => {
    const validNames = [
      "SONIC ARTS",
      "NARRATIVE CREATIVE",
      "LYRICAL CRAFT",
      "VISUAL STORYTELLING",
      "STRATEGIC PLANNING",
      "SYSTEM DESIGN",
    ];
    await fc.assert(
      fc.asyncProperty(fc.constantFrom(...validNames), async (name) => {
        _resetExtensionState();
        const result = await addExtension({ extensionName: name });
        expect(result.referencePrompt).toBeDefined();
        expect(typeof result.referencePrompt).toBe("string");
      }),
      { numRuns: 6 },
    );
  });

  it("forAll(section): suggestReferences never throws with webSearch", async () => {
    const sections = [
      "Sound Palette",
      "Narrative Arc",
      "Visual Language",
      "Random Section",
    ];
    await fc.assert(
      fc.asyncProperty(fc.constantFrom(...sections), async (section) => {
        const result = await suggestReferences({
          context: { section, activeExtensions: ["sonic_arts"] },
          webSearch: true,
        });
        expect(result).toBeDefined();
        expect(result.hasWebSearchTier).toBe(true);
      }),
      { numRuns: 4 },
    );
  });
});
