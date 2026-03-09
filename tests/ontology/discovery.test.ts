// tests/ontology/discovery.test.ts — WP5: Ontology discovery tests

import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { discoverOntologies } from "../../src/ontology/discovery.js";
import { clearIndexes, installPack } from "../../src/ontology/management.js";

beforeEach(() => {
  clearIndexes();
});

afterEach(() => {
  clearIndexes();
  vi.restoreAllMocks();
});

describe("WP5: discoverOntologies", () => {
  it("returns empty results for empty query", async () => {
    const result = await discoverOntologies({ query: "" });
    expect(result.localResults).toEqual([]);
    expect(result.externalResults).toEqual([]);
    expect(result.signal).toContain("Empty query");
  });

  it("finds locally installed packs", async () => {
    // Install a test pack
    await installPack({
      name: "test-music",
      entries: [
        { id: "harmony", label: "Harmony", keywords: ["music", "chord"] },
        { id: "melody", label: "Melody", keywords: ["music", "tune"] },
      ],
    });

    const result = await discoverOntologies({
      query: "music",
      sources: ["local"],
    });

    expect(result.localResults.length).toBeGreaterThan(0);
    expect(result.localResults[0].name).toBe("test-music");
    expect(result.externalResults).toEqual([]);
  });

  it("searches HuggingFace when source includes huggingface", async () => {
    // Mock fetch
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: "dataset/music-genres",
            description: "Music genre classification dataset",
            tags: ["music", "audio", "classification"],
            downloads: 1000,
          },
          {
            id: "dataset/sound-effects",
            description: "Sound effects library",
            tags: ["audio", "sound"],
            downloads: 500,
          },
        ]),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    const result = await discoverOntologies({
      query: "music",
      extensionContext: "sonic arts music audio",
      sources: ["huggingface"],
    });

    expect(result.externalResults.length).toBe(2);
    expect(result.externalResults[0].source).toBe("huggingface");
    expect(result.externalResults[0].datasetId).toBe("dataset/music-genres");
    expect(result.localResults).toEqual([]);
  });

  it("handles HuggingFace API failure gracefully", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network error"));

    const result = await discoverOntologies({
      query: "music",
      sources: ["huggingface"],
    });

    expect(result.externalResults).toEqual([]);
    expect(result.signal).toContain("No ontologies found");
  });

  it("searches both local and external in parallel", async () => {
    await installPack({
      name: "local-pack",
      entries: [{ id: "test", label: "Test", keywords: ["theme"] }],
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: "external/themes",
            description: "Themes dataset",
            tags: ["theme"],
            downloads: 100,
          },
        ]),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    const result = await discoverOntologies({
      query: "theme",
      sources: ["local", "huggingface"],
    });

    expect(result.localResults.length).toBeGreaterThan(0);
    expect(result.externalResults.length).toBe(1);
    expect(result.signal).toContain("local");
    expect(result.signal).toContain("external");
  });

  it("scores external results higher when they match extension context", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: "dataset/unrelated",
            description: "Cooking recipes",
            tags: ["food", "cooking"],
            downloads: 2000,
          },
          {
            id: "dataset/music-theory",
            description: "Music theory concepts",
            tags: ["music", "theory", "harmony"],
            downloads: 500,
          },
        ]),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    const result = await discoverOntologies({
      query: "concepts",
      extensionContext: "music theory harmony",
      sources: ["huggingface"],
    });

    // Music theory should rank higher due to context match
    expect(result.externalResults.length).toBe(2);
    const musicResult = result.externalResults.find(
      (r) => r.datasetId === "dataset/music-theory",
    );
    const cookingResult = result.externalResults.find(
      (r) => r.datasetId === "dataset/unrelated",
    );
    expect(musicResult!.relevanceScore).toBeGreaterThan(
      cookingResult!.relevanceScore,
    );
  });

  it("respects maxResults parameter", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify(
          Array.from({ length: 20 }, (_, i) => ({
            id: `dataset/item-${i}`,
            description: `Dataset ${i}`,
            tags: ["test"],
            downloads: 100 - i,
          })),
        ),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    const result = await discoverOntologies({
      query: "test",
      maxResults: 3,
      sources: ["huggingface"],
    });

    expect(result.externalResults.length).toBeLessThanOrEqual(3);
  });

  // ── Property Tests ──────────────────────────────────────────────────────

  describe("Property Tests", () => {
    it("forAll(query string): discoverOntologies never throws and always returns valid structure", async () => {
      await fc.assert(
        fc.asyncProperty(fc.string({ maxLength: 200 }), async (query) => {
          const result = await discoverOntologies({
            query,
            sources: ["local"],
          });
          expect(result).toBeDefined();
          expect(Array.isArray(result.localResults)).toBe(true);
          expect(Array.isArray(result.externalResults)).toBe(true);
          expect(typeof result.signal).toBe("string");
          expect(result.signal.length).toBeGreaterThan(0);
        }),
        { numRuns: 15 },
      );
    });

    it("forAll(empty/whitespace query): always returns empty results", async () => {
      await fc.assert(
        fc.asyncProperty(fc.stringMatching(/^[ \t\n\r]*$/), async (query) => {
          const result = await discoverOntologies({
            query,
            sources: ["local"],
          });
          expect(result.localResults).toEqual([]);
          expect(result.externalResults).toEqual([]);
        }),
        { numRuns: 10 },
      );
    });

    it("forAll(maxResults): external results never exceed maxResults", async () => {
      const mockData = Array.from({ length: 30 }, (_, i) => ({
        id: `ds/item-${i}`,
        description: `Dataset ${i}`,
        tags: ["test"],
        downloads: 100 - i,
      }));
      vi.spyOn(globalThis, "fetch").mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify(mockData), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        ),
      );

      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 25 }),
          async (maxResults) => {
            const result = await discoverOntologies({
              query: "test",
              maxResults,
              sources: ["huggingface"],
            });
            expect(result.externalResults.length).toBeLessThanOrEqual(
              maxResults,
            );
          },
        ),
        { numRuns: 10 },
      );
    });

    it("forAll(relevance scores): external results always have scores in [0, 1]", async () => {
      const mockData = [
        {
          id: "ds/a",
          description: "Music data",
          tags: ["music"],
          downloads: 500,
        },
        { id: "ds/b", description: "Random", tags: [], downloads: 10 },
      ];
      vi.spyOn(globalThis, "fetch").mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify(mockData), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        ),
      );

      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 }),
          async (context) => {
            const result = await discoverOntologies({
              query: "music",
              extensionContext: context,
              sources: ["huggingface"],
            });
            for (const r of result.externalResults) {
              expect(r.relevanceScore).toBeGreaterThanOrEqual(0);
              expect(r.relevanceScore).toBeLessThanOrEqual(1.0);
            }
          },
        ),
        { numRuns: 10 },
      );
    });
  });
});
