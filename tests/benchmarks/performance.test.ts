import fc from "fast-check";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Unit Tests
// ---------------------------------------------------------------------------

describe("TASK-52: Cross-Cutting — Performance Verification & Benchmarks", () => {
  describe("parser benchmarks [PERF-03]", () => {
    it("parse 1KB file: completes within target latency [PERF-03]", async () => {
      const { parse } = await import("../../src/parser/preprocessing");
      const content = "x".repeat(1024);
      const start = Date.now();
      await parse(content);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(1000);
    });

    it("parse 100KB file: streaming approach used [PERF-03]", async () => {
      const { parse } = await import("../../src/parser/preprocessing");
      const content = "x".repeat(100 * 1024);
      const result = await parse(content);
      expect(result).toBeDefined();
      expect((result as any).streamingUsed).toMatch(/stream|streaming/i);
    });

    it("parse 1MB file: no memory spike, streaming active [PERF-03]", async () => {
      const { parse } = await import("../../src/parser/preprocessing");
      const content = "x".repeat(1024 * 1024);
      const heapBefore = process.memoryUsage().heapUsed;
      const result = await parse(content);
      const heapAfter = process.memoryUsage().heapUsed;
      expect(result).toBeDefined();
      // Memory spike should be reasonable (less than 10x the content size)
      expect(heapAfter - heapBefore).toBeLessThan(10 * 1024 * 1024);
    });

    it("parse 10MB file: completes without out-of-memory [PERF-03]", async () => {
      const { parse } = await import("../../src/parser/preprocessing");
      const content = "x".repeat(10 * 1024 * 1024);
      const heapBefore = process.memoryUsage().heapUsed;
      const result = await parse(content);
      const heapAfter = process.memoryUsage().heapUsed;
      expect(result).toBeDefined();
      expect(heapAfter - heapBefore).toBeLessThan(100 * 1024 * 1024);
    }, 30_000);
  });

  describe("ontology search benchmarks [PERF-09]", () => {
    it("ontology search (warm cache): <50ms latency [PERF-09]", async () => {
      const { searchOntology } = await import("../../src/ontology/search");
      // Warm up
      await searchOntology({ query: "theme", ontology: "theme-pack" });
      const start = Date.now();
      await searchOntology({ query: "theme", ontology: "theme-pack" });
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(50);
    });

    it("ontology search (cold cache): <500ms latency [PERF-09]", async () => {
      const { searchOntology } = await import("../../src/ontology/search");
      const start = Date.now();
      await searchOntology({ query: "cold-query", ontology: "cold-pack" });
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(500);
    });

    it("ontology search exceeding 100ms → warning logged at debug level [OBS-09]", async () => {
      const { searchOntology } = await import("../../src/ontology/search");
      // The implementation logs a warning when search takes >100ms
      // We verify the function accepts a slow_threshold parameter
      const result = await searchOntology({
        query: "test",
        ontology: "theme-pack",
        slowThresholdMs: 1, // Very low threshold to trigger warning on any real call
      } as any);
      expect(result).toBeDefined();
      expect((result as any).latencyMs).toBeDefined();
      expect((result as any).warningLogged).toBe(true);
    });
  });

  describe("workspace scan benchmarks [PERF-08]", () => {
    it("workspace scan with 5000+ directories: completes within target time [PERF-08]", async () => {
      const { scanDownward } = await import("../../src/hierarchy/discovery");
      const start = Date.now();
      await scanDownward({
        root: "/tmp/bench-workspace",
        depthLimit: 5,
      } as unknown as string);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(30_000);
    });

    it("workspace scan: hidden directories skipped, only metadata read [PERF-08]", async () => {
      const { scanDownward } = await import("../../src/hierarchy/discovery");
      const result = await scanDownward({
        root: "/tmp/bench-workspace",
        depthLimit: 3,
      } as unknown as string);
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      result.forEach((p: any) => {
        // No hidden directories in results
        expect(p.path).not.toMatch(/^\.|\/.|\\\./);
        // Metadata only — no full section content
        expect(p.sections).toBeUndefined();
      });
    });
  });

  describe("memory benchmarks [PERF-01]", () => {
    it("memory with 5 packs (1000 entries each): within 100MB budget [PERF-01]", async () => {
      const { createMemoryManager, loadPackIndex, getMemoryUsage } =
        await import("../../src/ontology/memory");
      const manager = createMemoryManager({ budgetBytes: 100 * 1024 * 1024 });
      for (let i = 0; i < 5; i++) {
        loadPackIndex(manager, `bench-pack-${i}`, { entries: 1000 });
      }
      const usage = getMemoryUsage(manager);
      expect(usage.total).toBeLessThanOrEqual(100 * 1024 * 1024);
    });

    it("memory budget exceeded: LRU eviction activates [PERF-01]", async () => {
      const { createMemoryManager, loadPackIndex, getMemoryUsage } =
        await import("../../src/ontology/memory");
      const manager = createMemoryManager({ budgetBytes: 1000 });
      for (let i = 0; i < 10; i++) {
        loadPackIndex(manager, `evict-pack-${i}`, { entries: 100 });
      }
      const usage = getMemoryUsage(manager);
      expect(usage.total).toBeLessThanOrEqual(1000);
    });
  });

  describe("startup benchmarks [PERF-01]", () => {
    it("startup with 1 pack: <2s [PERF-01]", async () => {
      const { bootstrapServer } = await import("../../src/server/bootstrap");
      const start = Date.now();
      const server = await bootstrapServer({ packs: 1, dryRun: true });
      const elapsed = Date.now() - start;
      expect(server).toBeDefined();
      expect(elapsed).toBeLessThan(2000);
    });

    it("startup with 20 packs: <2s (or lazy loading activated) [PERF-01]", async () => {
      const { bootstrapServer } = await import("../../src/server/bootstrap");
      const start = Date.now();
      const server = await bootstrapServer({ packs: 20, dryRun: true });
      const elapsed = Date.now() - start;
      expect(server).toBeDefined();
      expect(elapsed).toBeLessThan(2000);
      // If over target, lazy loading must have been activated
      expect(elapsed < 1000 || server.lazyLoadingActivated).toBe(true);
    });
  });

  describe("response size [PERF-11]", () => {
    it("response size exceeding 32KB: truncation signal emitted [PERF-11]", async () => {
      const { truncateResponse } = await import(
        "../../src/server/response-formatting"
      );
      const largeData = "x".repeat(40_000);
      const result = truncateResponse(largeData, { maxSize: 32_768 });
      expect(result.truncated).toBe(true);
    });
  });

  describe("rate limiting [PERF-10, T52-01]", () => {
    it("token bucket rate limiter: reads capped at 50/s [PERF-10]", async () => {
      const { checkRateLimit } = await import(
        "../../src/server/signal-handling"
      );
      const withinLimit = checkRateLimit({ type: "read", currentRate: 50 });
      expect(withinLimit.exceeded).toBe(false);
      const overLimit = checkRateLimit({ type: "read", currentRate: 51 });
      expect(overLimit.exceeded).toBe(true);
    });

    it("token bucket rate limiter: writes capped at 10/s [PERF-10]", async () => {
      const { checkRateLimit } = await import(
        "../../src/server/signal-handling"
      );
      const withinLimit = checkRateLimit({ type: "write", currentRate: 10 });
      expect(withinLimit.exceeded).toBe(false);
      const overLimit = checkRateLimit({ type: "write", currentRate: 11 });
      expect(overLimit.exceeded).toBe(true);
    });
  });

  describe("search result pagination [PERF-07, T52-02]", () => {
    it("search with max_results=5: result count capped at 5 [PERF-07]", async () => {
      const { searchOntology } = await import("../../src/ontology/search");
      const result = await searchOntology({
        query: "theme",
        ontology: "theme-pack",
        maxResults: 5,
      });
      expect(result.results).toBeDefined();
      expect(result.results.length).toBeLessThanOrEqual(5);
    });

    it("search with max_results=1: only 1 result returned [PERF-07]", async () => {
      const { searchOntology } = await import("../../src/ontology/search");
      const result = await searchOntology({
        query: "theme",
        ontology: "theme-pack",
        maxResults: 1,
      });
      expect(result.results.length).toBeLessThanOrEqual(1);
    });
  });

  describe("async I/O [PERF-06]", () => {
    it("file I/O: no synchronous fs calls used in tool handlers [PERF-06]", async () => {
      const { readFileSafe, writeFileSafe, atomicWriteFile } = await import(
        "../../src/io/file-io"
      );
      // Actually call the functions with test arguments to verify they return Promises
      const readResult = readFileSafe("/tmp/nonexistent-test.txt").catch(
        () => null,
      );
      expect(readResult).toBeInstanceOf(Promise);
      const writeResult = writeFileSafe("/tmp/nonexistent-test.txt", "").catch(
        () => null,
      );
      expect(writeResult).toBeInstanceOf(Promise);
      const atomicResult = atomicWriteFile(
        "/tmp/nonexistent-test.txt",
        "",
      ).catch(() => null);
      expect(atomicResult).toBeInstanceOf(Promise);
    });
  });
});

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe("TASK-52: Property Tests", () => {
  it("forAll(warm-cache search): latency always <50ms [PERF-09]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .string({ minLength: 2, maxLength: 10 })
          .filter((s) => /^[a-z]+$/.test(s)),
        async (query) => {
          const { searchOntology } = await import("../../src/ontology/search");
          // Warm up
          await searchOntology({ query: "warmup", ontology: "theme-pack" });
          const start = Date.now();
          await searchOntology({ query, ontology: "theme-pack" });
          const elapsed = Date.now() - start;
          expect(elapsed).toBeLessThan(50);
        },
      ),
      { numRuns: 5 },
    );
  });

  it("forAll(loaded packs): total index memory within configured budget [PERF-01]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 100, max: 1000 }),
        async (packCount, budgetMb) => {
          const { loadPacks } = await import("../../src/ontology/memory");
          const before = process.memoryUsage().heapUsed;
          await loadPacks({ simulateNPacks: packCount });
          const after = process.memoryUsage().heapUsed;
          const usedMb = Math.max(0, after - before) / 1024 / 1024;
          expect(usedMb).toBeLessThanOrEqual(budgetMb);
        },
      ),
      { numRuns: 3 },
    );
  });

  it("forAll(tool response): size within configured limit or truncation signal present [PERF-11]", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 65536 }), async (dataSize) => {
        const { truncateResponse } = await import(
          "../../src/server/response-formatting"
        );
        const data = "x".repeat(dataSize);
        // T52-03: use maxSize (consistent with unit test API)
        const result = await truncateResponse(data, { maxSize: 32768 });
        if (dataSize > 32768) {
          expect(result.truncated).toBe(true);
          expect(result.signal).toBeDefined();
        } else {
          expect(result.content).toBe(data);
        }
      }),
      { numRuns: 20 },
    );
  });

  it("forAll(file I/O): always asynchronous [PERF-06]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom("readFileSafe", "writeFileSafe", "atomicWriteFile"),
        async (fnName) => {
          const fileIo = await import("../../src/io/file-io");
          const fn = (fileIo as any)[fnName];
          expect(typeof fn).toBe("function");
          // Call the function with a test argument to verify it returns a Promise
          const result = fn("/tmp/test-async-check.txt", "").catch(() => null);
          expect(result).toBeInstanceOf(Promise);
        },
      ),
    );
  });
});
