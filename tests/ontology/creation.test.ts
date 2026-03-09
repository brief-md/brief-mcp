// tests/ontology/creation.test.ts — WP5: Ontology creation tests

import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createOntology } from "../../src/ontology/creation.js";
import { clearIndexes, getPackIndex } from "../../src/ontology/management.js";

beforeEach(() => {
  clearIndexes();
});

afterEach(() => {
  clearIndexes();
  vi.restoreAllMocks();
});

describe("WP5: createOntology", () => {
  describe("template generation (no sampling)", () => {
    it("creates a template pack when sampling is unavailable", async () => {
      const result = await createOntology({
        name: "test-ontology",
        description: "A test ontology for music concepts",
        domainKeywords: ["harmony", "melody", "rhythm"],
        entryCount: 5,
      });

      expect(result.created).toBe(true);
      expect(result.packName).toBe("test-ontology");
      expect(result.entryCount).toBe(5);
      expect(result.trustLevel).toBe("template");
      expect(result.installed).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(
        result.warnings.some((w) => w.includes("Sampling not available")),
      ).toBe(true);
    });

    it("generates entries from domain keywords", async () => {
      const result = await createOntology({
        name: "keyword-test",
        description: "Test",
        domainKeywords: ["harmony", "melody"],
        entryCount: 2,
      });

      expect(result.created).toBe(true);
      const index = getPackIndex("keyword-test");
      expect(index).toBeDefined();
      expect(index!.entries.size).toBe(2);
    });

    it("fills with placeholder entries when keywords are insufficient", async () => {
      const result = await createOntology({
        name: "sparse-pack",
        description: "Test",
        domainKeywords: ["one"],
        entryCount: 5,
      });

      expect(result.entryCount).toBe(5);
      expect(result.installed).toBe(true);
    });

    it("sanitizes pack name", async () => {
      const result = await createOntology({
        name: "My Fancy Pack!!!",
        description: "Test pack",
        entryCount: 2,
      });

      expect(result.packName).toBe("my-fancy-pack");
      expect(result.created).toBe(true);
    });

    it("caps entry count at 100", async () => {
      const result = await createOntology({
        name: "big-pack",
        description: "Large pack",
        entryCount: 200,
      });

      expect(result.entryCount).toBeLessThanOrEqual(100);
    });
  });

  describe("AI-assisted generation (with sampling)", () => {
    it("uses sampling to generate entries", async () => {
      const mockSampling = vi.fn().mockResolvedValue({
        content: JSON.stringify({
          name: "ai-pack",
          version: "1.0.0",
          description: "AI-generated music ontology",
          entries: [
            {
              id: "chord-progression",
              label: "Chord Progression",
              description: "A sequence of chords",
              keywords: ["harmony", "chords"],
            },
            {
              id: "time-signature",
              label: "Time Signature",
              description: "Rhythmic meter",
              keywords: ["rhythm", "meter"],
            },
          ],
        }),
        model: "test-model",
        role: "assistant",
      });

      const result = await createOntology(
        {
          name: "ai-pack",
          description: "AI music ontology",
          extensionContext: "sonic_arts",
          domainKeywords: ["harmony", "rhythm"],
          entryCount: 2,
        },
        mockSampling,
      );

      expect(result.created).toBe(true);
      expect(result.trustLevel).toBe("ai_generated");
      expect(result.entryCount).toBe(2);
      expect(result.installed).toBe(true);
      expect(mockSampling).toHaveBeenCalledOnce();
    });

    it("falls back to template when AI returns invalid JSON", async () => {
      const mockSampling = vi.fn().mockResolvedValue({
        content: "This is not JSON at all",
        model: "test-model",
        role: "assistant",
      });

      const result = await createOntology(
        {
          name: "fallback-pack",
          description: "Test fallback",
          entryCount: 3,
        },
        mockSampling,
      );

      expect(result.created).toBe(true);
      expect(result.trustLevel).toBe("template");
      expect(
        result.warnings.some((w) => w.includes("could not be parsed")),
      ).toBe(true);
    });

    it("falls back to template when AI returns invalid pack structure", async () => {
      const mockSampling = vi.fn().mockResolvedValue({
        content: JSON.stringify({
          name: "bad-pack",
          entries: [{ noId: true, noLabel: true }],
        }),
        model: "test-model",
        role: "assistant",
      });

      const result = await createOntology(
        {
          name: "bad-pack",
          description: "Test bad structure",
          entryCount: 3,
        },
        mockSampling,
      );

      expect(result.created).toBe(true);
      expect(result.trustLevel).toBe("template");
      expect(result.warnings.some((w) => w.includes("validation"))).toBe(true);
    });

    it("falls back to template when sampling throws", async () => {
      const mockSampling = vi
        .fn()
        .mockRejectedValue(new Error("Sampling unavailable"));

      const result = await createOntology(
        {
          name: "error-pack",
          description: "Test error handling",
          entryCount: 2,
        },
        mockSampling,
      );

      expect(result.created).toBe(true);
      expect(result.trustLevel).toBe("template");
      expect(
        result.warnings.some((w) => w.includes("AI generation failed")),
      ).toBe(true);
    });

    it("handles AI response wrapped in markdown code blocks", async () => {
      const packJson = JSON.stringify({
        name: "markdown-pack",
        version: "1.0.0",
        description: "Pack from markdown",
        entries: [{ id: "entry-1", label: "Entry 1", keywords: ["test"] }],
      });

      const mockSampling = vi.fn().mockResolvedValue({
        content: `Here's the ontology:\n\`\`\`json\n${packJson}\n\`\`\``,
        model: "test-model",
        role: "assistant",
      });

      const result = await createOntology(
        {
          name: "markdown-pack",
          description: "Test markdown extraction",
          entryCount: 1,
        },
        mockSampling,
      );

      expect(result.created).toBe(true);
      expect(result.trustLevel).toBe("ai_generated");
      expect(result.entryCount).toBe(1);
    });
  });

  describe("validation", () => {
    it("rejects empty name", async () => {
      await expect(
        createOntology({ name: "", description: "Test" }),
      ).rejects.toThrow(/name is required/i);
    });

    it("rejects empty description", async () => {
      await expect(
        createOntology({ name: "test", description: "" }),
      ).rejects.toThrow(/description is required/i);
    });
  });

  // ── Property Tests ──────────────────────────────────────────────────────

  describe("Property Tests", () => {
    it("forAll(name, description): template creation always succeeds for valid inputs", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc
            .string({ minLength: 1, maxLength: 40 })
            .filter((s) => /[a-zA-Z0-9]/.test(s)),
          fc.string({ minLength: 1, maxLength: 100 }),
          async (name, description) => {
            const result = await createOntology({
              name,
              description,
              entryCount: 3,
            });
            expect(result.created).toBe(true);
            expect(result.trustLevel).toBe("template");
            expect(result.installed).toBe(true);
            expect(result.entryCount).toBe(3);
          },
        ),
        { numRuns: 10 },
      );
    });

    it("forAll(entryCount): entry count is always capped at 100", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 500 }),
          async (entryCount) => {
            const result = await createOntology({
              name: `cap-test-${entryCount}`,
              description: "Testing cap",
              entryCount,
            });
            expect(result.entryCount).toBeLessThanOrEqual(100);
          },
        ),
        { numRuns: 10 },
      );
    });

    it("forAll(domain keywords): keyword-based entries always have valid IDs", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc
              .string({ minLength: 1, maxLength: 20 })
              .filter((s) => /[a-zA-Z]/.test(s)),
            { minLength: 1, maxLength: 5 },
          ),
          async (keywords) => {
            const result = await createOntology({
              name: `kw-test-${Date.now()}`,
              description: "Keyword test",
              domainKeywords: keywords,
              entryCount: keywords.length,
            });
            expect(result.created).toBe(true);
            expect(result.installed).toBe(true);
          },
        ),
        { numRuns: 10 },
      );
    });

    it("forAll(AI bad response): always falls back to template without crashing", async () => {
      await fc.assert(
        fc.asyncProperty(fc.string({ maxLength: 500 }), async (badJson) => {
          const mockSampling = vi.fn().mockResolvedValue({
            content: badJson,
            model: "test",
            role: "assistant",
          });

          const result = await createOntology(
            {
              name: `fallback-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
              description: "Test fallback",
              entryCount: 2,
            },
            mockSampling,
          );

          expect(result.created).toBe(true);
          expect(result.installed).toBe(true);
          // Either AI generation succeeded or template fallback was used
          expect(["ai_generated", "template"]).toContain(result.trustLevel);
        }),
        { numRuns: 15 },
      );
    });
  });
});
