import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { walkUpward } from "../../src/hierarchy/walker";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let testDir: string;

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), "brief-hier-test-"));
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

async function createHierarchy(levels: string[], briefAtLevels: number[]) {
  let current = testDir;
  const paths: string[] = [current];
  for (let i = 0; i < levels.length; i++) {
    current = join(current, levels[i]);
    await mkdir(current, { recursive: true });
    paths.push(current);
    if (briefAtLevels.includes(i)) {
      await writeFile(
        join(current, "BRIEF.md"),
        `**Project:** ${levels[i]}\n**Type:** ${i === 0 ? "artist" : i === 1 ? "album" : "song"}\n`,
      );
    }
  }
  return paths;
}

// ---------------------------------------------------------------------------
// Unit Tests
// ---------------------------------------------------------------------------

describe("TASK-17: Hierarchy — Upward Traversal", () => {
  describe("basic traversal [HIER-01]", () => {
    it("three-level hierarchy (artist/album/song) produces three BRIEF.md paths in bottom-to-top order [HIER-01]", async () => {
      const paths = await createHierarchy(
        ["artist", "album", "song"],
        [0, 1, 2],
      );
      const result = await walkUpward(paths[3], { workspaceRoots: [testDir] });
      expect(result).toHaveLength(3);
      // Bottom-to-top: song, album, artist
      expect(result[0]).toContain("song");
      expect(result[2]).toContain("artist");
    });
  });

  describe("stop conditions [HIER-02, HIER-07, HIER-08]", () => {
    it("walk reaches configured workspace root and stops [HIER-02]", async () => {
      const paths = await createHierarchy(["project", "sub"], [0, 1]);
      const result = await walkUpward(paths[2], { workspaceRoots: [paths[1]] });
      // Should stop at 'project' (workspace root), not traverse higher
      expect(result).toHaveLength(1);
    });

    it("walk reaches depth limit of 10 and stops [HIER-07]", async () => {
      // Create deeply nested hierarchy
      const levels = Array.from({ length: 15 }, (_, i) => `level-${i}`);
      const paths = await createHierarchy(
        levels,
        levels.map((_, i) => i),
      );
      const result = await walkUpward(paths[15], {
        workspaceRoots: [testDir],
        depthLimit: 10,
      });
      // G-107: assert the exact depth returned is 10 (the limit)
      expect(result.length).toBe(10);
    });

    it("directory contains .git folder: stops at that directory [HIER-08]", async () => {
      const paths = await createHierarchy(["repo", "sub"], [0, 1]);
      await mkdir(join(paths[1], ".git"));
      const result = await walkUpward(paths[2], { workspaceRoots: [testDir] });
      // G-108: the .git stop condition means only the sub level (below .git boundary) is included
      // The directory with .git (repo) is the stop boundary; only sub (which has BRIEF.md) is included
      expect(result.length).toBe(1);
      expect(
        result.every(
          (p: string) =>
            !p.split("/").includes(".git") && !p.split("\\").includes(".git"),
        ),
      ).toBe(true);
    });

    it("walk reaches filesystem root and stops [HIER-08]", async () => {
      // G-109: assert result is empty array when no BRIEF.md files exist in the directory tree
      const emptyDir = join(testDir, "no-brief-anywhere");
      await mkdir(emptyDir);
      const result = await walkUpward(emptyDir, { workspaceRoots: [] });
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      // Walker should not throw when hitting filesystem root and should return empty when no BRIEF.md found
      expect(result).toEqual([]);
    });
  });

  describe("missing layers [HIER-09]", () => {
    it("intermediate directory has no BRIEF.md: skipped silently, walk continues [HIER-09]", async () => {
      const paths = await createHierarchy(["top", "middle", "bottom"], [0, 2]); // Skip level 1
      const result = await walkUpward(paths[3], { workspaceRoots: [testDir] });
      expect(result).toHaveLength(2); // top and bottom only
    });
  });

  describe("BRIEF.md detection [HIER-11, HIER-12]", () => {
    it("directory has both BRIEF.md and brief.md: hard error listing both paths [HIER-12]", async () => {
      const dir = join(testDir, "conflict");
      await mkdir(dir);
      await writeFile(join(dir, "BRIEF.md"), "content1");
      await writeFile(join(dir, "brief.md"), "content2");
      await expect(
        walkUpward(dir, { workspaceRoots: [testDir] }),
      ).rejects.toThrow(/BRIEF\.md|brief\.md|multiple/i);
    });

    it("directory has project-brief.md but no BRIEF.md: level skipped [HIER-11]", async () => {
      const dir = join(testDir, "nobrief");
      await mkdir(dir);
      await writeFile(join(dir, "project-brief.md"), "content");
      const result = await walkUpward(dir, { workspaceRoots: [testDir] });
      // No BRIEF.md recognized
      expect(result).toHaveLength(0);
    });
  });

  describe("symlink handling [HIER-15b]", () => {
    it("symlink in path: followed, BRIEF.md at target included [HIER-15b]", async () => {
      const real = join(testDir, "real-dir");
      const link = join(testDir, "link-dir");
      await mkdir(real);
      await writeFile(join(real, "BRIEF.md"), "**Project:** Real\n");
      try {
        await symlink(real, link, "dir");
        const result = await walkUpward(link, { workspaceRoots: [testDir] });
        // G-110: assert result contains the symlink target's BRIEF.md path and result.length === 1
        expect(result.length).toBe(1);
        expect(result[0]).toContain("BRIEF.md");
      } catch (e: any) {
        expect.fail(`symlink test threw: ${e.message}`);
      }
    });

    it("circular symlink: walk stops with warning, no error [HIER-15b]", async () => {
      // Circular symlinks are OS-dependent; test the visited-set mechanism
      const dir = join(testDir, "circular");
      await mkdir(dir);
      await writeFile(join(dir, "BRIEF.md"), "**Project:** Test\n");
      // Test the visited-set mechanism by providing a path that would cycle
      const result = await walkUpward(dir, {
        workspaceRoots: [testDir],
        simulateCycle: true,
      });
      expect(result).toBeDefined();
      // Walker should terminate without hanging
      expect(result.length).toBeLessThanOrEqual(10); // Reasonable upper bound
      // G-111: assert cycleDetected is a boolean and is true
      expect(typeof result.cycleDetected).toBe("boolean");
      expect(result.cycleDetected).toBe(true);
    });
  });

  describe("edge cases [HIER-01, HIER-10]", () => {
    it("starting directory is the workspace root: returns only that level [HIER-01]", async () => {
      await writeFile(join(testDir, "BRIEF.md"), "**Project:** Root\n");
      const result = await walkUpward(testDir, { workspaceRoots: [testDir] });
      expect(result).toHaveLength(1);
    });

    it("sibling directories present: never read, only parent traversed [HIER-10]", async () => {
      await mkdir(join(testDir, "album"));
      await mkdir(join(testDir, "album", "track-01"));
      await mkdir(join(testDir, "album", "track-02"));
      await writeFile(
        join(testDir, "album", "BRIEF.md"),
        "**Project:** Album\n",
      );
      await writeFile(
        join(testDir, "album", "track-01", "BRIEF.md"),
        "**Project:** T1\n",
      );
      await writeFile(
        join(testDir, "album", "track-02", "BRIEF.md"),
        "**Project:** T2\n",
      );
      const result = await walkUpward(join(testDir, "album", "track-02"), {
        workspaceRoots: [testDir],
      });
      // Should NOT include track-01
      const hasTrack01 = result.some((p: string) => p.includes("track-01"));
      expect(hasTrack01).toBe(false);
    });

    it("custom depth limit of 3: stops after 3 levels [HIER-07]", async () => {
      const paths = await createHierarchy(
        ["a", "b", "c", "d", "e"],
        [0, 1, 2, 3, 4],
      );
      const result = await walkUpward(paths[5], {
        workspaceRoots: [testDir],
        depthLimit: 3,
      });
      // G-112: assert result.length === 3
      expect(result.length).toBe(3);
    });

    it("empty hierarchy (no BRIEF.md anywhere): empty result [HIER-09]", async () => {
      const dir = join(testDir, "empty");
      await mkdir(dir);
      const result = await walkUpward(dir, { workspaceRoots: [testDir] });
      expect(result).toHaveLength(0);
    });
  });
});

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe("TASK-17: Property Tests", () => {
  it("forAll(directory hierarchy): walker never visits a directory twice [HIER-15b]", async () => {
    // G-113: make it() async, add await before fc.assert(...)
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 5 }), async (depth) => {
        const levels = Array.from({ length: depth }, (_, i) => `dir-${i}`);
        const paths = await createHierarchy(
          levels,
          levels.map((_, i) => i),
        );
        const result = await walkUpward(paths[depth], {
          workspaceRoots: [testDir],
        });
        // All paths should be unique
        const unique = new Set(result);
        expect(unique.size).toBe(result.length);
      }),
      { numRuns: 5 },
    );
  });

  it("forAll(hierarchy with workspace root): walker never traverses above the root [HIER-02]", async () => {
    // G-114: make it() async, add await before fc.assert(...)
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 4 }), async (rootLevel) => {
        const levels = Array.from({ length: 5 }, (_, i) => `l-${i}`);
        const paths = await createHierarchy(
          levels,
          levels.map((_, i) => i),
        );
        const root = paths[rootLevel];
        const result = await walkUpward(paths[5], { workspaceRoots: [root] });
        // No result should be above the root
        for (const p of result) {
          expect(p.startsWith(root) || p === root).toBe(true);
        }
      }),
      { numRuns: 5 },
    );
  });

  it("forAll(hierarchy depth): result count never exceeds configured depth limit [HIER-07]", async () => {
    // G-115: make it() async, add await before fc.assert(...)
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 10 }),
        fc.integer({ min: 1, max: 5 }),
        async (actualDepth, limit) => {
          const levels = Array.from(
            { length: actualDepth },
            (_, i) => `d-${i}`,
          );
          const paths = await createHierarchy(
            levels,
            levels.map((_, i) => i),
          );
          const result = await walkUpward(paths[actualDepth], {
            workspaceRoots: [testDir],
            depthLimit: limit,
          });
          expect(result.length).toBeLessThanOrEqual(limit);
        },
      ),
      { numRuns: 5 },
    );
  });

  it("forAll(directory listing): only files matching case-insensitive BRIEF.md are considered [HIER-01]", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc
            .string({ minLength: 1, maxLength: 20 })
            .filter((s) => /^[a-zA-Z0-9._-]+$/.test(s)),
          { minLength: 1, maxLength: 10 },
        ),
        (filenames) => {
          const { isBriefFile } = require("../../src/hierarchy/walker");
          // Only files named BRIEF.md (case-insensitive) should be considered
          const briefFiles = filenames.filter((f: string) => isBriefFile(f));
          briefFiles.forEach((f: string) => {
            // G-116: assert each item ends with 'BRIEF.md' (case-insensitive)
            expect(f.toLowerCase()).toBe("brief.md");
          });
        },
      ),
    );
  });
});
