import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { removeExtension } from "../../src/extension/removal";

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

let tmpDir: string;

/** Build a BRIEF.md with one or two extensions for testing. */
function writeBrief(content: string): void {
  fs.writeFileSync(path.join(tmpDir, "BRIEF.md"), content, "utf-8");
}

function readBrief(): string {
  return fs.readFileSync(path.join(tmpDir, "BRIEF.md"), "utf-8");
}

const BRIEF_WITH_SONIC_ARTS = [
  "**Project:** Test Project",
  "**Type:** album",
  "**Extensions:** sonic_arts",
  "**Status:** active",
  "**Created:** 2025-01-01",
  "**Updated:** 2025-01-01",
  "**Version:** 1.0",
  "",
  "## What This Is",
  "",
  "A test project.",
  "",
  "# SONIC ARTS",
  "",
  "## Sound Palette",
  "",
  "Some sound palette content here.",
  "",
  "## Direction/Intent",
  "",
  "Some direction content here.",
  "",
  "## References",
  "",
  "- Reference 1",
  "",
].join("\n");

const BRIEF_WITH_TWO_EXTENSIONS = [
  "**Project:** Test Project",
  "**Type:** album",
  "**Extensions:** sonic_arts, lyrical_craft",
  "**Status:** active",
  "**Created:** 2025-01-01",
  "**Updated:** 2025-01-01",
  "**Version:** 1.0",
  "",
  "## What This Is",
  "",
  "A test project.",
  "",
  "# SONIC ARTS",
  "",
  "## Sound Palette",
  "",
  "Sonic content.",
  "",
  "# LYRICAL CRAFT",
  "",
  "## Themes",
  "",
  "Lyrical content.",
  "",
].join("\n");

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "brief-removal-test-"));
});

afterEach(() => {
  vi.clearAllMocks();
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {}
});

// ---------------------------------------------------------------------------
// Unit Tests
// ---------------------------------------------------------------------------

describe("GAP-I: Extension Removal", () => {
  describe("removeExtension with removeContent: true", () => {
    it("strips heading + subsections from BRIEF.md", async () => {
      writeBrief(BRIEF_WITH_SONIC_ARTS);
      const result = await removeExtension({
        extensionName: "sonic_arts",
        projectPath: tmpDir,
        removeContent: true,
      });

      expect(result.removed).toBe(true);
      expect(result.sectionsRemoved.length).toBeGreaterThan(0);
      expect(result.sectionsRemoved).toContain("Sound Palette");
      expect(result.sectionsRemoved).toContain("Direction/Intent");

      const content = readBrief();
      expect(content).not.toContain("# SONIC ARTS");
      expect(content).not.toContain("## Sound Palette");
      // Metadata field should still exist but without sonic_arts
      expect(content).toContain("**Extensions:**");
      expect(content).not.toMatch(/\bsonic_arts\b/);
      // Other content preserved
      expect(content).toContain("## What This Is");
    });
  });

  describe("removeExtension with removeContent: false (default)", () => {
    it("only updates metadata, heading remains", async () => {
      writeBrief(BRIEF_WITH_SONIC_ARTS);
      const result = await removeExtension({
        extensionName: "sonic_arts",
        projectPath: tmpDir,
        removeContent: false,
      });

      expect(result.removed).toBe(true);
      expect(result.metadataUpdated).toBe(true);
      expect(result.sectionsRemoved).toEqual([]);

      const content = readBrief();
      // Heading still there
      expect(content).toContain("# SONIC ARTS");
      // Metadata updated
      expect(content).not.toMatch(/\bsonic_arts\b.*Extensions/);
    });
  });

  describe("metadata field update", () => {
    it("removes extension slug from comma-separated **Extensions:** list", async () => {
      writeBrief(BRIEF_WITH_TWO_EXTENSIONS);
      await removeExtension({
        extensionName: "sonic_arts",
        projectPath: tmpDir,
      });

      const content = readBrief();
      expect(content).not.toMatch(/\bsonic_arts\b/);
      expect(content).toMatch(/\blyrical_craft\b/);
    });
  });

  describe("nonexistent extension", () => {
    it("returns removed: false with warning", async () => {
      writeBrief(BRIEF_WITH_SONIC_ARTS);
      const result = await removeExtension({
        extensionName: "nonexistent",
        projectPath: tmpDir,
      });

      expect(result.removed).toBe(false);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain("not found");
    });
  });

  describe("idempotent removal", () => {
    it("second removal returns removed: false", async () => {
      writeBrief(BRIEF_WITH_SONIC_ARTS);
      const first = await removeExtension({
        extensionName: "sonic_arts",
        projectPath: tmpDir,
        removeContent: true,
      });
      expect(first.removed).toBe(true);

      const second = await removeExtension({
        extensionName: "sonic_arts",
        projectPath: tmpDir,
        removeContent: true,
      });
      expect(second.removed).toBe(false);
    });
  });

  describe("preserves other extensions", () => {
    it("removing one extension leaves the other intact", async () => {
      writeBrief(BRIEF_WITH_TWO_EXTENSIONS);
      await removeExtension({
        extensionName: "sonic_arts",
        projectPath: tmpDir,
        removeContent: true,
      });

      const content = readBrief();
      // LYRICAL CRAFT should remain
      expect(content).toContain("# LYRICAL CRAFT");
      expect(content).toContain("## Themes");
      expect(content).toContain("Lyrical content.");
      expect(content).toMatch(/\blyrical_craft\b/);
      // SONIC ARTS should be gone
      expect(content).not.toContain("# SONIC ARTS");
    });
  });
});

// ---------------------------------------------------------------------------
// Metadata sync tests (syncUpdatedTimestamp, writeBrief auto-update)
// ---------------------------------------------------------------------------

describe("GAP-I: Metadata — syncUpdatedTimestamp via writeBrief", () => {
  it("writeBrief auto-updates **Updated:** timestamp", async () => {
    const { writeBrief: writeBriefFn, readBrief: readBriefFn } = await import(
      "../../src/io/project-state"
    );

    const content = [
      "**Project:** Test",
      "**Type:** album",
      "**Status:** active",
      "**Created:** 2020-01-01",
      "**Updated:** 2020-01-01",
      "**Version:** 1.0",
      "",
    ].join("\n");

    await writeBriefFn(tmpDir, content);
    const result = await readBriefFn(tmpDir);

    const today = new Date().toISOString().slice(0, 10);
    expect(result).toContain(`**Updated:** ${today}`);
    expect(result).not.toContain("**Updated:** 2020-01-01");
  });

  it("syncUpdatedTimestamp replaces existing **Updated:** line", async () => {
    const { syncUpdatedTimestamp } = await import(
      "../../src/writer/metadata-sync"
    );
    const content =
      "**Project:** X\n**Updated:** 2020-01-01\n**Version:** 1.0\n";
    const result = syncUpdatedTimestamp(content);
    const today = new Date().toISOString().slice(0, 10);
    expect(result).toContain(`**Updated:** ${today}`);
    expect(result).not.toContain("2020-01-01");
  });

  it("syncUpdatedTimestamp inserts after **Created:** if **Updated:** missing", async () => {
    const { syncUpdatedTimestamp } = await import(
      "../../src/writer/metadata-sync"
    );
    const content =
      "**Project:** X\n**Created:** 2025-01-01\n**Version:** 1.0\n";
    const result = syncUpdatedTimestamp(content);
    const today = new Date().toISOString().slice(0, 10);
    expect(result).toContain(`**Updated:** ${today}`);
    // Should appear after Created
    const createdIdx = result.indexOf("**Created:**");
    const updatedIdx = result.indexOf("**Updated:**");
    expect(updatedIdx).toBeGreaterThan(createdIdx);
  });
});

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe("GAP-I: Property Tests", () => {
  it("forAll(extension name): removeExtension never throws", async () => {
    writeBrief(BRIEF_WITH_SONIC_ARTS);
    await fc.assert(
      fc.asyncProperty(
        fc
          .string({ minLength: 1, maxLength: 20 })
          .map((s) => s.replace(/[^a-zA-Z0-9_ ]/g, "a")),
        async (name) => {
          // Should not throw regardless of input
          const result = await removeExtension({
            extensionName: name,
            projectPath: tmpDir,
          });
          expect(result).toBeDefined();
          expect(typeof result.removed).toBe("boolean");
        },
      ),
      { numRuns: 20 },
    );
  });

  it("forAll(content): syncUpdatedTimestamp always produces valid date", async () => {
    const { syncUpdatedTimestamp } = await import(
      "../../src/writer/metadata-sync"
    );
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(
          "**Project:** X\n**Updated:** 2020-01-01\n",
          "**Project:** X\n**Created:** 2025-06-01\n",
          "**Project:** X\n",
          "**Updated:** old-date\n**Created:** 2025-01-01\n",
          "",
        ),
        async (content) => {
          const result = syncUpdatedTimestamp(content);
          // Should always contain a valid Updated line with ISO date
          const match = result.match(/\*\*Updated:\*\*\s*(\S+)/);
          expect(match).not.toBeNull();
          if (match) {
            expect(match[1]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
          }
        },
      ),
      { numRuns: 10 },
    );
  });
});
