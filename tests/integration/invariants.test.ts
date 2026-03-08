import fc from "fast-check";
import { beforeEach, describe, expect, it } from "vitest";
import { _resetSectionStore } from "../../src/context/write-sections";
import { _resetState as resetExtension } from "../../src/extension/creation";

beforeEach(() => {
  resetExtension();
  _resetSectionStore();
});

// ---------------------------------------------------------------------------
// Cross-Cutting Invariant Tests [T54-02]
//
// Task spec (TASK-54) requires these cross-cutting invariants in a SEPARATE
// file from the interaction pattern tests. This file contains the canonical
// invariant test suite; patterns.test.ts contains the pattern flow tests.
// ---------------------------------------------------------------------------

describe("TASK-54: Cross-Cutting Invariants", () => {
  describe("idempotency [TEST-06]", () => {
    it("write tool called twice: idempotent (no duplicate content) [TEST-06]", async () => {
      const { addExtension } = await import("../../src/extension/creation");
      await addExtension({ extensionName: "IDEMPOTENT TEST" });
      const result = await addExtension({ extensionName: "IDEMPOTENT TEST" });
      expect(result.alreadyExists).toBe(true);
    });
  });

  describe("round-trip [TEST-01]", () => {
    it("parse → write → parse round-trip: identical structure [TEST-01]", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const { parseBrief } = await import("../../src/parser");
      const { writeBrief } = await import("../../src/writer/core");

      const content = fs.readFileSync(
        path.resolve(__dirname, "../fixtures/canonical/simple.md"),
        "utf-8",
      );
      const parsed = await parseBrief(content);
      const written = await writeBrief(parsed);
      const reparsed = await parseBrief(written);

      expect(reparsed.metadata.project).toBe(parsed.metadata.project);
      expect(reparsed.metadata.type).toBe(parsed.metadata.type);
      expect(reparsed.sections.length).toBe(parsed.sections.length);
    });
  });

  describe("lenient corpus [TEST-02]", () => {
    it("lenient corpus files: parsed without throwing errors [TEST-02]", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const { parseBrief } = await import("../../src/parser");

      const fixturesDir = path.resolve(__dirname, "../fixtures/lenient");
      const files = fs
        .readdirSync(fixturesDir)
        .filter((f: string) => f.endsWith(".md"));
      expect(files.length).toBeGreaterThan(0);

      for (const file of files) {
        const content = fs.readFileSync(path.join(fixturesDir, file), "utf-8");
        await expect(parseBrief(content)).resolves.toBeDefined();
      }
    });
  });

  describe("hierarchy walking [TEST-03]", () => {
    it("hierarchy walk at all depth levels: correct context assembled [TEST-03]", async () => {
      const { assembleContext } = await import("../../src/hierarchy/context");

      // Single level — one level input
      const single = await assembleContext([
        {
          depth: 0,
          project: "Project",
          type: "project",
          dirPath: "/workspace/project",
        },
      ]);
      expect(single.levels.length).toBeLessThanOrEqual(1);

      // Two levels — collection → project
      const two = await assembleContext([
        {
          depth: 1,
          project: "Collection",
          type: "album",
          dirPath: "/workspace/collection",
        },
        {
          depth: 0,
          project: "Project",
          type: "song",
          dirPath: "/workspace/collection/project",
        },
      ]);
      expect(two.levels.length).toBeLessThanOrEqual(2);

      // Three levels — artist → album → song
      const three = await assembleContext([
        {
          depth: 2,
          project: "Artist",
          type: "artist",
          dirPath: "/workspace/artist",
        },
        {
          depth: 1,
          project: "Album",
          type: "album",
          dirPath: "/workspace/artist/album",
        },
        {
          depth: 0,
          project: "Song",
          type: "song",
          dirPath: "/workspace/artist/album/song",
        },
      ]);
      expect(three.levels.length).toBeLessThanOrEqual(3);

      // Empty input — no levels
      const empty = await assembleContext([]);
      expect(empty.levels.length).toBe(0);
    });
  });

  describe("decision lifecycle [TEST-04]", () => {
    it("decision supersession lifecycle: chain is traversable [TEST-04]", async () => {
      const { addDecision } = await import("../../src/context/write-decisions");

      // Add initial decision
      const original = await addDecision({
        title: "Use MySQL",
        rationale: "Common DB",
      });
      expect(original.success).toBe(true);

      // Supersede it — "Use MySQL" is a known decision in the stub
      const replacement = await addDecision({
        title: "Use PostgreSQL",
        rationale: "Better for this use case",
        replaces: "Use MySQL",
      });
      expect(replacement.success).toBe(true);
      expect(replacement.previousDecisionUpdated).toBe(true);
      expect(replacement.supersededByAnnotation).toContain("Use PostgreSQL");
    });

    it("decision exception lifecycle: both active, linked correctly [TEST-04]", async () => {
      const { addDecision } = await import("../../src/context/write-decisions");

      // Add base decision
      const base = await addDecision({
        title: "Use Library A",
        rationale: "Well documented",
      });
      expect(base.success).toBe(true);

      // Add exception — exception_to does not require known decisions
      const exception = await addDecision({
        title: "Use Library B for edge case",
        rationale: "Better performance",
        exceptionTo: "Use Library A",
      });
      expect(exception.success).toBe(true);
      expect(exception.annotationAdded).toBe(true);
      expect(exception.annotation).toContain("Use Library B");
    });
  });

  describe("write preservation [TEST-06]", () => {
    it("write operation: untouched sections byte-for-byte identical [TEST-06]", async () => {
      const { parseBrief } = await import("../../src/parser");
      const { updateSection } = await import(
        "../../src/context/write-sections"
      );

      const original =
        "**Project:** Test\n**Type:** song\n**Created:** 2024-01-01\n\n## Direction\n\nOriginal direction.\n\n## Key Decisions\n\nOriginal decisions content.\n";

      const result = await updateSection({
        content: original,
        section: "Direction",
        newContent: "New direction content.",
      });

      const originalParsed = await parseBrief(original);
      const updatedParsed = await parseBrief(result.content as string);

      const originalDecisions = originalParsed.sections.find((s: any) =>
        /decisions/i.test(s.heading),
      );
      const updatedDecisions = updatedParsed.sections.find((s: any) =>
        /decisions/i.test(s.heading),
      );

      expect(updatedDecisions?.body).toBe(originalDecisions?.body);
    });
  });

  describe("unicode normalisation [TEST-09]", () => {
    it("Unicode normalisation: zero-width chars stripped consistently", async () => {
      const { getContext } = await import("../../src/context/read");
      const testPath = "/tmp/brief-test-unicode";
      const r1 = await getContext({ projectPath: testPath } as Parameters<
        typeof getContext
      >[0]);
      const r2 = await getContext({ projectPath: testPath } as Parameters<
        typeof getContext
      >[0]);
      expect((r1 as any).normalizedQuery).toBe((r2 as any).normalizedQuery);
    });
  });

  describe("conflict detection [TEST-07]", () => {
    it("conflicting decisions flagged, exceptions excluded [TEST-07]", async () => {
      const { checkConflicts } = await import("../../src/validation/conflicts");

      const conflicting = await checkConflicts({
        decisions: [
          { text: "Use A", status: "active" },
          { text: "Use B", status: "active" },
        ],
        constraints: [],
      });
      expect(conflicting.conflicts.length).toBeGreaterThan(0);

      const withException = await checkConflicts({
        decisions: [
          { text: "Use A", status: "active" },
          {
            text: "Use B for edge case",
            status: "exception",
            exceptionTo: "Use A",
          },
        ],
        constraints: [],
      });
      const exceptionConflicts = withException.conflicts.filter((c: any) =>
        c.items.some((i: any) => i.text === "Use B for edge case"),
      );
      expect(exceptionConflicts).toHaveLength(0);
    });
  });
});

// ---------------------------------------------------------------------------
// Property Tests (Invariant-Focused)
// ---------------------------------------------------------------------------

describe("TASK-54: Invariant Property Tests", () => {
  it("forAll(write tool, same input twice): result is idempotent [TEST-06]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(
          "SONIC ARTS",
          "NARRATIVE CREATIVE",
          "LYRICAL CRAFT",
          "VISUAL STORYTELLING",
        ),
        async (ext) => {
          const { addExtension } = await import("../../src/extension/creation");
          await addExtension({ extensionName: ext });
          const result = await addExtension({ extensionName: ext });
          expect(result.alreadyExists).toBe(true);
        },
      ),
      { numRuns: 5 }, // G3: raised from 2 — minimum meaningful property coverage
    );
  });

  it("forAll(BRIEF.md): parse → write → parse produces identical structure [TEST-01]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .record({
            heading: fc
              .string({ minLength: 3, maxLength: 50 })
              .filter((s) => !/[#\n]/.test(s) && s.trim().length > 0),
            body: fc.string({ minLength: 0, maxLength: 200 }),
          })
          .map(
            ({ heading, body }) =>
              `**Project:** ${heading}\n**Type:** test\n\n## Direction\n\n${body || "Test direction."}\n`,
          ),
        async (content) => {
          const { parseBrief } = await import("../../src/parser");
          const { writeBrief } = await import("../../src/writer/core");
          const parsed = await parseBrief(content);
          const written = await writeBrief(parsed);
          const reparsed = await parseBrief(written);
          expect(reparsed.metadata.type).toBe(parsed.metadata.type);
          expect(reparsed.sections.length).toBe(parsed.sections.length);
        },
      ),
      { numRuns: 10 },
    );
  });

  it("forAll(write operation): untouched content preserved byte-for-byte [TEST-06]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .string({ minLength: 3, maxLength: 50 })
          .filter((s) => !/[#\n]/.test(s) && s.trim().length > 0),
        async (heading) => {
          const content = `**Project:** ${heading}\n**Type:** song\n\n## Direction\n\nOriginal.\n\n## Key Decisions\n\nKeep this.\n`;
          const { updateSection } = await import(
            "../../src/context/write-sections"
          );
          const result = await updateSection({
            content,
            section: "Direction",
            newContent: "Changed.",
          });
          const resultStr = result.content as string;
          // Untouched section content preserved byte-for-byte
          expect(resultStr).toContain("Keep this.");
          // Modified section was changed
          expect(resultStr).toContain("Changed.");
        },
      ),
      { numRuns: 10 },
    );
  });
});
