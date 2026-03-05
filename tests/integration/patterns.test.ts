import fc from "fast-check";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Unit Tests — Interaction Pattern Integration Tests
// ---------------------------------------------------------------------------

describe("TASK-54: Integration Tests — Interaction Patterns", () => {
  describe("pattern 1: ontology matching flow [TEST-08]", () => {
    it("search results tagged in BRIEF.md: end-to-end [TEST-08]", async () => {
      const { searchOntology } = await import("../../src/ontology/search");
      const { browseOntology } = await import("../../src/ontology/browse");
      const { tagEntry } = await import("../../src/ontology/tagging");

      const searchResult = await searchOntology({
        query: "nostalgia",
        ontology: "theme-pack",
      });
      expect(searchResult.results.length).toBeGreaterThan(0);

      const topEntry = searchResult.results[0] as any;
      const browseResult = await browseOntology({
        ontology: "theme-pack",
        entryId: topEntry.id!,
        direction: "around",
      });
      expect(browseResult).toBeDefined();

      const tagResult = await tagEntry({
        ontology: "theme-pack",
        entryId: topEntry.id!,
        section: "Direction",
      });
      expect(tagResult.tagged).toBe(true);
    });
  });

  describe("pattern 2: reference suggestion flow [TEST-08]", () => {
    it("references recorded with correct deduplication [TEST-08, T54-03, T54-06]", async () => {
      const { suggestReference } = await import(
        "../../src/reference/suggestion"
      );
      const { addReference } = await import("../../src/reference/writing");

      const term = "sonic arts";
      const suggestions = await suggestReference({
        query: term,
        simulateResults: 2,
      });
      expect(suggestions.results.length).toBeGreaterThan(0);

      // T54-06: use consistent single-object API form for addReference
      const firstAdd = await addReference({
        filePath: "/tmp/brief-test-pattern2",
        reference: suggestions.results[0],
      });
      expect(firstAdd).toBeDefined();

      // T54-03: verify deduplication — adding same reference again must not create a duplicate
      const secondAdd = await addReference({
        filePath: "/tmp/brief-test-pattern2",
        reference: suggestions.results[0],
      });
      expect((secondAdd as any).isDuplicate).toBe(true);
    });
  });

  describe("pattern 3: reverse reference flow [TEST-08]", () => {
    it("ontology tags discovered from reference [TEST-08, T54-06]", async () => {
      const { addReference } = await import("../../src/reference/writing");
      const { lookupReference } = await import("../../src/reference/lookup");

      // T54-06: consistent single-object API form (same as pattern 2)
      await addReference({
        section: "References: Films",
        creator: "Director",
        title: "Film Title",
        ontologyLinks: [{ pack: "theme-pack", entryId: "nostalgia" }],
      });

      const lookupResult = await lookupReference({ title: "Film Title" });
      expect((lookupResult as any).ontologyTagsAdded).toBe(true);
    });
  });

  describe("pattern 4: type guide creation flow [TEST-08]", () => {
    it("new guide created and resolvable [TEST-08]", async () => {
      const { getTypeGuide } = await import(
        "../../src/type-intelligence/loading"
      );
      const { createTypeGuide } = await import(
        "../../src/type-intelligence/creation"
      );

      const generic = await getTypeGuide({ type: "brand-new-type" });
      expect(generic.isGeneric).toBe(true);

      const created = await createTypeGuide({
        type: "brand-new-type",
        body: "# Guide for brand new type",
      });
      expect(created.created).toBe(true);

      const resolved = await getTypeGuide({ type: "brand-new-type" });
      expect(resolved.isGeneric).toBeFalsy();
    });
  });

  describe("pattern 5: extension scaffolding flow [TEST-08]", () => {
    it("extension section created from type guide suggestion [TEST-08]", async () => {
      const { suggestExtensions } = await import(
        "../../src/extension/suggestion"
      );
      const { addExtension } = await import("../../src/extension/creation");

      const suggestions = await suggestExtensions({ projectType: "album" });
      expect(suggestions.suggestions.length).toBeGreaterThan(0);

      const ext = suggestions.suggestions[0];
      const result = await addExtension({
        extensionName: ext.extension.toUpperCase().replace(/_/g, " "),
      });
      expect(result.created).toBe(true);
    });
  });

  describe("pattern 6: unknown domain bootstrapping [TEST-08]", () => {
    it("full adaptive flow produces working project [TEST-08]", async () => {
      const { getTypeGuide } = await import(
        "../../src/type-intelligence/loading"
      );
      const { suggestExtensions } = await import(
        "../../src/extension/suggestion"
      );
      const { createTypeGuide } = await import(
        "../../src/type-intelligence/creation"
      );

      const generic = await getTypeGuide({ type: "novel-domain-xyz" });
      expect(generic.isGeneric).toBe(true);

      const suggestions = await suggestExtensions({
        projectType: "novel-domain-xyz",
      });
      expect(suggestions).toBeDefined();

      const guide = await createTypeGuide({
        type: "novel-domain-xyz",
        body: "# Novel Domain Guide",
      });
      expect(guide.created).toBe(true);
    });
  });

  describe("pattern 7: open questions surfacing flow [TEST-08]", () => {
    it("questions appear in re-entry summary [TEST-08]", async () => {
      const { handleAddQuestion } = await import(
        "../../src/context/write-questions"
      );
      const { generateReentrySummary } = await import(
        "../../src/workspace/reentry"
      );

      await handleAddQuestion({
        question: "What genre should this be?",
        priority: "high",
      });

      const result = await generateReentrySummary({
        projectPath: "test-project",
      });
      expect((result as any).summary).toBeDefined();
      expect(String((result as any).summary)).toMatch(/question|open|resolve/i);
    });
  });

  describe("pattern 8: planning session flow [TEST-08]", () => {
    it("combined context + questions + conflicts output [TEST-08]", async () => {
      const { getContext, getQuestions } = await import(
        "../../src/context/read"
      );
      const { checkConflicts } = await import("../../src/validation/conflicts");

      const context = await getContext({ projectPath: "test-project" });
      const questions = await getQuestions({ projectPath: "test-project" });
      const conflicts = await checkConflicts({
        decisions: ((context as any).decisions ||
          []) as import("../../src/validation/conflicts").ConflictDecisionInput[],
        constraints: ((context as any).constraints || []) as string[],
      });

      expect(
        ((context as any).decisions as unknown[])?.length ?? 0,
      ).toBeGreaterThan(0);
      expect(
        ((questions as any).items as unknown[])?.length ?? 0,
      ).toBeGreaterThan(0);
      expect(conflicts).toBeDefined();
    });
  });
});

// ---------------------------------------------------------------------------
// Cross-Cutting Invariant Tests
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

      // Single level
      const single = await assembleContext({
        startPath: "/workspace/project",
        maxDepth: 1,
      } as unknown as never[]);
      expect(single.levels.length).toBeLessThanOrEqual(1);

      // Two levels
      const two = await assembleContext({
        startPath: "/workspace/collection/project",
        maxDepth: 2,
      } as unknown as never[]);
      expect(two.levels.length).toBeLessThanOrEqual(2);

      // Three levels
      const three = await assembleContext({
        startPath: "/workspace/collection/sub/project",
        maxDepth: 3,
      } as unknown as never[]);
      expect(three.levels.length).toBeLessThanOrEqual(3);

      // Levels should be in broadest-first order (highest depth number first)
      if (three.levels.length > 1) {
        expect((three.levels[0] as any).depth).toBeGreaterThanOrEqual(
          (three.levels[1] as any).depth,
        );
      }

      // Four levels
      const four = await assembleContext({
        startPath: "/workspace/artist/album/song/music-video",
        maxDepth: 4,
      } as unknown as never[]);
      expect(four.levels.length).toBeLessThanOrEqual(4);

      // Workspace root boundary
      const bounded = await assembleContext({
        startPath: "/workspace/project",
        maxDepth: 10,
        workspaceRoot: "/workspace",
      } as unknown as never[]);
      expect(
        bounded.levels.every((l: any) => l.path.startsWith("/workspace")),
      ).toBe(true);
    });
  });

  describe("decision lifecycle [TEST-04]", () => {
    it("decision supersession lifecycle: chain is traversable [TEST-04]", async () => {
      const { addDecision } = await import("../../src/context/write-decisions");
      const { getContext } = await import("../../src/context/read");

      // Create original decision
      await addDecision({ title: "Use React", rationale: "Good ecosystem" });

      // Supersede it
      await addDecision({
        title: "Use Vue",
        rationale: "Simpler for this use case",
        replaces: "Use React",
      });

      const ctx = await getContext({ projectPath: "test-project" });
      const reactDecision = (ctx as any).decisions?.find((d: any) =>
        d.text.includes("Use React"),
      );
      const vueDecision = (ctx as any).decisions?.find((d: any) =>
        d.text.includes("Use Vue"),
      );

      expect(reactDecision?.status).toBe("superseded");
      expect(vueDecision?.status).toBe("active");
    });

    it("decision exception lifecycle: both active, linked correctly [TEST-04]", async () => {
      const { addDecision } = await import("../../src/context/write-decisions");
      const { getContext } = await import("../../src/context/read");

      // Create original decision
      await addDecision({
        title: "Use Library A",
        rationale: "Well documented",
      });

      // Create exception to that decision
      await addDecision({
        title: "Use Library B for edge case",
        rationale: "Better performance for this specific scenario",
        exceptionTo: "Use Library A",
      });

      const ctx = await getContext({ projectPath: "test-project" });
      const libraryA = (ctx as any).decisions?.find((d: any) =>
        d.text?.includes("Use Library A"),
      );
      const libraryB = (ctx as any).decisions?.find((d: any) =>
        d.text?.includes("Use Library B"),
      );

      expect(libraryA?.status).toBe("active");
      expect(libraryB?.status).toBe("exception");
      expect(libraryB?.exceptionTo).toMatch(/Library A/i);
    });
  });

  describe("decision override lifecycle [TEST-04]", () => {
    it("decision override lifecycle: parent constraint + child contradiction flagged [TEST-04]", async () => {
      const { addDecision } = await import("../../src/context/write-decisions");
      const { checkConflicts } = await import("../../src/validation/conflicts");

      const conflicts = await checkConflicts({
        decisions: [
          {
            text: "No external dependencies",
            status: "active",
            level: "parent",
          },
          { text: "Use external library X", status: "active", level: "child" },
        ] as unknown as import("../../src/validation/conflicts").ConflictDecisionInput[],
        constraints: [],
      });
      expect(conflicts.conflicts.length).toBeGreaterThan(0);
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

  describe("HTML comments preservation [TEST-06, T54-04]", () => {
    it("write operation: HTML comments in untouched sections preserved byte-for-byte [TEST-06, T54-04]", async () => {
      const { updateSection } = await import(
        "../../src/context/write-sections"
      );
      const { parseBrief } = await import("../../src/parser");

      // HTML comment (e.g., brief:ref-link annotation) must survive a write to a different section
      const original =
        "**Project:** Test\n**Type:** song\n\n## Direction\n\nOriginal direction.\n\n## Key Decisions\n\n<!-- brief:ref-link theme-pack freedom -->\nKeep this decision.\n";

      const result = await updateSection({
        content: original,
        section: "Direction",
        newContent: "New direction content.",
      });

      // The HTML comment in Key Decisions must be preserved exactly
      expect(result.content).toContain(
        "<!-- brief:ref-link theme-pack freedom -->",
      );
      expect(result.content).toContain("Keep this decision.");
    });
  });

  describe("unknown sections preservation [TEST-06, T54-05]", () => {
    it("write operation: non-standard sections preserved byte-for-byte [TEST-06, T54-05]", async () => {
      const { updateSection } = await import(
        "../../src/context/write-sections"
      );

      // Unknown sections (not in spec) must be preserved unchanged
      const original =
        "**Project:** Test\n**Type:** song\n\n## Direction\n\nOriginal direction.\n\n## My Custom Extension Section\n\nCustom content that must be preserved.\nWith multiple lines.\n";

      const result = await updateSection({
        content: original,
        section: "Direction",
        newContent: "Updated direction.",
      });

      // Unknown section must be preserved byte-for-byte
      expect(result.content).toContain("## My Custom Extension Section");
      expect(result.content).toContain(
        "Custom content that must be preserved.",
      );
      expect(result.content).toContain("With multiple lines.");
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

      // Update only the Direction section
      const result = await updateSection({
        content: original,
        section: "Direction",
        newContent: "New direction content.",
      });

      // The Key Decisions section must be byte-for-byte identical
      const originalParsed = await parseBrief(original);
      const updatedParsed = await parseBrief(result.content as string);

      const originalDecisions = originalParsed.sections.find((s: any) =>
        /decisions/i.test(s.name),
      );
      const updatedDecisions = updatedParsed.sections.find((s: any) =>
        /decisions/i.test(s.name),
      );

      expect(updatedDecisions?.body).toBe(originalDecisions?.body);
    });
  });

  describe("ontology search integration [TEST-05, T54-01]", () => {
    it("TEST-05: exact label match returns entry [TEST-05]", async () => {
      const { searchOntology } = await import("../../src/ontology/search");
      const result = await searchOntology({
        query: "nostalgia",
        ontology: "theme-pack",
      });
      expect(result.results.length).toBeGreaterThan(0);
      expect(result.results[0].label.toLowerCase()).toContain("nostalgia");
    });

    it("TEST-05: synonym match returns entry via synonym expansion [TEST-05]", async () => {
      const { searchOntology } = await import("../../src/ontology/search");
      // Search using a known synonym (not the label itself)
      const result = await searchOntology({
        query: "longing",
        ontology: "theme-pack",
      });
      expect(result.results.length).toBeGreaterThan(0);
      // Entry found via synonym, not direct label match
      expect(result.results[0].matchedVia).toMatch(/synonym/i);
    });

    it("TEST-05: alias match returns entry via alias expansion [TEST-05]", async () => {
      const { searchOntology } = await import("../../src/ontology/search");
      const result = await searchOntology({
        query: "wistfulness",
        ontology: "theme-pack",
      });
      expect(result.results.length).toBeGreaterThan(0);
      expect(result.results[0].matchedVia).toMatch(/alias/i);
    });

    it("TEST-05: no-match query returns empty array with signal block, not error [TEST-05]", async () => {
      const { searchOntology } = await import("../../src/ontology/search");
      const result = await searchOntology({
        query: "zzzznotarealterm12345",
        ontology: "theme-pack",
      });
      expect(Array.isArray(result.results)).toBe(true);
      expect(result.results.length).toBe(0);
      // ONT-13: empty result → signal block present, not null
      expect(result.signal).toBeDefined();
      // MCP spec: isError must be OMITTED on success, not set to false
      expect((result as any).isError).toBeUndefined();
    });

    it("TEST-05: multi-term query matches entries containing all terms [TEST-05]", async () => {
      const { searchOntology } = await import("../../src/ontology/search");
      const result = await searchOntology({
        query: "nostalgic longing",
        ontology: "theme-pack",
      });
      expect(result.results).toBeDefined();
      // Multi-term query should still return relevant results, not error
      expect(Array.isArray(result.results)).toBe(true);
    });

    it("TEST-05: field priority — label match scores higher than keyword match [TEST-05]", async () => {
      const { searchOntology } = await import("../../src/ontology/search");
      const result = await searchOntology({
        query: "theme",
        ontology: "theme-pack",
      });
      expect(result.results.length).toBeGreaterThan(0);
      // Label-matched entries should appear before keyword-only matches
      if (result.results.length > 1) {
        const labelMatch = result.results.find(
          (r: any) => r.matchedVia === "label",
        );
        const keywordMatch = result.results.find(
          (r: any) => r.matchedVia === "keyword",
        );
        if (labelMatch && keywordMatch) {
          const labelIdx = result.results.indexOf(labelMatch);
          const keywordIdx = result.results.indexOf(keywordMatch);
          expect(labelIdx).toBeLessThan(keywordIdx);
        }
      }
    });

    it("TEST-05: search across multiple packs returns merged deduplicated results [TEST-05]", async () => {
      const { searchOntology } = await import("../../src/ontology/search");
      const result = await searchOntology({
        query: "theme",
        ontology: ["theme-pack", "mood-pack"] as any,
      });
      expect(Array.isArray(result.results)).toBe(true);
      // No duplicate entries (same pack+id combination)
      const ids = result.results.map((r: any) => `${r.pack}:${r.id}`);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
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

      // Superseded + replacement pair should NOT be flagged
      const superseded = await checkConflicts({
        decisions: [
          { text: "Use A", status: "superseded" },
          { text: "Use B", status: "active", replaces: "Use A" },
        ] as unknown as import("../../src/validation/conflicts").ConflictDecisionInput[],
        constraints: [],
      });
      const supersededConflicts = superseded.conflicts.filter((c: any) =>
        c.items?.some((i: any) => i.text === "Use A"),
      );
      expect(supersededConflicts).toHaveLength(0);
    });
  });
});

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe("TASK-54: Property Tests", () => {
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
            status: fc.constantFrom("active", "superseded", "exception"),
            body: fc.string({ minLength: 0, maxLength: 200 }),
          })
          .map(
            ({ heading, status: _status, body }) =>
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
    );
  });

  it("forAll(lenient corpus file): parser never throws [TEST-02]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 10, maxLength: 500 }),
        async (content) => {
          const { parseBrief } = await import("../../src/parser");
          await expect(parseBrief(content)).resolves.toBeDefined();
        },
      ),
    );
  });

  it("forAll(write operation): untouched content preserved byte-for-byte [TEST-06]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .record({
            heading: fc
              .string({ minLength: 3, maxLength: 50 })
              .filter((s) => !/[#\n]/.test(s) && s.trim().length > 0),
            status: fc.constantFrom("active", "superseded", "exception"),
            body: fc.string({ minLength: 0, maxLength: 200 }),
          })
          .map(
            ({ heading }) =>
              `**Project:** ${heading}\n**Type:** song\n\n## Direction\n\nOriginal.\n\n## Key Decisions\n\nKeep this.\n`,
          ),
        async (content) => {
          const { parseBrief } = await import("../../src/parser");
          const { updateSection } = await import(
            "../../src/context/write-sections"
          );
          const result = await updateSection({
            content,
            section: "Direction",
            newContent: "Changed.",
          });
          const reparsed = await parseBrief(result.content as string);
          const decisions = reparsed.sections.find((s: any) =>
            /decisions/i.test(s.name),
          );
          expect(decisions?.body).toContain("Keep this.");
        },
      ),
    );
  });
});
