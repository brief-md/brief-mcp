import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import fc from "fast-check";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { _resetState, getTypeGuide } from "../../src/type-intelligence/loading";

// Clean disk-based type-guides before tests to avoid cross-file pollution
beforeAll(() => {
  const briefHome = process.env.BRIEF_HOME ?? path.join(os.homedir(), ".brief");
  const guidesDir = path.join(briefHome, "type-guides");
  try {
    fs.rmSync(guidesDir, { recursive: true, force: true });
  } catch {}
});

afterEach(() => {
  _resetState();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Unit Tests
// ---------------------------------------------------------------------------

describe("TASK-40: Type Intelligence — Type Guide Loading & Resolution", () => {
  describe("resolution order [COMPAT-07]", () => {
    it("exact type match: correct guide returned with source metadata [COMPAT-07]", async () => {
      const result = await getTypeGuide({ type: "album" });
      expect(result.guide).toBeDefined();
      expect(result.guide.metadata.type).toBe("album");
      // G-313: assert source equals one of the allowed values; T40-02: 'user' and 'project' are not valid spec values
      expect(result.guide.metadata.source).toBeDefined();
      expect(["bundled", "ai_generated", "community", "user_edited"]).toContain(
        result.guide.metadata.source,
      );
    });

    it('alias match ("novel" aliased in "fiction" guide): guide returned with matched_via_alias flag [COMPAT-07]', async () => {
      const result = await getTypeGuide({ type: "novel" });
      expect(result.matchedViaAlias).toBe(true);
      expect(result.aliasUsed).toBe("novel");
    });

    it("no match, generic guide exists: generic guide returned with is_generic and adaptive mode flags [COMPAT-08]", async () => {
      const result = await getTypeGuide({ type: "xyzunknowntype" });
      expect(result.isGeneric).toBe(true);
      expect(result.mode).toBe("adaptive");
      expect(result.signal).toBeDefined();
      expect(result.signal).toMatch(/no type guide|generic|adaptive/i);
    });
  });

  describe("generic guide safety [COMPAT-08]", () => {
    it("generic guide missing on startup: regenerated from defaults, then returned [COMPAT-08]", async () => {
      const result = await getTypeGuide({
        type: "anything",
        simulateMissing: true,
      });
      expect(result.isGeneric).toBe(true);
      expect(result.guide).toBeDefined();
      // G-301: assert source is bundled (recovery used bundled guide)
      expect(result.guide.metadata.source).toBe("bundled");
    });

    it("generic guide corrupted: regenerated from defaults, then returned [COMPAT-08]", async () => {
      const result = await getTypeGuide({
        type: "anything",
        simulateCorrupt: true,
      });
      expect(result.isGeneric).toBe(true);
      expect(result.guide).toBeDefined();
      // G-302: assert source is bundled (recovery used bundled guide)
      expect(result.guide.metadata.source).toBe("bundled");
    });
  });

  describe("YAML handling [COMPAT-15]", () => {
    it("invalid YAML frontmatter: file treated as markdown body only, no structured metadata [COMPAT-15]", async () => {
      const result = await getTypeGuide({ type: "bad-yaml-guide" });
      expect(result.guide!.body).toBeDefined();
      expect(result.yamlFallback).toBe(true);
    });
  });

  describe("precedence [COMPAT-13]", () => {
    it("two guides exist for same type (bundled + ai_generated): user-created guide takes precedence [COMPAT-13]", async () => {
      const result = await getTypeGuide({ type: "dual-guide-type" });
      // G-303: T40-01: spec value is 'user_edited' not 'user'
      expect(result.guide.metadata.source).toBe("user_edited");
    });
  });

  describe("type normalization [COMPAT-07]", () => {
    it("type name with mixed case: normalised to lowercase before matching [COMPAT-07]", async () => {
      const lower = await getTypeGuide({ type: "album" });
      const mixed = await getTypeGuide({ type: "Album" });
      expect(lower.guide.metadata.type).toBe(mixed.guide.metadata.type);
    });
  });

  describe("parent type handling [COMPAT-07]", () => {
    it("guide with parent_type: parent guide resolved and included [COMPAT-07]", async () => {
      const result = await getTypeGuide({ type: "ep" });
      expect(result.parentGuide).toBeDefined();
    });

    it("guide with missing parent_type: child guide used alone without error [COMPAT-07]", async () => {
      const result = await getTypeGuide({ type: "orphan-child" });
      expect(result.guide).toBeDefined();
      expect(result.parentGuide).toBeUndefined();
    });

    it("circular parent_type chain: detected and broken at max depth [COMPAT-07]", async () => {
      const result = await getTypeGuide({ type: "circular-parent" });
      expect(result.guide).toBeDefined();
      expect(result.circularDetected).toBe(true);
    });
  });

  describe("provenance [COMPAT-10]", () => {
    it("guide response always includes source field: provenance always present [COMPAT-10]", async () => {
      const result = await getTypeGuide({ type: "album" });
      expect(result.guide.metadata.source).toBeDefined();
      expect(["bundled", "ai_generated", "community", "user_edited"]).toContain(
        result.guide.metadata.source,
      );
    });
  });

  describe("manual edit detection [COMPAT-10]", () => {
    it("guide file mtime changed since last load, source is ai_generated: source field updated to user_edited in file [COMPAT-10]", async () => {
      const result = await getTypeGuide({
        type: "edited-guide",
        simulateMtimeChange: true,
      });
      // G-304: assert source is the specific expected value 'user_edited'
      expect(result.guide.metadata.source).toBe("user_edited");
    });

    it("guide file mtime unchanged: source field not modified [COMPAT-10]", async () => {
      const result = await getTypeGuide({ type: "unchanged-guide" });
      // G-305: assert reloaded is false (or fromCache is true) — not just toBeFalsy
      expect(result.reloaded === false || result.fromCache === true).toBe(true);
    });

    it("first run with no mtime index: mtime index populated, no source field updates triggered [COMPAT-10]", async () => {
      const result = await getTypeGuide({
        type: "first-run-guide",
        simulateFirstRun: true,
      });
      expect(result.mtimeIndexPopulated).toBe(true);
      expect(result.sourceModified).toBe(false);
    });
  });
});

describe("YAML security hardening [SEC-09]", () => {
  it("YAML with JavaScript execution attempt → rejected safely [SEC-09]", async () => {
    // A guide file with YAML that attempts JS execution should be handled safely
    const result = await getTypeGuide({
      type: "test-type",
      simulateYamlContent:
        "!!js/function \"function() { return require('child_process').execSync('id') }\"",
    });
    // Should not execute JS, should fall back to generic guide
    expect(result.isGeneric).toBe(true);
    // G-306: assert jsExecutionPrevented explicitly
    expect(result.jsExecutionPrevented).toBe(true);
  });

  it("YAML billion-laughs DoS attempt (deep alias nesting) → rejected safely [SEC-09]", async () => {
    const result = await getTypeGuide({
      type: "test-type",
      simulateYamlContent:
        'a: &a ["lol","lol","lol","lol","lol","lol","lol","lol","lol"]\nb: &b [*a,*a,*a,*a,*a,*a,*a,*a,*a]\nc: &c [*b,*b,*b,*b,*b,*b,*b,*b,*b]',
    });
    // Should not hang or crash, should return gracefully
    expect(result).toBeDefined();
    // G-307: assert aliasExpansionLimited explicitly
    expect(result.aliasExpansionLimited).toBe(true);
    expect(result.expansionCount).toBeLessThanOrEqual(1000);
  });

  it("YAML with __proto__ key → prototype pollution prevented [SEC-09]", async () => {
    const result = await getTypeGuide({
      type: "test-type",
      simulateYamlContent: "__proto__:\n  admin: true\ntype: test-type\n",
    });
    // G-308: check BEFORE the delete call — check result.admin is undefined first
    expect((result as any).admin).toBeUndefined();
    // Also ensure prototype was not polluted
    expect(({} as any).admin).toBeUndefined();
    delete (globalThis as any).admin;
  });
});

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe("TASK-40: Property Tests", () => {
  // G-309: make async and await fc.assert
  it("forAll(type query): response is never empty — always returns a guide or generic fallback [COMPAT-07]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .string({ minLength: 1, maxLength: 30 })
          .filter((s) => /^[a-z-]+$/.test(s)),
        async (type) => {
          const result = await getTypeGuide({ type });
          expect(result.guide).toBeDefined();
        },
      ),
      { numRuns: 10 },
    );
  });

  // G-310: make async and await fc.assert
  it("forAll(guide file): source field always present in response [COMPAT-10]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom("album", "film", "xyzunknown"),
        async (type) => {
          const result = await getTypeGuide({ type });
          expect(result.guide.metadata.source).toBeDefined();
        },
      ),
      { numRuns: 3 },
    );
  });

  // G-311: make async and await fc.assert
  it("forAll(alias match): matched_via_alias flag always true [COMPAT-07]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom("novel", "ep", "lp", "single"),
        async (alias) => {
          const result = await getTypeGuide({ type: alias });
          expect(result).toBeDefined();
          // Known aliases should always produce a match
          expect(result.matchedViaAlias).toBe(true);
        },
      ),
      { numRuns: 2 },
    );
  });

  // G-312: make async and await fc.assert; fix mode expected value to 'adaptive' per spec
  it("forAll(generic fallback): is_generic and mode always included [COMPAT-08]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .string({ minLength: 10, maxLength: 30 })
          .filter((s) => /^[a-z]+$/.test(s)),
        async (type) => {
          const result = await getTypeGuide({ type });
          expect(result.isGeneric).toBe(true);
          expect(result.mode).toBe("adaptive");
        },
      ),
      { numRuns: 5 },
    );
  });

  it("forAll(random type): structural invariant — guide shape always valid [COMPAT-07]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom("album", "novel", "xyzunknown", "ep"),
        async (type) => {
          const result = await getTypeGuide({ type });
          expect(Object.keys(result.guide)).toEqual(
            expect.arrayContaining([
              "slug",
              "displayName",
              "metadata",
              "content",
              "path",
            ]),
          );
          expect(Object.keys(result.guide.metadata)).toEqual(
            expect.arrayContaining(["type", "source"]),
          );
        },
      ),
      { numRuns: 4 },
    );
  });
});
