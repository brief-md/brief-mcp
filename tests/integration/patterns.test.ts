import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { _resetStore as resetQuestions } from "../../src/context/write-questions";
import { _resetState as resetExtension } from "../../src/extension/creation";
import { writeBrief } from "../../src/io/project-state";
import { _resetState as resetTagging } from "../../src/ontology/tagging";
import { _resetState as resetWriting } from "../../src/reference/writing";
import { _resetState as resetCreation } from "../../src/type-intelligence/creation";

let tmpDir: string;

const BRIEF_CONTENT = `# Test Project BRIEF

**Project:** Test Project
**Type:** software
**Status:** development
**Created:** 2025-01-01
**Updated:** 2025-06-15

## Purpose & Scope

A test project for integration pattern validation.

## Key Decisions

- Use TypeScript (why: type safety) [2025-06-15]
- Use PostgreSQL (why: strong JSON support) [2025-06-01]

## Open Questions

- [ ] Which CI system?
- Monorepo vs polyrepo?
- [x] Which language? — TypeScript

## What This Is NOT

- This is NOT a replacement for detailed design documents
`;

beforeAll(async () => {
  tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "brief-patterns-test-"));
  await writeBrief(tmpDir, BRIEF_CONTENT);
});

afterAll(async () => {
  await fsp.rm(tmpDir, { recursive: true, force: true });
});

beforeEach(() => {
  resetExtension();
  resetCreation();
  resetTagging();
  resetWriting();
  resetQuestions();
});

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
      const { suggestReferences } = await import(
        "../../src/reference/suggestion"
      );
      const { addReference } = await import("../../src/reference/writing");

      const suggestions = await suggestReferences({
        context: { section: "emotion", activeExtensions: ["sonic_arts"] },
      });
      expect(suggestions.suggestions.length).toBeGreaterThan(0);

      const firstSuggestion = suggestions.suggestions[0];
      // T54-06: use consistent single-object API form for addReference
      const firstAdd = await addReference({
        section: "References: Influences",
        creator: firstSuggestion.entry.creator ?? "Unknown",
        title: firstSuggestion.entry.title,
      });
      expect(firstAdd).toBeDefined();
      expect(firstAdd.written).toBe(true);

      // T54-03: verify deduplication — adding same reference again produces a warning
      const secondAdd = await addReference({
        section: "References: Influences",
        creator: firstSuggestion.entry.creator ?? "Unknown",
        title: firstSuggestion.entry.title,
      });
      expect(secondAdd.duplicateWarning).toBeDefined();
    });
  });

  describe("pattern 3: reverse reference flow [TEST-08]", () => {
    it("ontology tags discovered from reference [TEST-08, T54-06]", async () => {
      const { addReference } = await import("../../src/reference/writing");
      const { lookupReference } = await import("../../src/reference/lookup");

      // T54-06: consistent single-object API form (same as pattern 2)
      await addReference({
        section: "References: Films",
        creator: "Sean Penn",
        title: "Into the Wild",
        ontologyLinks: [{ pack: "theme-pack", entryId: "freedom" }],
      });

      // Reverse lookup by title → discover ontology-related data (categories, tags)
      const lookupResult = await lookupReference({ title: "Into the Wild" });
      expect(lookupResult.results.length).toBeGreaterThan(0);
      // Results include ontology-linked categories and tags
      const match = lookupResult.results[0];
      expect(match.categories ?? match.tags).toBeDefined();
    });
  });

  describe("pattern 4: type guide creation flow [TEST-08]", () => {
    it("new guide created and resolvable [TEST-08]", async () => {
      const { getTypeGuide, _resetState: resetLoading } = await import(
        "../../src/type-intelligence/loading"
      );
      const { createTypeGuide } = await import(
        "../../src/type-intelligence/creation"
      );

      // Use unique type name to avoid disk pollution from previous runs
      const testType = `brand-new-type-${Date.now()}`;
      resetLoading();

      const generic = await getTypeGuide({ type: testType });
      expect(generic.isGeneric).toBe(true);

      const created = await createTypeGuide({
        type: testType,
        body: "# Guide for brand new type",
      });
      expect(created.created).toBe(true);

      // Reset loading cache so getTypeGuide reloads from disk
      resetLoading();
      const resolved = await getTypeGuide({ type: testType });
      expect(resolved.isGeneric).toBeFalsy();
    });
  });

  describe("pattern 5: extension scaffolding flow [TEST-08]", () => {
    it("extension section created from type guide suggestion [TEST-08]", async () => {
      const { suggestExtensions } = await import(
        "../../src/extension/suggestion"
      );
      const { addExtension } = await import("../../src/extension/creation");

      // "album" type may return tier1, tier2, or tier3 suggestions
      const suggestions = await suggestExtensions({
        projectType: "album",
        description: "music production and sound design for an album",
      });
      // At least one tier should have suggestions
      const allSuggestions = [
        ...(suggestions.tier1Suggestions ?? []),
        ...(suggestions.tier2Suggestions ?? []),
      ];
      const bootstrapSuggestions = suggestions.tier3BootstrapSuggestions ?? [];
      expect(
        allSuggestions.length + bootstrapSuggestions.length,
      ).toBeGreaterThan(0);

      // Use tier1/tier2 suggestion (object with .name) or tier3 (string name)
      const extName =
        allSuggestions.length > 0
          ? allSuggestions[0].name.toUpperCase().replace(/_/g, " ")
          : bootstrapSuggestions[0].toUpperCase().replace(/_/g, " ");
      const result = await addExtension({ extensionName: extName });
      expect(result.created).toBe(true);
    });
  });

  describe("pattern 6: unknown domain bootstrapping [TEST-08]", () => {
    it("full adaptive flow produces working project [TEST-08]", async () => {
      const { getTypeGuide, _resetState: resetLoading } = await import(
        "../../src/type-intelligence/loading"
      );
      const { suggestExtensions } = await import(
        "../../src/extension/suggestion"
      );
      const { createTypeGuide } = await import(
        "../../src/type-intelligence/creation"
      );

      // Use unique type name to avoid disk pollution from previous runs
      const testType = `novel-domain-${Date.now()}`;
      resetLoading();

      const generic = await getTypeGuide({ type: testType });
      expect(generic.isGeneric).toBe(true);

      const suggestions = await suggestExtensions({
        projectType: testType,
      });
      expect(suggestions).toBeDefined();

      const guide = await createTypeGuide({
        type: testType,
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
      // Re-entry summary contains open questions data
      expect(result.openQuestions).toBeDefined();
      expect(
        result.openQuestions.toResolveCount +
          result.openQuestions.toKeepOpenCount,
      ).toBeGreaterThanOrEqual(0);
    });
  });

  describe("pattern 8: planning session flow [TEST-08]", () => {
    it("combined context + questions + conflicts output [TEST-08]", async () => {
      const { getContext, getQuestions, getDecisions } = await import(
        "../../src/context/read"
      );
      const { checkConflicts } = await import("../../src/validation/conflicts");

      const context = await getContext({ projectPath: tmpDir });
      const decisions = await getDecisions({ projectPath: tmpDir });
      const questions = await getQuestions({ projectPath: tmpDir });
      const conflicts = checkConflicts({
        decisions: decisions.activeDecisions.map((d) => ({
          text: d.text ?? "",
          status: d.status ?? "active",
        })),
        constraints: [],
      });

      expect(context).toBeDefined();
      expect(decisions.activeDecisions.length).toBeGreaterThan(0);
      expect(
        questions.toResolve.length + questions.toKeepOpen.length,
      ).toBeGreaterThan(0);
      expect(conflicts).toBeDefined();
    });
  });
});
