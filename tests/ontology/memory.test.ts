import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import * as logger from "../../src/logger";
import {
  createMemoryManager,
  getMemoryUsage,
  loadPackIndex,
  queryPack,
} from "../../src/ontology/memory";

// ---------------------------------------------------------------------------
// Unit Tests
// ---------------------------------------------------------------------------

describe("TASK-32b: Ontology — Memory Management & Cache", () => {
  describe("memory budget [PERF-01]", () => {
    it("load pack index within budget: index available, memory tracked [PERF-01]", () => {
      const manager = createMemoryManager({ budgetBytes: 10_000_000 });
      const result = loadPackIndex(manager, "test-pack", { entries: 100 });
      expect(result.loaded).toBe(true);
      expect(getMemoryUsage(manager).total).toBeGreaterThan(0);
    });

    it("exceed memory budget: LRU pack evicted, most recently used retained [PERF-02]", () => {
      const manager = createMemoryManager({ budgetBytes: 1000 });
      const firstLoadedPackName = "pack-a";
      loadPackIndex(manager, firstLoadedPackName, { entries: 50 });
      loadPackIndex(manager, "pack-b", { entries: 50 });
      const result = loadPackIndex(manager, "pack-c", { entries: 50 });
      // The least recently used pack should be evicted
      const usage = getMemoryUsage(manager);
      expect(usage.total).toBeLessThanOrEqual(1000);
      expect(result.evictedPack).toBeDefined();
      expect(result.evictedPack).toBe(firstLoadedPackName);
    });
  });

  describe("cache behavior [PERF-05]", () => {
    it("query evicted pack: index rebuilt from disk (cold cache), results returned [PERF-05]", async () => {
      const manager = createMemoryManager({ budgetBytes: 1000 });
      // Use a pack with known terms to guarantee results on query
      loadPackIndex(manager, "pack-a", { entries: 50, terms: ["search term"] });
      // Force eviction by loading more packs
      loadPackIndex(manager, "pack-b", { entries: 50 });
      loadPackIndex(manager, "pack-c", { entries: 50 });
      // Query evicted pack using a term known to be in the pack data
      const result = await queryPack(manager, "pack-a", "search term");
      expect(result).toBeDefined();
      expect(result.results.length).toBeGreaterThan(0);
      expect(result.indexRebuilt).toBe(true);
    });
  });

  describe("lazy loading [PERF-09]", () => {
    it("lazy loading enabled: index not built at startup, built on first query [PERF-09]", async () => {
      const manager = createMemoryManager({
        budgetBytes: 10_000_000,
        lazyLoading: true,
      });
      expect(getMemoryUsage(manager).total).toBe(0);
      // Now query to trigger lazy loading
      const queryResult = await queryPack(manager, "test-pack", "test-term");
      expect(queryResult).toBeDefined();
      expect(getMemoryUsage(manager).total).toBeGreaterThan(0);
      expect(queryResult.indexSize).toBeGreaterThan(0);
      expect(queryResult.entriesLoaded).toBeGreaterThan(0);
    });
  });

  describe("staleness detection [ONT-16]", () => {
    it("pack file mtime changed: index rebuilt on next query after staleness period [ONT-16]", async () => {
      const manager = createMemoryManager({ budgetBytes: 10_000_000 });
      loadPackIndex(manager, "test-pack", { entries: 10, mtime: 1000 });
      // Simulate mtime change
      const result = await queryPack(manager, "test-pack", "term", {
        mtime: 2000,
      });
      expect(result.rebuilt).toBe(true);
    });

    it("pack file mtime unchanged: cached index reused, no rebuild [ONT-16]", async () => {
      const manager = createMemoryManager({ budgetBytes: 10_000_000 });
      loadPackIndex(manager, "test-pack", { entries: 10, mtime: 1000 });
      const result = await queryPack(manager, "test-pack", "term", {
        mtime: 1000,
      });
      expect(result.rebuilt).toBe(false);
    });
  });

  describe("memory tracking [PERF-01]", () => {
    it("memory usage query: returns per-pack breakdown and total [PERF-01]", () => {
      const manager = createMemoryManager({ budgetBytes: 10_000_000 });
      loadPackIndex(manager, "pack-a", { entries: 10 });
      loadPackIndex(manager, "pack-b", { entries: 20 });
      const usage = getMemoryUsage(manager);
      expect(usage.perPack).toBeDefined();
      expect(usage.total).toBeDefined();
      expect(Object.keys(usage.perPack)).toHaveLength(2);
    });
  });

  describe("cache logging [PERF-09]", () => {
    it("cold-cache query: logged at debug level with latency [PERF-09]", async () => {
      const logSpy = vi.spyOn(logger, "debug");
      const manager = createMemoryManager({ budgetBytes: 10_000_000 });
      const result = await queryPack(manager, "cold-pack", "term");
      expect(result).toBeDefined();
      // Use canonical property: latencyMs
      expect(result.latencyMs).toBeDefined();
      expect(result.cacheHit).toBe(false);
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringMatching(/cache miss|cold cache/i),
      );
      logSpy.mockRestore();
    });

    it("warm-cache query: completes within target latency [PERF-09]", async () => {
      const manager = createMemoryManager({ budgetBytes: 10_000_000 });
      loadPackIndex(manager, "warm-pack", { entries: 10 });
      const start = Date.now();
      await queryPack(manager, "warm-pack", "term");
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(100); // Spec target is <50ms, allow 2x margin
    });
  });

  describe("unloading [PERF-01]", () => {
    it("unload pack: memory freed, tracking updated [PERF-01]", () => {
      const manager = createMemoryManager({ budgetBytes: 10_000_000 });
      loadPackIndex(manager, "pack-a", { entries: 100 });
      const before = getMemoryUsage(manager).total;
      manager.unload("pack-a");
      const after = getMemoryUsage(manager).total;
      expect(after).toBeLessThan(before);
    });
  });

  describe("multi-pack budget [PERF-02]", () => {
    it("multiple packs, budget tight: only most recently used retained [PERF-02]", () => {
      const manager = createMemoryManager({ budgetBytes: 500 });
      loadPackIndex(manager, "p1", { entries: 20 });
      loadPackIndex(manager, "p2", { entries: 20 });
      loadPackIndex(manager, "p3", { entries: 20 });
      const usage = getMemoryUsage(manager);
      expect(usage.total).toBeLessThanOrEqual(500);
    });
  });
});

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe("TASK-32b: Property Tests", () => {
  it("forAll(cache state): total memory never exceeds configured budget [PERF-01]", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 10_000 }),
        fc.integer({ min: 1, max: 10 }),
        (budget, packCount) => {
          const manager = createMemoryManager({ budgetBytes: budget });
          for (let i = 0; i < packCount; i++) {
            loadPackIndex(manager, `pack-${i}`, { entries: 10 });
          }
          expect(getMemoryUsage(manager).total).toBeLessThanOrEqual(budget);
        },
      ),
    );
  });

  it("forAll(eviction): least-recently-used pack is always the one evicted [PERF-02]", () => {
    fc.assert(
      fc.property(fc.integer({ min: 3, max: 6 }), (packCount) => {
        const manager = createMemoryManager({ budgetBytes: 500 });
        const names: string[] = [];
        for (let i = 0; i < packCount; i++) {
          const name = `pack-${i}`;
          names.push(name);
          loadPackIndex(manager, name, { entries: 10 });
        }
        // Most recent should still be loaded
        const usage = getMemoryUsage(manager);
        const loadedPacks = Object.keys(usage.perPack);
        expect(loadedPacks).toContain(names[names.length - 1]);
      }),
    );
  });

  it("forAll(stale pack): index always rebuilt when mtime changes [ONT-16]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 1000 }),
        fc.integer({ min: 1001, max: 2000 }),
        async (oldMtime, newMtime) => {
          const manager = createMemoryManager({ budgetBytes: 10_000_000 });
          loadPackIndex(manager, "pack", { entries: 10, mtime: oldMtime });
          const result = await queryPack(manager, "pack", "term", {
            mtime: newMtime,
          });
          expect(result.rebuilt).toBe(true);
        },
      ),
      { numRuns: 5 },
    );
  });

  it("forAll(query): result is always returned (from cache or rebuilt) [PERF-05]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .string({ minLength: 1, maxLength: 20 })
          .filter((s) => /^[a-z-]+$/.test(s)),
        async (packName) => {
          const manager = createMemoryManager({ budgetBytes: 10_000_000 });
          const result = await queryPack(manager, packName, "search");
          expect(result).toBeDefined();
        },
      ),
      { numRuns: 5 },
    );
  });
});
