import { tmpdir } from "node:os";
import { join } from "node:path";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  createProject,
  createSubProject,
  normalizeProjectType,
  slugifyProjectName,
} from "../../src/workspace/creation";

const TEST_ROOT = join(tmpdir(), "brief-creation-test");

// ---------------------------------------------------------------------------
// Unit Tests
// ---------------------------------------------------------------------------

describe("TASK-22: Workspace — Project Creation", () => {
  describe("name slugification [FS-03]", () => {
    it('create project "My Cool Song!" produces directory "my-cool-song" [FS-03]', () => {
      expect(slugifyProjectName("My Cool Song!")).toBe("my-cool-song");
    });

    it('name resulting in Windows reserved name (CON) prefixed with "project-" [FS-03]', () => {
      const result = slugifyProjectName("CON");
      expect(result).not.toBe("con");
      expect(result).toBe("project-con");
    });

    it("name resulting in empty slug: rejected with error [FS-03]", () => {
      expect(() => slugifyProjectName("!!!")).toThrow();
    });

    it("name longer than 64 chars after slugification: truncated to 64 [FS-03]", () => {
      const longName = "a".repeat(100);
      const result = slugifyProjectName(longName);
      expect(result.length).toBeLessThanOrEqual(64);
    });
  });

  describe("display name [FS-13]", () => {
    it("create with display_name: BRIEF.md has display_name in Project metadata [FS-13]", async () => {
      const result = await createProject({
        projectName: "test-proj",
        displayName: "My Beautiful Project",
        type: "song",
        whatThisIs: "A test project",
        workspaceRoot: TEST_ROOT,
      });
      expect(result.content).toContain("**Project:** My Beautiful Project");
    });

    it("create without display_name: project_name used as Project field [FS-13]", async () => {
      const result = await createProject({
        projectName: "test-proj",
        type: "song",
        whatThisIs: "A test project",
        workspaceRoot: TEST_ROOT,
      });
      expect(result.content).toContain("**Project:** test-proj");
    });
  });

  describe("type normalization [COMPAT-06]", () => {
    it('type "Music Video" normalized to "music-video" in metadata [COMPAT-06]', () => {
      expect(normalizeProjectType("Music Video")).toBe("music-video");
    });
  });

  describe("content parameters [FS-13]", () => {
    it("create with what_this_is content: What This Is section present [FS-13]", async () => {
      const result = await createProject({
        projectName: "test",
        type: "song",
        whatThisIs: "A song about testing",
        workspaceRoot: TEST_ROOT,
      });
      expect(result.content).toContain("## What This Is");
      expect(result.content).toContain("A song about testing");
    });

    it("create with all optional content params: all three core sections present [FS-13]", async () => {
      const result = await createProject({
        projectName: "test",
        type: "song",
        whatThisIs: "Identity",
        whatThisIsNot: "Constraints",
        whyThisExists: "Motivation",
        workspaceRoot: TEST_ROOT,
      });
      expect(result.content).toContain("## What This Is");
      expect(result.content).toContain("## What This Is NOT");
      expect(result.content).toContain("## Why This Exists");
    });
  });

  describe("existing directory handling [FS-10]", () => {
    it("directory exists with no BRIEF.md: created, response indicates initialized_existing [FS-10]", async () => {
      const result = await createProject({
        projectName: "existing-dir",
        type: "project",
        whatThisIs: "Test",
        workspaceRoot: TEST_ROOT,
        directoryExists: true,
        hasBrief: false,
      });
      expect(result.initializedExisting).toBe(true);
      // G-148: assert that result.briefMdPath ends with 'BRIEF.md'
      expect(result.briefMdPath).toBeDefined();
      expect(result.briefMdPath).toMatch(/BRIEF\.md$/);
    });

    it("directory exists with BRIEF.md: error indicating project already exists [FS-10]", async () => {
      await expect(
        createProject({
          projectName: "existing",
          type: "project",
          whatThisIs: "Test",
          workspaceRoot: TEST_ROOT,
          directoryExists: true,
          hasBrief: true,
        }),
      ).rejects.toThrow(/already exists/i);
    });
  });

  describe("recursive directory creation [FS-04]", () => {
    it("intermediate directories do not exist: created recursively [FS-04]", async () => {
      const result = await createProject({
        projectName: "deep-project",
        type: "song",
        whatThisIs: "Test",
        workspaceRoot: TEST_ROOT,
      });
      expect(result.success).toBe(true);
      // G-150: assert directoriesCreated is greater than 0
      expect(result.directoriesCreated).toBeGreaterThan(0);
      expect(result.path).toBeDefined();
    });
  });

  describe("sub-project creation [FS-14]", () => {
    it("sub-project with subdirectory parameter: created at parent/subdirectory/slug [FS-14]", async () => {
      const result = await createSubProject({
        name: "track-one",
        type: "song",
        whatThisIs: "First track",
        parentPath: join(TEST_ROOT, "album"),
        subdirectory: "songs",
      });
      expect(result.path).toContain("songs");
      expect(result.path).toContain("track-one");
    });

    it("sub-project without subdirectory: created at parent/slug [FS-14]", async () => {
      const result = await createSubProject({
        name: "track-one",
        type: "song",
        whatThisIs: "First track",
        parentPath: join(TEST_ROOT, "album"),
      });
      expect(result.path).not.toContain("songs");
    });

    it("createSubProject inherits type from parent when type omitted [FS-14, T22-03]", async () => {
      // Create parent project first so type can be inherited from disk
      await createProject({
        projectName: "album",
        type: "album",
        workspaceRoot: TEST_ROOT,
      });
      const result = await createSubProject({
        name: "track-two",
        whatThisIs: "Second track",
        parentPath: join(TEST_ROOT, "album"),
        inheritTypeFromParent: true,
      });
      expect(result.success).toBe(true);
      expect(result.type).toBeDefined();
      // Type should be inherited from parent project metadata
      expect(result.typeInherited).toBe(true);
    });
  });

  describe("parent_project parameter [FS-14, T22-01]", () => {
    it("createProject with parent_project: sub-project linked to parent in metadata [FS-14, T22-01]", async () => {
      const result = await createProject({
        projectName: "track-three",
        type: "song",
        whatThisIs: "A track",
        workspaceRoot: TEST_ROOT,
        parentProject: join(TEST_ROOT, "album"),
      });
      expect(result.success).toBe(true);
      expect(result.content).toMatch(/parent|sub-project/i);
      expect(result.parentLinked).toBe(true);
    });
  });

  describe("workspace_root default behavior [FS-03, T22-02]", () => {
    it("workspace_root omitted: uses configured default workspace root [FS-03, T22-02]", async () => {
      const result = await createProject({
        projectName: "auto-root-project",
        type: "project",
        whatThisIs: "Uses default workspace root",
      });
      expect(result.success).toBe(true);
      expect(result.workspaceRoot).toBeDefined();
      // Should have resolved to a configured or default workspace root
      expect(result.workspaceRootSource).toMatch(/config|default|env/i);
    });
  });

  describe("first-project flag [TUT-01]", () => {
    it("first project in workspace: response includes first_project flag [TUT-01]", async () => {
      const result = await createProject({
        projectName: "first",
        type: "project",
        whatThisIs: "The first",
        workspaceRoot: TEST_ROOT,
        isFirstProject: true,
      });
      expect(result.firstProject).toBe(true);
      // G-151: assert tutorial-related fields are set when isFirstProject is true
      expect(result.suggestExtensions).toBeDefined();
    });

    it("subsequent project: no first_project flag [TUT-01]", async () => {
      const result = await createProject({
        projectName: "second",
        type: "project",
        whatThisIs: "Another",
        workspaceRoot: TEST_ROOT,
        isFirstProject: false,
      });
      // G-152: assert tutorial fields NOT set when isFirstProject is false
      expect(result.firstProject).toBeFalsy();
      expect(result.tutorialOffer).toBeFalsy();
    });
  });

  describe("type as required field [COMPAT-04]", () => {
    it("type omitted: file created but noted as technically invalid [COMPAT-04]", async () => {
      const result = await createProject({
        projectName: "no-type",
        type: undefined as any,
        whatThisIs: "Missing type",
        workspaceRoot: TEST_ROOT,
      });
      expect(
        result.warnings.some((w: string) => /type.*required/i.test(w)),
      ).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe("TASK-22: Property Tests", () => {
  it("forAll(project name): slugified result contains only [a-z0-9-] characters [FS-03]", () => {
    fc.assert(
      fc.property(
        fc
          .string({ minLength: 1, maxLength: 100 })
          .filter((s) => /[a-zA-Z0-9]/.test(s)),
        (name) => {
          try {
            const result = slugifyProjectName(name);
            expect(result).toMatch(/^[a-z0-9][a-z0-9-]*$/);
          } catch (e: any) {
            expect.fail(`slugify threw on valid input: ${e.message}`);
          }
        },
      ),
    );
  });

  it("forAll(project name): slugified result has no leading/trailing/consecutive hyphens [FS-03]", () => {
    fc.assert(
      fc.property(
        fc
          .string({ minLength: 1, maxLength: 50 })
          .filter((s) => /[a-zA-Z0-9]/.test(s)),
        (name) => {
          const result = slugifyProjectName(name);
          expect(result).not.toMatch(/^-/);
          // G-153: add test for trailing hyphen removal
          expect(result).not.toMatch(/-$/);
          expect(result).toMatch(/[^-]$/);
          expect(result).not.toMatch(/--/);
        },
      ),
    );
  });

  it("forAll(type string): normalized result is lowercase with hyphens only [COMPAT-06]", () => {
    fc.assert(
      fc.property(
        fc
          .string({ minLength: 1, maxLength: 30 })
          .filter((s) => /^[a-zA-Z ]+$/.test(s)),
        (type) => {
          const result = normalizeProjectType(type);
          expect(result).toMatch(/^[a-z0-9-]+$/);
        },
      ),
    );
  });

  it("forAll(create operation): BRIEF.md always has Project, Type, Created metadata fields [FS-13]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .string({ minLength: 1, maxLength: 30 })
          .filter((s) => /^[a-zA-Z0-9 ]+$/.test(s)),
        fc
          .string({ minLength: 1, maxLength: 20 })
          .filter((s) => /^[a-zA-Z]+$/.test(s)),
        async (name, type) => {
          const result = await createProject({
            projectName: name,
            type,
            whatThisIs: "Test",
            workspaceRoot: TEST_ROOT,
          });
          expect(result.content).toContain("**Project:**");
          expect(result.content).toContain("**Type:**");
          expect(result.content).toContain("**Created:**");
          // G-154: assert that Status field is present in the metadata
          expect(result.content).toContain("**Status:**");
        },
      ),
      { numRuns: 10 },
    );
  });
});
