import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  scanDownward,
  shouldScanDirectory,
} from "../../src/hierarchy/discovery";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let testDir: string;

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), "brief-disc-test-"));
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

async function createProject(dir: string, name: string, updated?: string) {
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "BRIEF.md"),
    `**Project:** ${name}\n**Type:** project\n**Status:** development\n**Updated:** ${updated ?? "2025-06-01"}\n`,
  );
}

// ---------------------------------------------------------------------------
// Unit Tests
// ---------------------------------------------------------------------------

describe("TASK-19: Hierarchy — Collection Discovery (Downward Scan)", () => {
  describe("basic discovery [HIER-14]", () => {
    it("directory with three child projects: all three discovered with correct metadata [HIER-14]", async () => {
      await createProject(join(testDir, "proj-a"), "Project A");
      await createProject(join(testDir, "proj-b"), "Project B");
      await createProject(join(testDir, "proj-c"), "Project C");
      const result = await scanDownward(testDir);
      expect(result).toHaveLength(3);
    });

    it("nested projects (grandchildren): discovered up to depth limit [HIER-14]", async () => {
      await createProject(join(testDir, "parent"), "Parent");
      await createProject(join(testDir, "parent", "child"), "Child");
      await createProject(
        join(testDir, "parent", "child", "grandchild"),
        "Grandchild",
      );
      const result = await scanDownward(testDir, { depthLimit: 5 });
      expect(result.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("hidden directory skipping [PERF-04]", () => {
    it("hidden directory .git present: skipped, not scanned [PERF-04]", async () => {
      await createProject(join(testDir, ".git", "hidden-proj"), "Hidden");
      await createProject(join(testDir, "visible"), "Visible");
      const result = await scanDownward(testDir);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Visible");
    });

    it("hidden directory .node_modules present: skipped [PERF-04]", async () => {
      await createProject(join(testDir, "node_modules", "pkg-proj"), "Hidden");
      await createProject(join(testDir, "real"), "Real");
      const result = await scanDownward(testDir);
      expect(result).toHaveLength(1);
    });
  });

  describe("depth limit [HIER-14]", () => {
    it("scan depth limit of 2: projects at level 3+ not discovered [HIER-14]", async () => {
      await createProject(join(testDir, "l1"), "L1");
      await createProject(join(testDir, "l1", "l2"), "L2");
      await createProject(join(testDir, "l1", "l2", "l3"), "L3");
      const result = await scanDownward(testDir, { depthLimit: 2 });
      const names = result.map((r: any) => r.name);
      expect(names).toContain("L1");
      expect(names).toContain("L2");
      expect(names).not.toContain("L3");
    });

    it("default depth limit of 5: projects at level 6+ not discovered [HIER-14]", async () => {
      let path = testDir;
      for (let i = 0; i < 7; i++) {
        path = join(path, `level-${i}`);
        await createProject(path, `Level ${i}`);
      }
      const result = await scanDownward(testDir);
      // G-128: assert exactly the number of levels found equals the expected depth (5 per spec)
      expect(result.length).toBe(5);
    });
  });

  describe("metadata-only fast path [PERF-08]", () => {
    it("BRIEF.md with only metadata: metadata extracted without full parse [PERF-08]", async () => {
      await createProject(
        join(testDir, "proj"),
        "FastPath Project",
        "2025-08-01",
      );
      const result = await scanDownward(testDir);
      expect(result[0].name).toBe("FastPath Project");
      expect(result[0].type).toBe("project");
    });

    it("large directory tree (100+ subdirs): only metadata read from each BRIEF.md, full content not parsed [PERF-04]", async () => {
      const result = await scanDownward(testDir, {
        depthLimit: 3,
        metadataOnly: true,
        simulateLargeDirectory: true,
      });
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      // G-127: assert performance limit is respected (result is an array; cast for optional annotation properties)
      expect(result.length <= 100 || (result as any).truncated === true).toBe(
        true,
      );
      expect(result.some((project: any) => project.metadataOnly === true)).toBe(
        true,
      );
      result.forEach((project: any) => {
        expect(project.metadata).toBeDefined();
        expect(project.sections).toBeUndefined();
      });
    });
  });

  describe("result sorting [HIER-14]", () => {
    it("results from multiple projects: sorted by most-recently-updated first [HIER-14]", async () => {
      await createProject(join(testDir, "old"), "Old", "2024-01-01");
      await createProject(join(testDir, "new"), "New", "2025-12-01");
      await createProject(join(testDir, "mid"), "Mid", "2025-06-01");
      const result = await scanDownward(testDir);
      expect(result[0].name).toBe("New");
      expect(result[2].name).toBe("Old");
    });
  });

  describe("edge cases [HIER-14]", () => {
    it("directory with no BRIEF.md files anywhere: empty result [HIER-14]", async () => {
      await mkdir(join(testDir, "empty"));
      const result = await scanDownward(testDir);
      expect(result).toHaveLength(0);
    });

    it("mixed hierarchy: only directories with BRIEF.md returned [HIER-14]", async () => {
      await mkdir(join(testDir, "no-brief"));
      await createProject(join(testDir, "has-brief"), "Has Brief");
      const result = await scanDownward(testDir);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Has Brief");
    });

    it("case-insensitive BRIEF.md matching: brief.md discovered [HIER-11]", async () => {
      const dir = join(testDir, "lower");
      await mkdir(dir);
      await writeFile(
        join(dir, "brief.md"),
        "**Project:** Lower\n**Type:** project\n",
      );
      const result = await scanDownward(testDir);
      expect(result).toHaveLength(1);
    });

    it("case-insensitive BRIEF.md matching: BRIEF.MD (all caps) discovered [HIER-11]", async () => {
      const dir = join(testDir, "allcaps");
      await mkdir(dir);
      await writeFile(
        join(dir, "BRIEF.MD"),
        "**Project:** AllCaps\n**Type:** project\n",
      );
      const result = await scanDownward(testDir);
      expect(result).toHaveLength(1);
    });
  });
});

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe("TASK-19: Property Tests", () => {
  it("forAll(directory tree): discovered projects never exceed configured depth limit [HIER-14]", async () => {
    // G-129: make it() async, add await before fc.assert(...)
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 5 }), async (limit) => {
        // Create a tree deeper than the limit
        let path = testDir;
        for (let i = 0; i < limit + 3; i++) {
          path = join(path, `d${i}`);
          await createProject(path, `P${i}`);
        }
        const result = await scanDownward(testDir, { depthLimit: limit });
        expect(result.length).toBeLessThanOrEqual(limit);
      }),
      { numRuns: 3 },
    );
  });

  it("forAll(discovered projects): results are always sorted by most-recently-updated [HIER-14]", async () => {
    // G-130: make it() async, add await before fc.assert(...)
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.integer({ min: 2020, max: 2026 }), {
          minLength: 2,
          maxLength: 5,
        }),
        async (years) => {
          for (let i = 0; i < years.length; i++) {
            await createProject(
              join(testDir, `proj-${i}`),
              `Proj ${i}`,
              `${years[i]}-06-01`,
            );
          }
          const result = await scanDownward(testDir);
          for (let i = 0; i < result.length - 1; i++) {
            expect(result[i].updated >= result[i + 1].updated).toBe(true);
          }
        },
      ),
      { numRuns: 3 },
    );
  });

  it("forAll(directory tree): hidden directories (starting with .) are never scanned [HIER-14]", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc
            .string({ minLength: 1, maxLength: 20 })
            .filter((s) => /^[a-zA-Z0-9._-]+$/.test(s)),
          { minLength: 1, maxLength: 10 },
        ),
        (dirNames) => {
          const hiddenDirs = dirNames.filter((d: string) => d.startsWith("."));
          hiddenDirs.forEach((dir: string) => {
            expect(shouldScanDirectory(dir)).toBe(false);
          });
          // Well-known skip directories should also be excluded
          expect(shouldScanDirectory(".hidden")).toBe(false);
          expect(shouldScanDirectory("node_modules")).toBe(false);
          expect(shouldScanDirectory(".venv")).toBe(false);
        },
      ),
    );
  });

  it("forAll(discovered project): only metadata fields read, never full section content [PERF-08]", async () => {
    // G-131: fix isolation bug -- create fresh dir per iteration to prevent project accumulation across runs
    await fc.assert(
      fc.asyncProperty(
        fc
          .string({ minLength: 3, maxLength: 10 })
          .filter((s) => /^[a-z]+$/.test(s)),
        async (projectName) => {
          // Create isolated directory per iteration to avoid accumulation across fast-check iterations
          const iterDir = await mkdtemp(join(tmpdir(), "brief-meta-"));
          try {
            await createProject(join(iterDir, "proj"), projectName);
            const result = await scanDownward(iterDir, { metadataOnly: true });
            expect(result).toBeDefined();
            expect(result.length).toBeGreaterThan(0);
            expect(result[0].metadata).toBeDefined();
            expect(result[0].sections).toBeUndefined();
          } finally {
            await rm(iterDir, { recursive: true, force: true });
          }
        },
      ),
      { numRuns: 5 }, // G3: raised from 2 — minimum meaningful property coverage
    );
  });
});
