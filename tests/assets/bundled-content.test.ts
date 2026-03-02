import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  getExtensionDefinitions,
  installBundledContent,
  loadGenericGuide,
  verifyGenericGuide,
} from "../../src/assets/bundled-content";

// ---------------------------------------------------------------------------
// Unit Tests
// ---------------------------------------------------------------------------

describe("TASK-53: Cross-Cutting — Bundled Content", () => {
  describe("generic guide file [COMPAT-08]", () => {
    it("generic guide file exists in assets/: valid YAML frontmatter with bootstrapping: true [COMPAT-08]", () => {
      const guide = loadGenericGuide();
      expect(guide.frontmatter.bootstrapping).toBe(true);
    });

    it("generic guide YAML: includes type, source: bundled, version fields [COMPAT-08]", () => {
      const guide = loadGenericGuide();
      expect(guide.frontmatter.type).toBe("_generic");
      expect(guide.frontmatter.source).toBe("bundled");
      expect(guide.frontmatter.version).toBeDefined();
    });

    it("generic guide markdown body: includes 10 Universal Project Dimensions [COMPAT-08]", () => {
      const guide = loadGenericGuide();
      expect(guide.body).toBeDefined();
      expect(guide.body.length).toBeGreaterThan(100);
      // Verify dimensional content is present (at least some dimension-like headings)
      expect(guide.body).toMatch(
        /purpose|audience|tone|structure|scope|identity|vision|direction|constraints|timeline/i,
      );
    });
  });

  describe("build step [COMPAT-08]", () => {
    it("build step: assets/ directory exists and contains required files [COMPAT-08]", () => {
      const fs = require("node:fs");
      const path = require("node:path");
      const assetsDir = path.resolve(__dirname, "../../assets");
      expect(fs.existsSync(assetsDir)).toBe(true);
      // The generic guide file must exist in assets/type-guides/
      const typeGuidesDir = path.join(assetsDir, "type-guides");
      expect(fs.existsSync(typeGuidesDir)).toBe(true);
      const guides = fs.readdirSync(typeGuidesDir);
      expect(guides.some((f: string) => /generic/i.test(f))).toBe(true);
      // dist/assets must exist after build
      const distAssetsPath = path.resolve(__dirname, "../../dist/assets");
      expect(fs.existsSync(distAssetsPath)).toBe(true);
    });
  });

  describe("installer logic [COMPAT-08]", () => {
    it("first run with no ~/.brief/type-guides/: directory created, generic guide installed [COMPAT-08]", async () => {
      const result = await installBundledContent({ simulateFirstRun: true });
      expect(result.directoryCreated).toBe(true);
      expect(result.guideInstalled).toBe(true);
    });

    it("startup with generic guide present: no action needed [COMPAT-08]", async () => {
      const result = await verifyGenericGuide();
      expect(result.actionNeeded).toBe(false);
    });

    it("startup with generic guide missing: regenerated from dist/assets/ [COMPAT-08]", async () => {
      const result = await verifyGenericGuide({ simulateMissing: true });
      expect(result.regenerated).toBe(true);
    });

    it("startup with generic guide corrupted: regenerated from dist/assets/ [COMPAT-08]", async () => {
      const result = await verifyGenericGuide({ simulateCorrupt: true });
      expect(result.regenerated).toBe(true);
    });

    it("server update: generic guide overwritten (source: bundled) [COMPAT-14]", async () => {
      const result = await installBundledContent({ isUpdate: true });
      expect(result.guideOverwritten).toBe(true);
    });
  });

  describe("extension definitions [COMPAT-05]", () => {
    it("extension definitions JSON: all six spec-defined extensions present [COMPAT-05]", () => {
      const defs = getExtensionDefinitions();
      expect(defs.length).toBeGreaterThanOrEqual(6);
      const names = defs.map((d: any) => d.name);
      expect(names).toContain("SONIC ARTS");
      expect(names).toContain("NARRATIVE CREATIVE");
      expect(names).toContain("LYRICAL CRAFT");
      expect(names).toContain("VISUAL STORYTELLING");
      expect(names).toContain("STRATEGIC PLANNING");
      expect(names).toContain("SYSTEM DESIGN");
    });

    it("extension definitions: each entry has name, description, and suggested subsections [COMPAT-05]", () => {
      const defs = getExtensionDefinitions();
      defs.forEach((extDef: any) => {
        expect(extDef.name).toBeDefined();
        expect(typeof extDef.name).toBe("string");
        expect(extDef).toHaveProperty("description");
        // T53-03: task spec uses 'typical_subsections', not 'sections'
        expect(extDef).toHaveProperty("typical_subsections");
        // COMPAT-05 required fields
        expect(Array.isArray(extDef.abstract_capability_descriptors)).toBe(
          true,
        );
        expect(Array.isArray(extDef.commonly_associated_ontologies)).toBe(true);
        expect(extDef.heading).toBeDefined();
        expect(extDef.heading).toMatch(/^[A-Z\s]+$/);
      });
    });
  });

  describe("supporting files [OSS-07]", () => {
    it("LICENSES-THIRD-PARTY.md: exists and is not empty [OSS-07]", () => {
      const fs = require("node:fs");
      const path = require("node:path");
      const licensesPath = path.resolve(
        __dirname,
        "../../LICENSES-THIRD-PARTY.md",
      );
      expect(fs.existsSync(licensesPath)).toBe(true);
      const content = fs.readFileSync(licensesPath, "utf-8");
      expect(content.length).toBeGreaterThan(0);
    });
  });

  describe("size discipline [PERF-11]", () => {
    it("bundled assets meet size discipline", () => {
      const fs = require("node:fs");
      const path = require("node:path");
      const assetsDir = path.resolve(__dirname, "../../assets");
      // T53-01: task spec says _generic.md (not generic.yaml)
      const genericGuidePath = path.join(
        assetsDir,
        "type-guides",
        "_generic.md",
      );
      // T53-02: task spec says extensions/extensions.json (not extension-definitions.json)
      const extDefsPath = path.join(assetsDir, "extensions", "extensions.json");
      expect(fs.existsSync(genericGuidePath)).toBe(true);
      expect(fs.statSync(genericGuidePath).size).toBeLessThan(20 * 1024);
      expect(fs.existsSync(extDefsPath)).toBe(true);
      expect(fs.statSync(extDefsPath).size).toBeLessThan(50 * 1024);
    });
  });

  describe("bedrock fallback [COMPAT-08]", () => {
    it("10 Universal Project Dimensions bundled as constant", async () => {
      const assets = await import("../../src/assets/bundled-content");
      const dims = (assets as any).UNIVERSAL_DIMENSIONS;
      expect(Array.isArray(dims)).toBe(true);
      expect(dims.length).toBe(10);
      expect(dims[0]).toHaveProperty("name");
    });
  });

  describe("is_generic and mode response fields [COMPAT-08, T53-04]", () => {
    it("loadGenericGuide response: includes is_generic: true field [COMPAT-08, T53-04]", () => {
      const guide = loadGenericGuide();
      // When the generic (non-type-specific) guide is used, response must include is_generic: true
      expect(guide.is_generic).toBe(true);
    });

    it("generic guide served when no type-specific guide exists: mode is adaptive [COMPAT-08, T53-04]", async () => {
      const result = await verifyGenericGuide({ simulateNoTypeGuide: true });
      expect(result).toBeDefined();
      expect(result.mode).toBe("adaptive");
    });
  });

  describe("three-tier fallback chain [COMPAT-08, T53-05]", () => {
    it("type-specific guide exists: served (tier 1) [COMPAT-08, T53-05]", async () => {
      const assets = await import("../../src/assets/bundled-content");
      const { resolveGuide } = assets as any;
      const result = await resolveGuide({
        type: "song",
        simulateTypeGuideExists: true,
      });
      expect(result.tier).toBe(1);
      expect(result.is_generic).toBe(false);
    });

    it("no type-specific guide, generic guide exists: served (tier 2) [COMPAT-08, T53-05]", async () => {
      const assets = await import("../../src/assets/bundled-content");
      const { resolveGuide } = assets as any;
      const result = await resolveGuide({
        type: "unknown-type",
        simulateTypeGuideMissing: true,
      });
      expect(result.tier).toBe(2);
      expect(result.is_generic).toBe(true);
      expect(result.mode).toBe("adaptive");
    });

    it("no type-specific or generic guide: universal dimensions served (tier 3) [COMPAT-08, T53-05]", async () => {
      const assets = await import("../../src/assets/bundled-content");
      const { resolveGuide } = assets as any;
      const result = await resolveGuide({
        type: "unknown-type",
        simulateAllGuidesMissing: true,
      });
      expect(result.tier).toBe(3);
      expect(result.universalDimensions).toBeDefined();
      expect(Array.isArray(result.universalDimensions)).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe("TASK-53: Property Tests", () => {
  it("forAll(startup): generic guide always present after startup completes [COMPAT-08]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(true, false),
        async (simulateMissing) => {
          const result = await verifyGenericGuide({ simulateMissing });
          // After verification, guide should always be available
          const guide = loadGenericGuide();
          expect(guide).toBeDefined();
        },
      ),
      { numRuns: 5 }, // G3: raised from 2
    );
  });

  it("forAll(server update): bundled generic guide always replaced with latest version [COMPAT-14]", async () => {
    await fc.assert(
      fc.asyncProperty(fc.constant(true), async () => {
        const result = await installBundledContent({ isUpdate: true });
        expect(result.guideOverwritten).toBe(true);
      }),
      { numRuns: 5 }, // G3: raised from 2
    );
  });

  it("forAll(build): assets/ always included in dist/ [COMPAT-08]", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    fc.assert(
      fc.property(
        fc.constantFrom("assets/", "type-guides/", "ontologies/"),
        (_dir) => {
          // Verify the package.json includes assets/ in files field
          const pkg = JSON.parse(
            fs.readFileSync(
              path.resolve(__dirname, "../../package.json"),
              "utf-8",
            ),
          );
          expect(pkg.files).toContain("assets/");
        },
      ),
    );
  });
});
