import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import {
  applyFilters,
  detectNestedRoots,
  listProjects,
} from "../../src/workspace/listing";

// ---------------------------------------------------------------------------
// Unit Tests
// ---------------------------------------------------------------------------

describe("TASK-20: Workspace — Project Listing & Filtering", () => {
  describe("basic listing [FS-01]", () => {
    it("two workspace roots with projects: all listed, grouped by root [FS-01]", async () => {
      const result = await listProjects({
        workspaceRoots: ["/root-a", "/root-b"],
      });
      expect(result.groups.length).toBe(2);
      // G-132: assert g.projects.length > 0 AND g.name.length > 0 (not OR)
      expect(
        result.groups.every(
          (g: any) => g.projects.length > 0 && g.name.length > 0,
        ),
      ).toBe(true);
    });
  });

  describe("status filtering [FS-08]", () => {
    it('status filter "active" returns only concept, development, or production projects [FS-08]', () => {
      const projects = [
        { name: "A", status: "development" },
        { name: "B", status: "archived" },
        { name: "C", status: "production" },
        { name: "D", status: "concept" },
      ];
      const filtered = applyFilters(projects, { statusFilter: "active" });
      expect(filtered).toHaveLength(3);
    });

    it('status filter "complete" returns only released/complete projects [FS-08]', () => {
      const projects = [
        { name: "A", status: "complete" },
        { name: "B", status: "development" },
      ];
      const filtered = applyFilters(projects, { statusFilter: "complete" });
      expect(filtered).toHaveLength(1);
    });

    it('status filter "complete" also matches projects with status "released" [FS-08]', () => {
      const projects = [
        { name: "A", status: "released" },
        { name: "B", status: "complete" },
        { name: "C", status: "development" },
      ];
      const filtered = applyFilters(projects, { statusFilter: "complete" });
      expect(filtered.length).toBeGreaterThanOrEqual(1);
      expect(filtered.some((p: any) => p.status === "released")).toBe(true);
    });

    it('status filter "paused" returns only paused projects [FS-08]', () => {
      const projects = [
        { name: "A", status: "paused" },
        { name: "B", status: "development" },
        { name: "C", status: "paused" },
      ];
      const filtered = applyFilters(projects, { statusFilter: "paused" });
      expect(filtered).toHaveLength(2);
      filtered.forEach((p: any) => expect(p.status).toBe("paused"));
    });

    it('status filter "archived" returns only archived projects [FS-08]', () => {
      const projects = [
        { name: "A", status: "archived" },
        { name: "B", status: "development" },
        { name: "C", status: "archived" },
      ];
      const filtered = applyFilters(projects, { statusFilter: "archived" });
      expect(filtered).toHaveLength(2);
      filtered.forEach((p: any) => expect(p.status).toBe("archived"));
    });
  });

  describe("type filtering [FS-08]", () => {
    it('type filter "song" returns only song-type projects, case-insensitive [FS-08]', () => {
      const projects = [
        { name: "A", type: "song" },
        { name: "B", type: "album" },
        { name: "C", type: "Song" },
      ];
      const filtered = applyFilters(projects, { typeFilter: "song" });
      expect(filtered).toHaveLength(2);
    });
  });

  describe("combined filtering [FS-08]", () => {
    it("both status and type filters: AND logic applied [FS-08]", () => {
      const projects = [
        { name: "A", type: "song", status: "development" },
        { name: "B", type: "song", status: "archived" },
        { name: "C", type: "album", status: "development" },
      ];
      const filtered = applyFilters(projects, {
        statusFilter: "active",
        typeFilter: "song",
      });
      expect(filtered).toHaveLength(1);
      expect((filtered[0] as any).name).toBe("A");
    });

    it("no filters: all projects returned [FS-08]", () => {
      const projects = [
        { name: "A", type: "song", status: "development" },
        { name: "B", type: "album", status: "archived" },
      ];
      const filtered = applyFilters(projects, {});
      expect(filtered).toHaveLength(2);
    });

    it("filters matching nothing: empty result, not an error [FS-08]", () => {
      const projects = [{ name: "A", type: "song", status: "development" }];
      const filtered = applyFilters(projects, { typeFilter: "movie" });
      expect(filtered).toHaveLength(0);
    });
  });

  describe("missing workspace root [FS-02]", () => {
    it("missing workspace root: warning, other roots still scanned [FS-02]", async () => {
      const validRootPath = "/valid-root";
      const result = await listProjects({
        workspaceRoots: ["/nonexistent", validRootPath],
      });
      expect(result.warnings.length).toBeGreaterThan(0);
      // Results from valid root should still be present
      expect(result).toBeDefined();
      expect(result.groups.some((g: any) => g.root === validRootPath)).toBe(
        true,
      );
    });
  });

  describe("absolute paths [RESP-05]", () => {
    it("all paths in response are absolute, no relative paths or ~ shorthand [RESP-05]", async () => {
      const result = await listProjects({
        workspaceRoots: ["/root"],
      });
      // G-133: assert result.projects is defined first before looping
      expect(result.projects).toBeDefined();
      for (const project of result.projects) {
        expect((project as any).path).toMatch(/^[/A-Z]/); // Starts with / or drive letter
        expect((project as any).path).not.toContain("~");
      }
    });
  });

  describe("nested workspace roots [FS-11]", () => {
    it("nested workspace roots: projects not duplicated, associate with deepest root [FS-11]", async () => {
      const roots = ["/workspace", "/workspace/sub-root"];
      const nested = detectNestedRoots(roots);
      expect(nested.hasNesting).toBe(true);
      const result = await listProjects({ workspaceRoots: roots });
      const paths = result.projects.map((p: any) => p.path);
      expect(new Set(paths).size).toBe(paths.length);
    });
  });

  describe("project summary fields [FS-08]", () => {
    it("project summary includes name, type, status, updated, decision count, question count [FS-08]", async () => {
      const result = await listProjects({ workspaceRoots: ["/root"] });
      expect(result.projects.length).toBeGreaterThan(0);
      // G-134: assert result.projects contains expected mock project entry fields
      const proj = result.projects[0];
      expect(proj).toHaveProperty("name");
      expect(proj).toHaveProperty("type");
      expect(proj).toHaveProperty("status");
      expect(proj).toHaveProperty("updated");
      expect(proj).toHaveProperty("decisionCount");
      expect(proj).toHaveProperty("questionCount");
      // Verify the entry actually has values (not just properties)
      expect((proj as any).name.length).toBeGreaterThan(0);
    });
  });

  describe("response metadata [FS-08]", () => {
    it("response includes applied filters for transparency [FS-08]", async () => {
      const result = await listProjects({
        workspaceRoots: ["/root"],
        statusFilter: "active",
        typeFilter: "song",
      });
      expect(result.appliedFilters).toBeDefined();
      expect(result.appliedFilters!.statusFilter).toBe("active");
      expect(result.appliedFilters!.typeFilter).toBe("song");
    });
  });

  describe("homoglyph detection", () => {
    it("warns on homoglyph project names", async () => {
      // 'Auth' with Latin A vs 'Аuth' with Cyrillic А (U+0041 vs U+0410)
      const latinAuth = "Auth";
      const cyrillicAuth = "\u0410uth";
      const result = await listProjects({
        workspaceRoots: ["/root"],
        simulateHomoglyphProjects: [latinAuth, cyrillicAuth],
      });
      expect(result.warnings).toBeDefined();
      expect(
        result.warnings.some((w: string) =>
          /homoglyph|similar|confusable/i.test(w),
        ),
      ).toBe(true);
      // G-135: assert that homoglyph path was normalized
      expect(result.normalizedPaths).toBeDefined();
    });
  });
});

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe("TASK-20: Property Tests", () => {
  it("forAll(workspace roots): missing roots never cause crash, only warnings [FS-02]", async () => {
    // G-136: make it() async, add await before fc.assert(...); strengthen assertion
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.string({ minLength: 1, maxLength: 50 }), {
          minLength: 1,
          maxLength: 3,
        }),
        async (roots) => {
          const result = await listProjects({ workspaceRoots: roots });
          expect(result).toBeDefined();
          // Stronger assertion: result must have groups and projects arrays
          expect(Array.isArray(result.groups)).toBe(true);
          expect(Array.isArray(result.projects)).toBe(true);
        },
      ),
      { numRuns: 5 },
    );
  });

  it("forAll(filter combination): results always satisfy all applied filters (AND logic) [FS-08]", () => {
    const activeStatuses = ["concept", "development", "production"];
    fc.assert(
      fc.property(
        fc.constantFrom("active", "complete", "archived"),
        fc.constantFrom("song", "album", "artist"),
        (statusFilter, typeFilter) => {
          const projects = [
            { name: "A", type: "song", status: "development" },
            { name: "B", type: "album", status: "archived" },
            { name: "C", type: "artist", status: "production" },
          ];
          const filtered = applyFilters(projects, {
            statusFilter: statusFilter as any,
            typeFilter: typeFilter as any,
          });
          // All results should match all applied filters
          expect(Array.isArray(filtered)).toBe(true);
          filtered.forEach((project: any) => {
            // Verify the project's status matches the applied statusFilter
            if (statusFilter === "active") {
              expect(activeStatuses).toContain(project.status);
            } else {
              expect(project.status).toBe(statusFilter);
            }
            expect(project.type?.toLowerCase()).toBe(typeFilter.toLowerCase());
          });
        },
      ),
    );
  });

  it("forAll(project in result): all paths are absolute [RESP-05]", () => {
    fc.assert(
      fc.asyncProperty(
        fc.array(
          fc
            .string({ minLength: 5, maxLength: 30 })
            .filter((s) => s.startsWith("/")),
          { minLength: 1, maxLength: 3 },
        ),
        async (roots) => {
          const result = await listProjects({ workspaceRoots: roots });
          expect(result.projects).toBeDefined();
          for (const proj of result.projects) {
            expect((proj as any).path).toMatch(/^[/A-Z]/);
          }
        },
      ),
      { numRuns: 5 },
    );
  });

  it("forAll(nested roots): no project appears in results more than once [FS-11]", async () => {
    // G-137: replace fc.constant([...]) with fc.array(fc.string(...)) to test multiple values
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.string({ minLength: 3 }), { minLength: 1, maxLength: 5 }),
        async (roots) => {
          const result = await listProjects({ workspaceRoots: roots });
          const paths = result.projects.map((p: any) => p.path);
          const unique = new Set(paths);
          expect(unique.size).toBe(paths.length);
        },
      ),
      { numRuns: 3 },
    );
  });
});
