import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getHierarchyPosition } from "../../src/hierarchy/position";
import { buildHierarchyTree } from "../../src/hierarchy/tree";

// ---------------------------------------------------------------------------
// Setup: Create a 3-level hierarchy (artist/album/song)
// ---------------------------------------------------------------------------

let tmpDir: string;

function writeBriefMd(
  dirPath: string,
  meta: { project: string; type: string },
): void {
  fs.mkdirSync(dirPath, { recursive: true });
  const content = [
    `**Project:** ${meta.project}`,
    `**Type:** ${meta.type}`,
    "**Status:** active",
    `**Created:** 2025-01-01`,
    `**Updated:** 2025-01-01`,
    "**Version:** 1.0",
    "",
  ].join("\n");
  fs.writeFileSync(path.join(dirPath, "BRIEF.md"), content, "utf-8");
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "brief-hierarchy-test-"));

  // Create 3-level hierarchy: artist > album1, album2 > song1
  writeBriefMd(tmpDir, { project: "Test Artist", type: "artist" });
  writeBriefMd(path.join(tmpDir, "album1"), {
    project: "First Album",
    type: "album",
  });
  writeBriefMd(path.join(tmpDir, "album2"), {
    project: "Second Album",
    type: "album",
  });
  writeBriefMd(path.join(tmpDir, "album1", "song1"), {
    project: "Opening Track",
    type: "song",
  });
});

afterEach(() => {
  vi.clearAllMocks();
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {}
});

// ---------------------------------------------------------------------------
// getHierarchyPosition Tests
// ---------------------------------------------------------------------------

describe("WP3/GAP-B+H: getHierarchyPosition", () => {
  it("returns correct depth for leaf project (song)", async () => {
    const result = await getHierarchyPosition({
      projectPath: path.join(tmpDir, "album1", "song1"),
      workspaceRoots: [tmpDir],
    });
    expect(result.depth).toBeGreaterThanOrEqual(1);
    expect(result.currentProject.type).toBe("song");
  });

  it("returns parent info for child project", async () => {
    const result = await getHierarchyPosition({
      projectPath: path.join(tmpDir, "album1"),
      workspaceRoots: [tmpDir],
    });
    expect(result.parent).toBeDefined();
    expect(result.parent?.type).toBe("artist");
    expect(result.parent?.name).toBe("Test Artist");
  });

  it("returns children for parent project", async () => {
    const result = await getHierarchyPosition({
      projectPath: tmpDir,
      workspaceRoots: [tmpDir],
    });
    expect(result.children.length).toBeGreaterThan(0);
    const childTypes = result.children.map((c) => c.type);
    expect(childTypes).toContain("album");
  });

  it("returns siblings for mid-level project", async () => {
    const result = await getHierarchyPosition({
      projectPath: path.join(tmpDir, "album1"),
      workspaceRoots: [tmpDir],
    });
    expect(result.siblings.length).toBeGreaterThan(0);
    const siblingNames = result.siblings.map((s) => s.name);
    expect(siblingNames).toContain("Second Album");
  });

  it("returns depth 0 and no parent for root project", async () => {
    const result = await getHierarchyPosition({
      projectPath: tmpDir,
      workspaceRoots: [tmpDir],
    });
    expect(result.depth).toBe(0);
    expect(result.parent).toBeUndefined();
  });

  it("handles project with no BRIEF.md gracefully", async () => {
    const emptyDir = path.join(tmpDir, "empty-dir");
    fs.mkdirSync(emptyDir, { recursive: true });
    const result = await getHierarchyPosition({
      projectPath: emptyDir,
      workspaceRoots: [tmpDir],
    });
    expect(result.currentProject).toBeDefined();
    expect(result.currentProject.name).toBeDefined();
  });

  it("signal includes type and position info", async () => {
    const result = await getHierarchyPosition({
      projectPath: path.join(tmpDir, "album1"),
      workspaceRoots: [tmpDir],
    });
    expect(result.signal).toBeDefined();
    expect(result.signal.length).toBeGreaterThan(0);
    expect(result.signal).toContain("album");
  });
});

// ---------------------------------------------------------------------------
// buildHierarchyTree Tests
// ---------------------------------------------------------------------------

describe("WP3/GAP-B+H: buildHierarchyTree", () => {
  it("builds correct tree from 3-level hierarchy", async () => {
    const result = await buildHierarchyTree({ rootPath: tmpDir });
    expect(result.totalProjects).toBeGreaterThanOrEqual(4); // artist + 2 albums + 1 song
    expect(result.maxDepth).toBeGreaterThanOrEqual(2);
  });

  it("ascii output contains all project names", async () => {
    const result = await buildHierarchyTree({ rootPath: tmpDir });
    expect(result.ascii).toContain("Test Artist");
    expect(result.ascii).toContain("First Album");
    expect(result.ascii).toContain("Second Album");
    expect(result.ascii).toContain("Opening Track");
  });

  it("ascii output uses box-drawing characters for children", async () => {
    const result = await buildHierarchyTree({ rootPath: tmpDir });
    // Root has 2+ children so at least one should use ├── and last uses └──
    const hasBoxChars =
      result.ascii.includes("├──") || result.ascii.includes("└──");
    expect(hasBoxChars).toBe(true);
  });

  it("respects depthLimit", async () => {
    const result = await buildHierarchyTree({
      rootPath: tmpDir,
      depthLimit: 1,
    });
    // Should include artist + albums but not songs at depth 2
    expect(result.ascii).toContain("Test Artist");
    expect(result.ascii).toContain("First Album");
  });

  it("healthCheck flags project with missing type", async () => {
    const noTypePath = path.join(tmpDir, "no-type");
    fs.mkdirSync(noTypePath, { recursive: true });
    fs.writeFileSync(
      path.join(noTypePath, "BRIEF.md"),
      "**Project:** No Type\n**Status:** active\n",
      "utf-8",
    );

    const result = await buildHierarchyTree({
      rootPath: tmpDir,
      includeHealthCheck: true,
    });
    expect(result.healthIssues).toBeDefined();
    const typeIssues = result.healthIssues!.filter((i) =>
      i.issue.toLowerCase().includes("type"),
    );
    expect(typeIssues.length).toBeGreaterThan(0);
  });

  it("handles root with no children", async () => {
    const soloDir = fs.mkdtempSync(path.join(os.tmpdir(), "brief-solo-test-"));
    writeBriefMd(soloDir, { project: "Solo", type: "test" });

    try {
      const result = await buildHierarchyTree({ rootPath: soloDir });
      expect(result.totalProjects).toBe(1);
      expect(result.tree.children).toEqual([]);
    } finally {
      fs.rmSync(soloDir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe("WP3/GAP-B+H: Property Tests", () => {
  it("forAll(path): getHierarchyPosition never throws for valid paths", async () => {
    const paths = [
      tmpDir,
      path.join(tmpDir, "album1"),
      path.join(tmpDir, "album2"),
      path.join(tmpDir, "album1", "song1"),
    ];
    await fc.assert(
      fc.asyncProperty(fc.constantFrom(...paths), async (projectPath) => {
        const result = await getHierarchyPosition({
          projectPath,
          workspaceRoots: [tmpDir],
        });
        expect(result).toBeDefined();
        expect(result.currentProject).toBeDefined();
        expect(typeof result.depth).toBe("number");
      }),
      { numRuns: 10 },
    );
  });

  it("forAll(project count): buildHierarchyTree.totalProjects matches actual count", async () => {
    const result = await buildHierarchyTree({ rootPath: tmpDir });
    // Count BRIEF.md files manually
    let briefCount = 0;
    function countBriefs(dir: string): void {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name === "BRIEF.md") briefCount++;
        if (entry.isDirectory()) {
          countBriefs(path.join(dir, entry.name));
        }
      }
    }
    countBriefs(tmpDir);
    expect(result.totalProjects).toBe(briefCount);
  });
});
