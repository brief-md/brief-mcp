import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  _resetState as _resetExtensionState,
  addExtension,
} from "../../src/extension/creation";
import {
  linkSectionDataset,
  parseSectionDatasets,
  readBrief,
  writeBrief,
} from "../../src/io/project-state";

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

let tmpDir: string;

beforeEach(() => {
  _resetExtensionState();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "brief-wp7-"));
  // Write a minimal BRIEF.md
  fs.writeFileSync(
    path.join(tmpDir, "BRIEF.md"),
    [
      "**Project:** WP7 Test",
      "**Type:** album",
      "**Status:** active",
      "**Created:** 2026-01-01",
      "**Updated:** 2026-01-01",
      "**Extensions:**",
      "",
    ].join("\n"),
  );
});

afterEach(async () => {
  _resetExtensionState();
  await fsp.rm(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// addExtension with sectionModes (WP7/GAP-G)
// ---------------------------------------------------------------------------

describe("WP7/GAP-G: addExtension with sectionModes", () => {
  it("writes section-dataset comment for structured sections", async () => {
    const result = await addExtension({
      extensionName: "SONIC ARTS",
      projectPath: tmpDir,
      sectionModes: { "Sound Palette": "structured" },
    });

    expect(result.created).toBe(true);
    expect(result.sectionModes).toEqual({ "Sound Palette": "structured" });

    const content = await readBrief(tmpDir);
    expect(content).toContain("<!-- brief:section-dataset -->");
    // Comment should appear after the "## Sound Palette" heading
    const lines = content.split("\n");
    const headingIdx = lines.findIndex((l) =>
      l.startsWith("### Sound Palette"),
    );
    expect(headingIdx).toBeGreaterThan(-1);
    // Find the dataset comment after the heading
    const commentIdx = lines.findIndex(
      (l, i) => i > headingIdx && l.includes("brief:section-dataset"),
    );
    expect(commentIdx).toBeGreaterThan(headingIdx);
  });

  it("without sectionModes creates all sections as freeform (no comments)", async () => {
    await addExtension({
      extensionName: "SONIC ARTS",
      projectPath: tmpDir,
    });

    const content = await readBrief(tmpDir);
    expect(content).not.toContain("brief:section-dataset");
  });

  it("result includes sectionModes in response", async () => {
    const modes = {
      "Sound Palette": "structured" as const,
      "Production Approach": "freeform" as const,
    };
    const result = await addExtension({
      extensionName: "SONIC ARTS",
      projectPath: tmpDir,
      sectionModes: modes,
    });

    expect(result.sectionModes).toEqual(modes);
  });

  it("structured section result includes nextSteps guidance", async () => {
    const result = await addExtension({
      extensionName: "SONIC ARTS",
      projectPath: tmpDir,
      sectionModes: { "Sound Palette": "structured" },
    });

    expect(result.nextSteps).toBeDefined();
    expect(typeof result.nextSteps).toBe("string");
    expect(result.nextSteps).toContain("brief_ontology_draft");
    expect(result.nextSteps).toContain("brief_search_ontology");
  });

  it("freeform section has no dataset comment", async () => {
    await addExtension({
      extensionName: "SONIC ARTS",
      projectPath: tmpDir,
      sectionModes: {
        "Sound Palette": "structured",
        "Production Approach": "freeform",
      },
    });

    const content = await readBrief(tmpDir);
    const lines = content.split("\n");
    // Find Production Approach heading
    const prodIdx = lines.findIndex((l) =>
      l.startsWith("### Production Approach"),
    );
    expect(prodIdx).toBeGreaterThan(-1);
    // Find next heading after Production Approach
    const nextHeadingIdx = lines.findIndex(
      (l, i) => i > prodIdx && l.startsWith("### "),
    );
    // Check no dataset comment between Production Approach and next heading
    const sectionLines =
      nextHeadingIdx > 0
        ? lines.slice(prodIdx + 1, nextHeadingIdx)
        : lines.slice(prodIdx + 1);
    const hasDatasetComment = sectionLines.some((l) =>
      l.includes("brief:section-dataset"),
    );
    expect(hasDatasetComment).toBe(false);
  });

  it("no nextSteps when all sections are freeform", async () => {
    const result = await addExtension({
      extensionName: "SONIC ARTS",
      projectPath: tmpDir,
      sectionModes: {
        "Sound Palette": "freeform",
        "Production Approach": "freeform",
      },
    });

    expect(result.nextSteps).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// linkSectionDataset (WP7/GAP-G)
// ---------------------------------------------------------------------------

describe("WP7/GAP-G: linkSectionDataset", () => {
  beforeEach(async () => {
    // Write BRIEF.md with a section heading
    await writeBrief(
      tmpDir,
      [
        "**Project:** WP7 Test",
        "**Type:** album",
        "",
        "## Sound Palette",
        "",
        "Some content here.",
        "",
        "## Production Approach",
        "",
        "More content.",
      ].join("\n"),
    );
  });

  it("writes comment at section heading", async () => {
    await linkSectionDataset(tmpDir, "Sound Palette", "music-theory");

    const content = await readBrief(tmpDir);
    expect(content).toContain("<!-- brief:section-dataset music-theory -->");
  });

  it("is idempotent — calling twice with same ontology produces one comment", async () => {
    await linkSectionDataset(tmpDir, "Sound Palette", "music-theory");
    await linkSectionDataset(tmpDir, "Sound Palette", "music-theory");

    const content = await readBrief(tmpDir);
    const matches = content.match(
      /<!-- brief:section-dataset music-theory -->/g,
    );
    expect(matches?.length).toBe(1);
  });

  it("replaces existing dataset link", async () => {
    await linkSectionDataset(tmpDir, "Sound Palette", "pack-a");
    await linkSectionDataset(tmpDir, "Sound Palette", "pack-b");

    const content = await readBrief(tmpDir);
    expect(content).not.toContain("pack-a");
    expect(content).toContain("<!-- brief:section-dataset pack-b -->");
  });

  it("appends section if heading not found", async () => {
    await linkSectionDataset(tmpDir, "New Section", "my-ontology");

    const content = await readBrief(tmpDir);
    expect(content).toContain("## New Section");
    expect(content).toContain("<!-- brief:section-dataset my-ontology -->");
  });
});

// ---------------------------------------------------------------------------
// parseSectionDatasets (WP7/GAP-G)
// ---------------------------------------------------------------------------

describe("WP7/GAP-G: parseSectionDatasets", () => {
  it("extracts section-dataset comments", () => {
    const content = [
      "## Sound Palette",
      "<!-- brief:section-dataset music-theory -->",
      "",
      "Some content",
      "",
      "## Production Approach",
      "<!-- brief:section-dataset audio-production -->",
    ].join("\n");

    const datasets = parseSectionDatasets(content);
    expect(datasets).toHaveLength(2);
    expect(datasets[0]).toEqual({
      section: "Sound Palette",
      ontologyName: "music-theory",
    });
    expect(datasets[1]).toEqual({
      section: "Production Approach",
      ontologyName: "audio-production",
    });
  });

  it("returns empty for sections without dataset comments", () => {
    const content = [
      "## Sound Palette",
      "",
      "Just freeform content.",
      "",
      "## Production Approach",
      "",
    ].join("\n");

    const datasets = parseSectionDatasets(content);
    expect(datasets).toHaveLength(0);
  });

  it("round-trips with linkSectionDataset", async () => {
    await linkSectionDataset(tmpDir, "Sound Palette", "music-theory");
    const content = await readBrief(tmpDir);
    const datasets = parseSectionDatasets(content);
    expect(datasets.some((d) => d.ontologyName === "music-theory")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Property Tests (WP7/GAP-G)
// ---------------------------------------------------------------------------

describe("WP7/GAP-G: Property Tests", () => {
  it("forAll(section name): linkSectionDataset never throws", async () => {
    const sectionNames = [
      "Sound Palette",
      "Narrative Arc",
      "Custom Section",
      "Section With Spaces",
      "A",
    ];
    await fc.assert(
      fc.asyncProperty(fc.constantFrom(...sectionNames), async (section) => {
        await linkSectionDataset(tmpDir, section, "test-ontology");
        const content = await readBrief(tmpDir);
        expect(content).toContain("test-ontology");
      }),
      { numRuns: 5 },
    );
  });

  it("forAll(sectionModes map): addExtension always succeeds with valid modes", async () => {
    const subsections = [
      "Sound Palette",
      "Production Approach",
      "Sonic References",
    ];
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          "Sound Palette": fc.constantFrom(
            "freeform" as const,
            "structured" as const,
          ),
          "Production Approach": fc.constantFrom(
            "freeform" as const,
            "structured" as const,
          ),
        }),
        async (modes) => {
          _resetExtensionState();
          // Rewrite a fresh BRIEF.md for each run
          fs.writeFileSync(
            path.join(tmpDir, "BRIEF.md"),
            "**Project:** Test\n**Type:** album\n**Extensions:**\n",
          );
          const result = await addExtension({
            extensionName: "SONIC ARTS",
            projectPath: tmpDir,
            sectionModes: modes,
          });
          expect(result.created).toBe(true);
          expect(result.subsections).toEqual(subsections);
        },
      ),
      { numRuns: 4 },
    );
  });

  it("forAll(ontology name): section-dataset comment is parseable after writing", async () => {
    const ontologyNames = [
      "music-theory",
      "audio-production",
      "theme-pack",
      "my-custom-ontology",
    ];
    await fc.assert(
      fc.asyncProperty(fc.constantFrom(...ontologyNames), async (ontology) => {
        // Reset BRIEF.md with a section for each run
        await writeBrief(
          tmpDir,
          "**Project:** Test\n\n## Sound Palette\n\nContent.\n",
        );
        await linkSectionDataset(tmpDir, "Sound Palette", ontology);
        const content = await readBrief(tmpDir);
        const datasets = parseSectionDatasets(content);
        const found = datasets.find((d) => d.ontologyName === ontology);
        expect(found).toBeDefined();
        expect(found!.section).toBe("Sound Palette");
      }),
      { numRuns: 4 },
    );
  });
});
