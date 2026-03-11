import fc from "fast-check";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  _resetState,
  createTypeGuide,
  generateTypeGuideTemplate,
} from "../../src/type-intelligence/creation";
import { _resetState as _resetLoadingState } from "../../src/type-intelligence/loading";

// ---------------------------------------------------------------------------
// Unit Tests
// ---------------------------------------------------------------------------

describe("TASK-41: Type Intelligence — Type Guide Creation", () => {
  afterEach(() => {
    _resetState();
    _resetLoadingState();
    vi.clearAllMocks();
  });
  describe("basic creation [COMPAT-10]", () => {
    it("create guide with all fields: file written with correct YAML frontmatter and markdown body [COMPAT-10]", async () => {
      const result = await createTypeGuide({
        type: "new-type",
        typeAliases: ["alias-a"],
        suggestedExtensions: ["sonic_arts"],
        suggestedOntologies: ["theme-pack"],
        commonParentTypes: ["creative"],
        commonChildTypes: ["sub-type"],
        body: "# Guide content\n\nSome guidance here.",
      });
      expect(result.created).toBe(true);
      expect(result.filePath).toContain("new-type.md");
      expect(result.frontmatter).toBeDefined();
      // G-314: use correct frontmatter field names per spec (type, type_aliases, source)
      expect(result.frontmatter).toMatch(/type:|type_aliases:|source:/);
      // T41-01: version: 1.0 must be present in auto-generated frontmatter
      expect(result.frontmatter).toMatch(/version:\s*1\.0/);
      // T41-02: common_parent_types and common_child_types must appear in output
      expect(result.frontmatter).toMatch(/common_parent_types:/);
      expect(result.frontmatter).toMatch(/common_child_types:/);
    });

    it("source field: always set to ai_generated automatically [COMPAT-10]", async () => {
      const result = await createTypeGuide({
        type: "auto-source",
        body: "# Guide",
      });
      expect(result.source).toBe("ai_generated");
    });
  });

  describe("alias uniqueness [COMPAT-09]", () => {
    it("alias uniqueness with no collisions: guide created successfully [COMPAT-09]", async () => {
      const result = await createTypeGuide({
        type: "unique-type",
        typeAliases: ["unique-alias-xyz"],
        body: "# Guide",
      });
      expect(result.created).toBe(true);
    });

    it("alias collision with lower-precedence guide: warning returned, newer guide takes precedence [COMPAT-09]", async () => {
      const result = await createTypeGuide({
        type: "higher-prec",
        typeAliases: ["colliding-alias"],
        body: "# Guide",
      });
      expect(result.aliasWarning).toBeDefined();
      expect(result.aliasWarning).toMatch(/conflict|collision/i);
      expect(result.created).toBe(true);
    });

    it("alias collision with higher-precedence guide: operation fails with descriptive error [COMPAT-09]", async () => {
      await expect(
        createTypeGuide({
          type: "lower-prec",
          typeAliases: ["user-owned-alias"],
          body: "# Guide",
        }),
      ).rejects.toThrow(/alias|conflict|collision/i);
    });
  });

  describe("existing guide handling [COMPAT-14]", () => {
    it("existing guide for same type, no force: existing_guide: true returned, no overwrite [COMPAT-14]", async () => {
      const result = await createTypeGuide({
        type: "existing-type",
        body: "# New guide",
      });
      expect(result.existingGuide).toBe(true);
      expect(result.overwritten).toBe(false);
    });

    it("existing guide for same type, force: true: original backed up as .bak, new guide written [COMPAT-14]", async () => {
      const result = await createTypeGuide({
        type: "existing-type",
        body: "# Updated guide",
        force: true,
      });
      expect(result.created).toBe(true);
      expect(result.backedUp).toBe(true);
    });
  });

  describe("path validation [SEC-13]", () => {
    it("guide file path: always within ~/.brief/type-guides/ directory [SEC-13]", async () => {
      const result = await createTypeGuide({
        type: "safe-type",
        body: "# Guide",
      });
      // G-315: use stricter regex matching full path pattern
      expect(result.filePath).toMatch(/\/\.brief\/type-guides\/[^/]+\.md$/);
    });

    it("guide exceeding 100 KB: rejected [SEC-13]", async () => {
      await expect(
        createTypeGuide({
          type: "big-type",
          body: "x".repeat(100 * 1024 + 1),
        }),
      ).rejects.toThrow(/size|limit/i);
    });

    it("guide at exactly 100 KB → accepted (boundary condition) [SEC-13]", async () => {
      const exactlyLimit = "a".repeat(100 * 1024);
      const result = await createTypeGuide({
        type: "test-boundary",
        body: exactlyLimit,
      });
      expect(result.created).toBe(true);
    });
  });

  describe("guide update safety [COMPAT-14, T41-03]", () => {
    it("user-created guide: never overwritten by server updates [COMPAT-14, T41-03]", async () => {
      const result = await createTypeGuide({
        type: "user-guide",
        body: "# User Guide",
        source: "user_edited",
        simulateServerUpdate: true,
      } as any);
      // Server updates must not overwrite user-edited guides
      expect(result.protectedFromUpdate).toBe(true);
      expect(result.serverUpdateBlocked).toBe(true);
    });

    it("bundled guide update allowed when source is bundled [COMPAT-14, T41-03]", async () => {
      const result = await createTypeGuide({
        type: "bundled-guide",
        body: "# Bundled Guide",
        source: "bundled",
        simulateServerUpdate: true,
        force: true,
      } as any);
      expect(result.created).toBe(true);
    });
  });

  describe("project metadata [COMPAT-10]", () => {
    it("response includes created_by_project when active project exists: project name included [COMPAT-10]", async () => {
      const result = await createTypeGuide({
        type: "test-type",
        body: "# Test Guide",
        activeProject: "my-project",
      });
      expect(result.created).toBe(true);
      expect(result.createdByProject).toBeDefined();
      // G-322: assert createdByProject is a non-empty string
      expect(typeof result.createdByProject).toBe("string");
      expect((result.createdByProject as string).length).toBeGreaterThan(0);
    });

    it("no active project: guide still created, created_by_project omitted [COMPAT-10]", async () => {
      const result = await createTypeGuide({
        type: "no-proj-type",
        body: "# Guide",
        noActiveProject: true,
      });
      expect(result.created).toBe(true);
      expect(result.createdByProject).toBeUndefined();
    });
  });
});

describe("referenceSources in frontmatter", () => {
  afterEach(() => {
    _resetState();
    _resetLoadingState();
    vi.clearAllMocks();
  });

  it("referenceSources appears as reference_sources in generated frontmatter", async () => {
    const result = await createTypeGuide({
      type: "ref-test-type",
      referenceSources: ["IMDB for films", "Letterboxd"],
      body: "# Guide\n\nSome content here.",
    });
    expect(result.created).toBe(true);
    expect(result.frontmatter).toMatch(/reference_sources:/);
    expect(result.frontmatter).toMatch(/IMDB for films/);
    expect(result.frontmatter).toMatch(/Letterboxd/);
  });

  it("empty referenceSources omitted from frontmatter", async () => {
    const result = await createTypeGuide({
      type: "no-ref-type",
      referenceSources: [],
      body: "# Guide\n\nSome content here.",
    });
    expect(result.created).toBe(true);
    expect(result.frontmatter).not.toMatch(/reference_sources:/);
  });
});

describe("enriched template", () => {
  it("template includes Reference Sources section", () => {
    const template = generateTypeGuideTemplate({ type: "film" });
    expect(template).toContain("## Reference Sources");
    expect(template).toContain("databases, catalogues");
  });

  it("template includes structured prompts for Key Dimensions", () => {
    const template = generateTypeGuideTemplate({ type: "album" });
    expect(template).toContain("List 4-6 dimensions");
  });

  it("template includes structured prompts for Known Tensions", () => {
    const template = generateTypeGuideTemplate({ type: "album" });
    expect(template).toContain("**X vs Y**");
  });
});

describe("YAML security hardening during guide creation [SEC-09]", () => {
  it("guide body containing __proto__ in YAML → prototype pollution prevented on read-back [SEC-09]", async () => {
    const result = await createTypeGuide({
      type: "test-security",
      body: "# Test\n\nSome content.",
      frontmatter: {
        __proto__: { admin: true },
        type: "test-security",
        source: "ai_generated",
      },
    });
    // G-316: assert created === false explicitly (not ambiguous || check)
    expect(result.created).toBe(false);
    expect(({} as any).admin).toBeUndefined();
  });

  it("guide with embedded script content → content stored but not executed [SEC-09]", async () => {
    const result = await createTypeGuide({
      type: "test-safety",
      body: '# Test\n\n<script>alert("xss")</script>\n\nSome valid content.',
    });
    // Should succeed in storing the file
    expect(result.created).toBe(true);
    // G-317: assert both flags explicitly
    expect(result.scriptExecuted).toBe(false);
    expect(result.sanitized).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe("TASK-41: Property Tests", () => {
  // G-318: make async and await fc.assert
  it("forAll(created guide): source is always ai_generated [COMPAT-10]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .string({ minLength: 2, maxLength: 20 })
          .filter((s) => /^[a-z-]+$/.test(s)),
        async (type) => {
          // Reset state between property runs to avoid cross-run contamination
          _resetState();
          _resetLoadingState();
          const result = await createTypeGuide({
            type,
            body: `# Guide for ${type}`,
          });
          expect(result.created).toBe(true);
          expect(result.source).toBe("ai_generated");
        },
      ),
      { numRuns: 5 },
    );
  });

  // G-319: make async and await fc.assert
  it("forAll(alias set): uniqueness validated against all installed guides before write [COMPAT-09]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc
            .string({ minLength: 2, maxLength: 15 })
            .filter((s) => /^[a-z-]+$/.test(s)),
          { minLength: 1, maxLength: 3 },
        ),
        async (aliases) => {
          // Reset state between property runs to avoid cross-run contamination
          _resetState();
          _resetLoadingState();
          try {
            const result = await createTypeGuide({
              type: `alias-test-${aliases[0]}`,
              typeAliases: aliases,
              body: "# Guide",
            });
            expect(result.aliases).toBeDefined();
            expect(new Set(result.aliases as any).size).toBe(
              (result.aliases as any).length,
            );
          } catch (e: any) {
            // Collision errors are expected for conflicting aliases
            expect(e.message).toMatch(/alias|conflict|collision/i);
          }
        },
      ),
      { numRuns: 5 },
    );
  });

  // G-320: use fc.constantFrom with known existing fixture types
  it("forAll(existing guide, force=false): never overwritten [COMPAT-14]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom("album", "fiction", "film", "existing-type"),
        async (type) => {
          const result = await createTypeGuide({ type, body: "# New" });
          expect(result.existingGuide).toBe(true);
          expect(result.overwritten).toBe(false);
        },
      ),
      { numRuns: 3 },
    );
  });

  // G-321: make async and await fc.assert; fix extension to .md per spec
  it("forAll(guide path): always within ~/.brief/type-guides/ directory [SEC-13]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .string({ minLength: 2, maxLength: 20 })
          .filter((s) => /^[a-z-]+$/.test(s)),
        async (type) => {
          // Reset state between property runs to avoid cross-run contamination
          _resetState();
          _resetLoadingState();
          const result = await createTypeGuide({ type, body: "# Guide" });
          expect(result.filePath).toBeDefined();
          expect(result.filePath).toMatch(/type-guides/);
          // G-321: spec says .md files, not .yaml
          expect(result.filePath).toMatch(/\.md$/);
        },
      ),
      { numRuns: 5 },
    );
  });

  it("forAll(invalid input): oversized body always rejected [SEC-13]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .string({ minLength: 2, maxLength: 20 })
          .filter((s) => /^[a-z-]+$/.test(s)),
        async (type) => {
          const oversized = "x".repeat(100 * 1024 + 1);
          await expect(
            createTypeGuide({ type, body: oversized }),
          ).rejects.toThrow(/size|limit/i);
        },
      ),
      { numRuns: 5 },
    );
  });

  it("forAll(created guide): structural invariant — result shape always valid", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .string({ minLength: 2, maxLength: 20 })
          .filter((s) => /^[a-z-]+$/.test(s)),
        async (type) => {
          const result = await createTypeGuide({ type, body: "# Guide" });
          expect(Object.keys(result)).toEqual(
            expect.arrayContaining(["created", "filePath", "source"]),
          );
        },
      ),
      { numRuns: 5 },
    );
  });
});
