import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import fc from "fast-check";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { _resetState as _resetExtensionState } from "../../src/extension/creation";
import { applyTypeGuide } from "../../src/type-intelligence/apply";
import {
  _resetState as _resetCreationState,
  createTypeGuide,
} from "../../src/type-intelligence/creation";
import {
  _resetState as _resetLoadingState,
  buildGuide,
  registerGuide,
} from "../../src/type-intelligence/loading";

let tmpDir: string;

// Clean disk-based type-guides before tests to avoid cross-file pollution
beforeAll(() => {
  const briefHome = process.env.BRIEF_HOME ?? path.join(os.homedir(), ".brief");
  const guidesDir = path.join(briefHome, "type-guides");
  try {
    fs.rmSync(guidesDir, { recursive: true, force: true });
  } catch {}
});

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "brief-apply-test-"));
  // Create a minimal BRIEF.md so addExtension can write to it
  fs.writeFileSync(path.join(tmpDir, "BRIEF.md"), "# BRIEF\n\n---\n\n");
});

afterEach(() => {
  _resetLoadingState();
  _resetCreationState();
  _resetExtensionState();
  vi.clearAllMocks();
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {}
});

// ---------------------------------------------------------------------------
// Helper: create a type guide with suggestedExtensions and suggestedOntologies
// ---------------------------------------------------------------------------

async function createTestGuide(opts?: {
  type?: string;
  suggestedExtensions?: string[];
  suggestedOntologies?: string[];
}) {
  const type = opts?.type ?? "test-apply-type";
  const suggestedExtensions = opts?.suggestedExtensions ?? [
    "sonic_arts",
    "lyrical_craft",
  ];
  const suggestedOntologies = opts?.suggestedOntologies ?? [
    "theme-pack",
    "music-theory",
  ];

  await createTypeGuide({
    type,
    suggestedExtensions,
    suggestedOntologies,
    body: `# ${type} Guide\n\nTest guide for apply tests.`,
    force: true,
  });
}

// ---------------------------------------------------------------------------
// Unit Tests
// ---------------------------------------------------------------------------

describe("WP4: Apply Type Guide", () => {
  describe("applying a known type", () => {
    it("returns applied: true with guide info for a known type", async () => {
      await createTestGuide();
      const result = await applyTypeGuide({
        type: "test-apply-type",
        projectPath: tmpDir,
      });

      expect(result.applied).toBe(true);
      expect(result.guideName).toBeDefined();
      expect(result.guideName.length).toBeGreaterThan(0);
      expect(result.guideSource).toBeDefined();
      expect(result.extensionsInstalled).toBeDefined();
      expect(Array.isArray(result.extensionsInstalled)).toBe(true);
    });

    it("installs suggested extensions from the type guide", async () => {
      await createTestGuide({ suggestedExtensions: ["sonic_arts"] });
      const result = await applyTypeGuide({
        type: "test-apply-type",
        projectPath: tmpDir,
      });

      expect(result.applied).toBe(true);
      expect(result.extensionsInstalled).toContain("sonic_arts");
      expect(result.extensionsFailed.length).toBe(0);
    });

    it("collects suggested ontologies with status 'suggested'", async () => {
      await createTestGuide({
        suggestedOntologies: ["theme-pack", "music-theory"],
      });
      const result = await applyTypeGuide({
        type: "test-apply-type",
        projectPath: tmpDir,
      });

      expect(result.applied).toBe(true);
      expect(result.ontologiesSuggested.length).toBe(2);
      for (const ont of result.ontologiesSuggested) {
        expect(ont.status).toBe("suggested");
        expect(["theme-pack", "music-theory"]).toContain(ont.name);
      }
    });

    it("includes nextSteps for ontology installation when ontologies are suggested", async () => {
      await createTestGuide({ suggestedOntologies: ["theme-pack"] });
      const result = await applyTypeGuide({
        type: "test-apply-type",
        projectPath: tmpDir,
      });

      expect(result.nextSteps.length).toBeGreaterThan(0);
      const ontStep = result.nextSteps.find((s) =>
        s.includes("brief_install_ontology"),
      );
      expect(ontStep).toBeDefined();
    });
  });

  describe("applying an unknown type (generic fallback)", () => {
    it("returns applied: false for an unknown type", async () => {
      const result = await applyTypeGuide({
        type: "xyznonexistenttype",
        projectPath: tmpDir,
      });

      expect(result.applied).toBe(false);
      expect(result.extensionsInstalled.length).toBe(0);
      expect(result.extensionsFailed.length).toBe(0);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.nextSteps.length).toBeGreaterThan(0);
      expect(result.nextSteps[0]).toMatch(/brief_create_type_guide/);
    });
  });

  describe("autoInstallExtensions: false", () => {
    it("skips extension installation when autoInstallExtensions is false", async () => {
      await createTestGuide({
        suggestedExtensions: ["sonic_arts", "lyrical_craft"],
      });
      const result = await applyTypeGuide({
        type: "test-apply-type",
        projectPath: tmpDir,
        autoInstallExtensions: false,
      });

      expect(result.applied).toBe(true);
      expect(result.extensionsInstalled.length).toBe(0);
      expect(result.extensionsFailed.length).toBe(0);
    });
  });

  describe("autoInstallOntologies: false", () => {
    it("skips ontology suggestions when autoInstallOntologies is false", async () => {
      await createTestGuide({
        suggestedOntologies: ["theme-pack", "music-theory"],
      });
      const result = await applyTypeGuide({
        type: "test-apply-type",
        projectPath: tmpDir,
        autoInstallOntologies: false,
      });

      expect(result.applied).toBe(true);
      expect(result.ontologiesSuggested.length).toBe(0);
    });
  });

  describe("extension failure handling (allSettled pattern)", () => {
    it("does not crash when an extension fails to install", async () => {
      // Register a guide directly in memory with one valid and one invalid
      // extension name. "BadName" (mixed case, no underscore) fails the
      // addExtension name-format validation, exercising the allSettled pattern.
      const guideContent = `---
type: fail-ext-type
source: ai_generated
version: "1.0"
suggested_extensions:
  - sonic_arts
  - BadName
---
# Fail Ext Guide

Test guide with a bad extension name.`;

      const guide = buildGuide(
        "fail-ext-type",
        guideContent,
        "<test>/fail-ext-type.md",
      );
      registerGuide(guide);

      const result = await applyTypeGuide({
        type: "fail-ext-type",
        projectPath: tmpDir,
      });

      // The operation itself should not throw — allSettled handles failures
      expect(result.applied).toBe(true);
      // sonic_arts should succeed
      expect(result.extensionsInstalled).toContain("sonic_arts");
      // BadName should fail (invalid name format)
      expect(result.extensionsFailed).toContain("BadName");
    });

    it("tracks failed extensions in extensionsFailed and provides retry guidance", async () => {
      // Register a guide with only invalid extension names (mixed case, no
      // underscores — neither heading format nor metadata format)
      const guideContent = `---
type: all-fail-type
source: ai_generated
version: "1.0"
suggested_extensions:
  - badName
  - alsobad
---
# All Fail Guide

Test guide where all extensions fail.`;

      const guide = buildGuide(
        "all-fail-type",
        guideContent,
        "<test>/all-fail-type.md",
      );
      registerGuide(guide);

      const result = await applyTypeGuide({
        type: "all-fail-type",
        projectPath: tmpDir,
      });

      expect(result.applied).toBe(true);
      expect(result.extensionsFailed.length).toBe(2);
      expect(result.extensionsInstalled.length).toBe(0);
      // Should include retry guidance in nextSteps
      const retryStep = result.nextSteps.find((s) =>
        s.includes("Retry failed extensions"),
      );
      expect(retryStep).toBeDefined();
      // Should include warning about failures
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe("type guide with no suggested extensions or ontologies", () => {
    it("returns applied: true with empty arrays when guide has no suggestions", async () => {
      // "album" fixture guide has no suggestedExtensions or suggestedOntologies
      const result = await applyTypeGuide({
        type: "album",
        projectPath: tmpDir,
      });

      expect(result.applied).toBe(true);
      expect(result.guideName).toBeDefined();
      expect(result.extensionsInstalled.length).toBe(0);
      expect(result.extensionsFailed.length).toBe(0);
      expect(result.ontologiesSuggested.length).toBe(0);
    });
  });

  // ── Property Tests ──────────────────────────────────────────────────────

  describe("Property Tests", () => {
    it("forAll(unknown type): applyTypeGuide always returns applied: false for random type names", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc
            .string({ minLength: 5, maxLength: 30 })
            .filter(
              (s) =>
                /^[a-z]+$/.test(s) &&
                !["album", "film", "song", "fiction", "game"].includes(s),
            ),
          async (type) => {
            const result = await applyTypeGuide({
              type,
              projectPath: tmpDir,
            });

            expect(result.applied).toBe(false);
            expect(result.extensionsInstalled.length).toBe(0);
            expect(result.extensionsFailed.length).toBe(0);
            expect(result.warnings.length).toBeGreaterThan(0);
          },
        ),
        { numRuns: 10 },
      );
    });

    it("forAll(known type): result always has valid structure with required fields", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom("album", "film", "song", "fiction", "game"),
          async (type) => {
            const result = await applyTypeGuide({
              type,
              projectPath: tmpDir,
            });

            expect(typeof result.applied).toBe("boolean");
            expect(typeof result.guideName).toBe("string");
            expect(typeof result.guideSource).toBe("string");
            expect(Array.isArray(result.extensionsInstalled)).toBe(true);
            expect(Array.isArray(result.extensionsFailed)).toBe(true);
            expect(Array.isArray(result.ontologiesSuggested)).toBe(true);
            expect(Array.isArray(result.warnings)).toBe(true);
            expect(Array.isArray(result.nextSteps)).toBe(true);
          },
        ),
        { numRuns: 5 },
      );
    });
  });
});
