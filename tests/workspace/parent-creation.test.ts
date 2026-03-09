// tests/workspace/parent-creation.test.ts — WP1: Create parent project tests

import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createParentProject } from "../../src/workspace/parent-creation.js";

describe("WP1: createParentProject", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "brief-wp1-"));
  });

  afterEach(async () => {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  });
  it("creates a parent BRIEF.md in an ancestor directory", async () => {
    // Set up child project
    const childDir = path.join(tmpDir, "parent-area", "child-project");
    await fsp.mkdir(childDir, { recursive: true });
    await fsp.writeFile(
      path.join(childDir, "BRIEF.md"),
      "**Project:** Child\n**Type:** song\n",
    );

    const parentDir = path.join(tmpDir, "parent-area");

    const result = await createParentProject({
      childPath: childDir,
      parentDirectory: parentDir,
      projectName: "My Album",
      type: "album",
      whatThisIs: "A concept album about space.",
      whatThisIsNot: "Not a compilation.",
      whyThisExists: "To explore cosmic themes in music.",
    });

    expect(result.success).toBe(true);
    expect(result.childLinked).toBe(true);
    expect(result.parentPath).toBe(path.resolve(parentDir));

    // Verify file was written
    const content = await fsp.readFile(result.briefMdPath, "utf-8");
    expect(content).toContain("**Project:** My Album");
    expect(content).toContain("**Type:** album");
    expect(content).toContain("## What This Is");
    expect(content).toContain("A concept album about space.");
    expect(content).toContain("## What This Is NOT");
    expect(content).toContain("## Why This Exists");
  });

  it("rejects when parentDirectory is not an ancestor of childPath", async () => {
    const childDir = path.join(tmpDir, "area-a", "child");
    const parentDir = path.join(tmpDir, "area-b");
    await fsp.mkdir(childDir, { recursive: true });
    await fsp.mkdir(parentDir, { recursive: true });

    await expect(
      createParentProject({
        childPath: childDir,
        parentDirectory: parentDir,
        projectName: "Bad Parent",
        type: "album",
      }),
    ).rejects.toThrow(/ancestor/i);
  });

  it("rejects when parentDirectory equals childPath", async () => {
    const dir = path.join(tmpDir, "same-dir");
    await fsp.mkdir(dir, { recursive: true });

    await expect(
      createParentProject({
        childPath: dir,
        parentDirectory: dir,
        projectName: "Self Parent",
        type: "album",
      }),
    ).rejects.toThrow(/ancestor/i);
  });

  it("rejects when BRIEF.md already exists at parentDirectory", async () => {
    const parentDir = path.join(tmpDir, "existing-parent");
    const childDir = path.join(parentDir, "child");
    await fsp.mkdir(childDir, { recursive: true });
    await fsp.writeFile(
      path.join(parentDir, "BRIEF.md"),
      "**Project:** Existing\n",
    );

    await expect(
      createParentProject({
        childPath: childDir,
        parentDirectory: parentDir,
        projectName: "Duplicate",
        type: "album",
      }),
    ).rejects.toThrow(/already exists/i);
  });

  it("generates correct metadata fields", async () => {
    const parentDir = path.join(tmpDir, "meta-parent");
    const childDir = path.join(parentDir, "child");
    await fsp.mkdir(childDir, { recursive: true });

    const result = await createParentProject({
      childPath: childDir,
      parentDirectory: parentDir,
      projectName: "Test Project",
      type: "Product_Line",
    });

    expect(result.content).toContain("**Type:** product-line");
    expect(result.content).toContain("**Status:** concept");
    expect(result.content).toMatch(/\*\*Created:\*\* \d{4}-\d{2}-\d{2}/);
  });

  it("uses displayName when provided", async () => {
    const parentDir = path.join(tmpDir, "display-parent");
    const childDir = path.join(parentDir, "child");
    await fsp.mkdir(childDir, { recursive: true });

    const result = await createParentProject({
      childPath: childDir,
      parentDirectory: parentDir,
      projectName: "test-slug",
      displayName: "My Beautiful Project",
      type: "album",
    });

    expect(result.content).toContain("**Project:** My Beautiful Project");
  });

  it("works with deeply nested child paths", async () => {
    const parentDir = path.join(tmpDir, "deep-parent");
    const childDir = path.join(parentDir, "a", "b", "c", "child");
    await fsp.mkdir(childDir, { recursive: true });

    const result = await createParentProject({
      childPath: childDir,
      parentDirectory: parentDir,
      projectName: "Deep Parent",
      type: "collection",
    });

    expect(result.success).toBe(true);
    expect(result.childLinked).toBe(true);
  });

  it("creates parent directory if it does not exist", async () => {
    const parentDir = path.join(tmpDir, "new-parent-dir");
    const childDir = path.join(parentDir, "child");
    // Only create child dir — parent dir structure will be created
    await fsp.mkdir(childDir, { recursive: true });

    const result = await createParentProject({
      childPath: childDir,
      parentDirectory: parentDir,
      projectName: "Auto Dir",
      type: "album",
    });

    expect(result.success).toBe(true);
    const stat = await fsp.stat(result.briefMdPath);
    expect(stat.isFile()).toBe(true);
  });

  // ── Property Tests ──────────────────────────────────────────────────────

  describe("Property Tests", () => {
    it("forAll(project name): createParentProject never throws for valid names and always writes a BRIEF.md", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc
            .string({ minLength: 1, maxLength: 40 })
            .filter((s) => /^[a-zA-Z0-9 ]+$/.test(s) && s.trim().length > 0),
          async (projectName) => {
            const parentDir = path.join(
              tmpDir,
              `prop-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            );
            const childDir = path.join(parentDir, "child");
            await fsp.mkdir(childDir, { recursive: true });

            const result = await createParentProject({
              childPath: childDir,
              parentDirectory: parentDir,
              projectName,
              type: "album",
            });

            expect(result.success).toBe(true);
            expect(result.content).toContain("**Project:**");
            expect(result.content).toContain("**Type:** album");
            expect(result.content).toContain("**Status:** concept");
            const stat = await fsp.stat(result.briefMdPath);
            expect(stat.isFile()).toBe(true);
          },
        ),
        { numRuns: 10 },
      );
    });

    it("forAll(type string): type is always normalized to lowercase-hyphenated in output", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc
            .string({ minLength: 1, maxLength: 30 })
            .filter((s) => /^[a-zA-Z0-9_ ]+$/.test(s) && s.trim().length > 0),
          async (type) => {
            const parentDir = path.join(
              tmpDir,
              `type-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            );
            const childDir = path.join(parentDir, "child");
            await fsp.mkdir(childDir, { recursive: true });

            const result = await createParentProject({
              childPath: childDir,
              parentDirectory: parentDir,
              projectName: "Test",
              type,
            });

            // Type in content should be lowercase and use hyphens
            const typeMatch = result.content.match(/\*\*Type:\*\* (.+)/);
            expect(typeMatch).toBeDefined();
            const normalizedType = typeMatch![1];
            expect(normalizedType).toBe(normalizedType.toLowerCase());
            expect(normalizedType).not.toContain("_");
          },
        ),
        { numRuns: 10 },
      );
    });

    it("forAll(non-ancestor pairs): always rejects with ancestor error", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom("sibling", "cousin", "uncle"),
          async (relation) => {
            const areaA = path.join(tmpDir, `a-${relation}-${Date.now()}`);
            const areaB = path.join(tmpDir, `b-${relation}-${Date.now()}`);
            await fsp.mkdir(path.join(areaA, "child"), { recursive: true });
            await fsp.mkdir(areaB, { recursive: true });

            await expect(
              createParentProject({
                childPath: path.join(areaA, "child"),
                parentDirectory: areaB,
                projectName: "Bad",
                type: "test",
              }),
            ).rejects.toThrow(/ancestor/i);
          },
        ),
        { numRuns: 5 },
      );
    });
  });
});
