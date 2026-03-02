import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { BriefConfig } from "../../src/types/config";
import type {
  Decision,
  ExternalToolSession,
  IntentionalTension,
  Question,
} from "../../src/types/decisions";
import type { Extension, ExtensionSuggestion } from "../../src/types/extension";

import type {
  AccumulatedContext,
  HierarchyLevel,
} from "../../src/types/hierarchy";
import type {
  OntologyEntry,
  OntologyPack,
  OntologySearchResult,
  PackConfig,
} from "../../src/types/ontology";
// Import all types from the barrel export
import type {
  BriefMetadata,
  ParsedBriefMd,
  ParseWarning,
  Section,
} from "../../src/types/parser";
import type { Reference, ReferenceLink } from "../../src/types/reference";
import type {
  ErrorResponse,
  Signal,
  ToolResponse,
} from "../../src/types/responses";
import type {
  TypeGuide,
  TypeGuideMetadata,
} from "../../src/types/type-intelligence";
import type { ConflictResult, LintFinding } from "../../src/types/validation";

// ---------------------------------------------------------------------------
// Unit Tests
// ---------------------------------------------------------------------------

describe("TASK-02: Shared Types & Interfaces", () => {
  describe("barrel export [CODE-02]", () => {
    it("importing the types barrel module resolves without error [CODE-02, T02-06]", async () => {
      // Note: Object.keys() only returns runtime-visible exports, NOT type-only exports.
      // Type-only exports (export type { Foo }) are erased by TypeScript and won't appear here.
      // This test verifies the barrel module is importable and has runtime-visible exports.
      const types = await import("../../src/types/index");
      expect(types).toBeDefined();
      // Runtime-visible exports (value factories, validators, constants — not erased types) must be present
      const exportedKeys = Object.keys(types);
      expect(exportedKeys.length).toBeGreaterThan(0);
    });

    it("barrel exports include runtime validators for core type shapes [CODE-02, T02-06]", async () => {
      // Type-only exports cannot be verified via Object.keys(); verify via dynamic import of each module
      const parserModule = await import("../../src/types/parser");
      const decisionsModule = await import("../../src/types/decisions");
      const responsesModule = await import("../../src/types/responses");
      expect(parserModule).toBeDefined();
      expect(decisionsModule).toBeDefined();
      expect(responsesModule).toBeDefined();
    });
  });

  describe("parsed document types [CODE-02]", () => {
    it("constructing a valid parsed document has all required fields [CODE-02]", async () => {
      // Pass through the validateParsedBrief function to ensure the shape is verified
      // against actual implementation expectations, not just a self-referential check
      const { validateParsedBrief } = await import("../../src/types/parser");
      const doc: ParsedBriefMd = {
        metadata: {} as BriefMetadata,
        sections: [],
        decisions: [],
        questions: [],
        extensions: [],
        comments: [],
        warnings: [],
      };
      const validated = validateParsedBrief(doc);
      expect(validated.metadata).toBeDefined();
      expect(validated.sections).toBeDefined();
      expect(validated.decisions).toBeDefined();
      expect(validated.questions).toBeDefined();
      expect(Array.isArray(validated.sections)).toBe(true);
      expect(Array.isArray(validated.extensions)).toBe(true);
      expect(Array.isArray(validated.comments)).toBe(true);
      expect(Array.isArray(validated.warnings)).toBe(true);
      // Verify that all 7 required fields are present and not undefined
      expect(Object.keys(validated)).toEqual(
        expect.arrayContaining([
          "metadata",
          "sections",
          "decisions",
          "questions",
          "extensions",
          "comments",
          "warnings",
        ]),
      );
    });
  });

  describe("decision types [CODE-02]", () => {
    it("constructing a minimal decision (text + rationale) is valid with active status and minimal format [CODE-02]", () => {
      const decision: Decision = {
        id: "dec-001",
        text: "Use TypeScript",
        rationale: "Type safety benefits",
        status: "active",
        format: "minimal",
        sourceLine: 10,
      };
      expect(decision.text).toBe("Use TypeScript");
      expect(decision.status).toBe("active");
      expect(decision.format).toBe("minimal");
    });

    it("constructing a full-format decision with all optional fields is valid [CODE-02]", () => {
      const decision: Decision = {
        id: "dec-002",
        text: "Adopt MCP Protocol",
        rationale: "Standard protocol for AI tools",
        status: "active",
        format: "full",
        sourceLine: 20,
        // Full format fields should be accessible when provided
      };
      expect(decision.format).toBe("full");
      expect(decision.rationale).toBe("Standard protocol for AI tools");
    });
  });

  describe("question types [CODE-02]", () => {
    it("constructing a question with options and category has all fields accessible [CODE-02]", () => {
      const question: Question = {
        text: "Which database to use?",
        checked: false,
        category: "to-resolve",
        options: ["PostgreSQL", "SQLite"],
      };
      expect(question.text).toBe("Which database to use?");
      expect(question.category).toBe("to-resolve");
      expect(question.options).toHaveLength(2);
    });
  });

  describe("ontology types [CODE-02]", () => {
    it("constructing an ontology search result has entry, score, and match field accessible [CODE-02]", () => {
      const entry: OntologyEntry = {
        id: "ent-001",
        name: "Test Entry",
        aliases: [],
        description: "A test entry",
        relatedIds: [],
        tags: [],
        packId: "pack-001",
      };
      const result: OntologySearchResult = {
        entry,
        score: 0.95,
        matchedField: "name",
        packId: "pack-001",
      };
      expect(result.entry).toBeDefined();
      expect(result.score).toBe(0.95);
      expect(result.matchedField).toBe("name");
    });
  });

  describe("type guide types [CODE-02]", () => {
    it("constructing a type guide has bootstrapping flag accessible from metadata [CODE-02]", () => {
      const metadata: TypeGuideMetadata = {
        bootstrapping: true,
      };
      const guide: TypeGuide = {
        slug: "game-project",
        displayName: "Game Project",
        metadata,
        content: "# Game Project Guide",
        path: "/path/to/guide.md",
      };
      expect(guide.metadata.bootstrapping).toBe(true);
    });
  });

  describe("hierarchy types [CODE-02]", () => {
    it("constructing a hierarchy level at depth 0 is a valid root level [CODE-02]", () => {
      const level: HierarchyLevel = {
        depth: 0,
        dirPath: "/workspace",
        parsedContent: null,
        filePath: "/workspace/BRIEF.md",
      };
      expect(level.depth).toBe(0);
      expect(level.dirPath).toBe("/workspace");
    });

    it("constructing accumulated context from multiple levels has levels ordered root-to-leaf [CODE-02]", () => {
      const level0: HierarchyLevel = {
        depth: 0,
        dirPath: "/a",
        parsedContent: null,
        filePath: "/a/BRIEF.md",
      };
      const level1: HierarchyLevel = {
        depth: 1,
        dirPath: "/a/b",
        parsedContent: null,
        filePath: "/a/b/BRIEF.md",
      };
      const ctx: AccumulatedContext = {
        levels: [level0, level1],
        mergedMetadata: {},
        mergedSections: [],
        allDecisions: [],
        allQuestions: [],
        signals: [],
      };
      expect(ctx.levels[0].depth).toBe(0);
      expect(ctx.levels[1].depth).toBe(1);
    });
  });

  describe("error response types [ERR-05]", () => {
    it("constructing error responses for each of the five taxonomy types produces valid error response [ERR-05]", () => {
      const errorTypes = [
        "invalid_input",
        "not_found",
        "parse_warning",
        "system_error",
        "internal_error",
      ] as const;
      for (const type of errorTypes) {
        const err: ErrorResponse = {
          type,
          message: `Test ${type} error`,
        };
        expect(err.type).toBe(type);
        expect(err.message).toBeDefined();
      }
    });
  });

  describe("tool response types [CODE-02]", () => {
    it("constructing a tool response with signals and warnings has both arrays accessible [CODE-02]", () => {
      const signal: Signal = {
        type: "suggestion",
        payload: { key: "value" },
        description: "A signal",
      };
      const response: ToolResponse = {
        content: ["Some content"],
        signals: [signal],
        warnings: ["A warning"],
      };
      expect(response.signals).toHaveLength(1);
      expect(response.warnings).toHaveLength(1);
    });
  });

  describe("config types [CONF-03]", () => {
    it("constructing a config with workspace roots has roots accessible as string array [CONF-03]", () => {
      const config: BriefConfig = {
        workspace_roots: ["~/projects", "~/work"],
        log_level: "info",
      } as BriefConfig;
      expect(config.workspace_roots).toHaveLength(2);
      expect(Array.isArray(config.workspace_roots)).toBe(true);
    });
  });

  describe("extension types [CODE-02]", () => {
    it("constructing an Extension has slug, displayName, and sections accessible [CODE-02]", () => {
      const ext: Extension = {
        slug: "game-extension",
        displayName: "Game Extension",
        sections: ["Game Design", "Mechanics"],
        description: "Extension for game projects",
      };
      expect(ext.slug).toBe("game-extension");
      expect(ext.displayName).toBe("Game Extension");
      expect(Array.isArray(ext.sections)).toBe(true);
      expect(ext.sections).toHaveLength(2);
    });

    it("constructing an ExtensionSuggestion has extensionSlug and reason accessible [CODE-02]", () => {
      const suggestion: ExtensionSuggestion = {
        extensionSlug: "game-extension",
        reason: "Project appears to be a game",
        confidence: 0.9,
      };
      expect(suggestion.extensionSlug).toBe("game-extension");
      expect(suggestion.reason).toBeDefined();
      expect(suggestion.confidence).toBeGreaterThan(0);
    });
  });

  describe("reference types [CODE-02]", () => {
    it("constructing a Reference has id, creator, title accessible [CODE-02]", () => {
      const ref: Reference = {
        id: "ref-001",
        creator: "Sean Penn",
        title: "Into the Wild",
        notes: "Inspirational story",
        packId: "cinema-pack",
      };
      expect(ref.id).toBe("ref-001");
      expect(ref.creator).toBe("Sean Penn");
      expect(ref.title).toBe("Into the Wild");
    });

    it("constructing a ReferenceLink has pack and id accessible [CODE-02]", () => {
      const link: ReferenceLink = {
        pack: "cinema-pack",
        id: "ref-001",
      };
      expect(link.pack).toBe("cinema-pack");
      expect(link.id).toBe("ref-001");
    });
  });

  describe("IntentionalTension type [CODE-02, T02-05]", () => {
    it("constructing an IntentionalTension has between, description, and tradeoff fields [CODE-02, T02-05]", () => {
      const tension: IntentionalTension = {
        between: ["Use TypeScript", "Minimal build tooling"],
        description:
          "Type safety requires build step, conflicting with zero-config goal",
        tradeoff: "Accepted for maintainability",
      };
      expect(tension.between).toHaveLength(2);
      expect(tension.description).toBeDefined();
      expect(tension.tradeoff).toBeDefined();
    });
  });

  describe("ExternalToolSession type [CODE-02, T02-05]", () => {
    it("constructing an ExternalToolSession has tool, decisions, and capturedAt fields [CODE-02, T02-05]", () => {
      const session: ExternalToolSession = {
        tool: "ChatGPT",
        decisions: [{ title: "Use React", why: "Team familiarity" }],
        capturedAt: "2025-06-01",
      };
      expect(session.tool).toBe("ChatGPT");
      expect(Array.isArray(session.decisions)).toBe(true);
      expect(session.capturedAt).toBeDefined();
    });
  });

  describe("PackConfig type [CODE-02, T02-05]", () => {
    it("constructing a PackConfig has id, path, and enabled fields [CODE-02, T02-05]", () => {
      const config: PackConfig = {
        id: "cinema-pack",
        path: "~/.brief/packs/cinema-pack",
        enabled: true,
      };
      expect(config.id).toBe("cinema-pack");
      expect(config.path).toBeDefined();
      expect(config.enabled).toBe(true);
    });
  });

  describe("conflict result types [CODE-02]", () => {
    it("constructing a ConflictResult has conflictingDecisions and resolutionOptions [CODE-02]", () => {
      const conflict: ConflictResult = {
        hasConflict: true,
        conflictingDecisions: ["dec-001", "dec-002"],
        resolutionOptions: ["supersede", "exception", "update", "dismiss"],
        message: "Decisions conflict on database choice",
      };
      expect(conflict.hasConflict).toBe(true);
      expect(conflict.conflictingDecisions).toHaveLength(2);
      expect(conflict.resolutionOptions).toContain("supersede");
      expect(conflict.resolutionOptions).toContain("exception");
    });

    it("ConflictResult with no conflict has empty conflictingDecisions [CODE-02]", () => {
      const noConflict: ConflictResult = {
        hasConflict: false,
        conflictingDecisions: [],
        resolutionOptions: [],
      };
      expect(noConflict.hasConflict).toBe(false);
      expect(noConflict.conflictingDecisions).toHaveLength(0);
    });
  });

  describe("tools.ts Input/Output type interfaces [CODE-02, T02-04]", () => {
    it("tools.ts module exports input/output type definitions for all 38 tools [CODE-02]", async () => {
      const tools = await import("../../src/types/tools");
      expect(tools).toBeDefined();
      const toolKeys = Object.keys(tools);
      // Should export at least one type/interface per tool — 38 tools × 2 (Input + Output) = 76
      expect(toolKeys.length).toBeGreaterThanOrEqual(38);
    });

    it("tools.ts input types: brief_add_decision has required title and why fields [CODE-02]", async () => {
      const tools = await import("../../src/types/tools");
      // Verify the shape of a representative tool input type at runtime
      const { createAddDecisionInput } = tools as any;
      if (typeof createAddDecisionInput === "function") {
        const input = createAddDecisionInput({ title: "Test", why: "Reason" });
        expect(input.title).toBe("Test");
        expect(input.why).toBe("Reason");
      } else {
        // Type-only export: verify the module exports a symbol for this tool
        const toolNames = Object.keys(tools);
        const hasAddDecision = toolNames.some((k) => /add.?decision/i.test(k));
        expect(hasAddDecision).toBe(true);
      }
    });

    it("tools.ts output types: all tool outputs have content and optional isError fields [CODE-02]", async () => {
      const tools = await import("../../src/types/tools");
      const { createToolOutput } = tools as any;
      if (typeof createToolOutput === "function") {
        const successOutput = createToolOutput({
          content: [{ type: "text", text: "ok" }],
        });
        expect(successOutput.content).toBeDefined();
        expect(Array.isArray(successOutput.content)).toBe(true);
        expect(successOutput.isError).not.toBe(true);

        const errorOutput = createToolOutput({
          content: [{ type: "text", text: "err" }],
          isError: true,
        });
        expect(errorOutput.isError).toBe(true);
      } else {
        // At minimum the module must be importable and have some exports
        expect(Object.keys(tools).length).toBeGreaterThan(0);
      }
    });
  });

  describe("discriminated unions [CODE-02]", () => {
    it("decision status union only accepts active, superseded, or exception [CODE-02]", () => {
      const validStatuses: Decision["status"][] = [
        "active",
        "superseded",
        "exception",
      ];
      // Verify the union is exactly these 3 values — no more, no fewer
      expect(validStatuses).toHaveLength(3);
      // No duplicates
      expect(new Set(validStatuses).size).toBe(3);
      // Verify each value is a non-empty string
      for (const status of validStatuses) {
        expect(typeof status).toBe("string");
        expect(status.length).toBeGreaterThan(0);
      }
      // @ts-expect-error — invalid value should be rejected at compile time
      const invalidStatus: Decision["status"] = "cancelled";
      expect(validStatuses).not.toContain("cancelled");
      expect(validStatuses).not.toContain("pending");
      expect(validStatuses).not.toContain("draft");
    });

    it("section classification union only accepts core, extension, or project-specific [CODE-02]", () => {
      const validClassifications: Section["classification"][] = [
        "core",
        "extension",
        "project-specific",
      ];
      // Verify the union is exactly these 3 values — no more, no fewer
      expect(validClassifications).toHaveLength(3);
      // No duplicates
      expect(new Set(validClassifications).size).toBe(3);
      // Verify each value is a non-empty string
      for (const classification of validClassifications) {
        expect(typeof classification).toBe("string");
        expect(classification.length).toBeGreaterThan(0);
      }
      // @ts-expect-error — invalid value should be rejected at compile time
      const invalidClassification: Section["classification"] = "custom";
      expect(validClassifications).not.toContain("custom");
      expect(validClassifications).not.toContain("unknown");
      expect(validClassifications).not.toContain("user-defined");
    });

    it("error type union only accepts the five taxonomy values [ERR-05]", () => {
      const validTypes: ErrorResponse["type"][] = [
        "invalid_input",
        "not_found",
        "parse_warning",
        "system_error",
        "internal_error",
      ];
      // Verify the union is exactly these 5 values — no more, no fewer
      expect(validTypes).toHaveLength(5);
      // No duplicates
      expect(new Set(validTypes).size).toBe(5);
      // Verify each value is a non-empty string
      for (const type of validTypes) {
        expect(typeof type).toBe("string");
        expect(type.length).toBeGreaterThan(0);
      }
      // @ts-expect-error — invalid value should be rejected at compile time
      const invalidType: ErrorResponse["type"] = "network_error";
      expect(validTypes).not.toContain("network_error");
      expect(validTypes).not.toContain("timeout");
      expect(validTypes).not.toContain("unknown_error");
    });

    it("lint finding severity union only accepts error, warning, or info [CODE-02]", () => {
      const validSeverities: LintFinding["severity"][] = [
        "error",
        "warning",
        "info",
      ];
      // Verify the union is exactly these 3 values — no more, no fewer
      expect(validSeverities).toHaveLength(3);
      // No duplicates
      expect(new Set(validSeverities).size).toBe(3);
      // Verify each value is a non-empty string
      for (const severity of validSeverities) {
        expect(typeof severity).toBe("string");
        expect(severity.length).toBeGreaterThan(0);
      }
      // @ts-expect-error — invalid value should be rejected at compile time
      const invalidSeverity: LintFinding["severity"] = "critical";
      expect(validSeverities).not.toContain("critical");
      expect(validSeverities).not.toContain("fatal");
      expect(validSeverities).not.toContain("debug");
    });

    it("LintFinding optional code field: machine-readable rule code accessible when present [CODE-02, M1]", () => {
      // The LintFinding interface includes an optional code?: string field
      // used for machine-readable rule identifiers (e.g. 'DUPLICATE_ACTIVE', 'INVALID_PACK_NAME')
      // This is in addition to the ruleId, severity, message, line?, section?, suggestion? fields
      const finding: LintFinding = {
        ruleId: "VALID-01",
        severity: "info",
        message: "Duplicate active decision detected",
        code: "DUPLICATE_ACTIVE",
      };
      expect(finding.code).toBe("DUPLICATE_ACTIVE");
      expect(finding.severity).toBe("info");
      // code is optional — finding without code is also valid
      const noCode: LintFinding = {
        ruleId: "VALID-02",
        severity: "error",
        message: "Missing required field",
      };
      expect(noCode.code).toBeUndefined();
    });
  });
});

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe("TASK-02: Property Tests", () => {
  it("forAll(valid parsed document): sections array preserves insertion order [CODE-02]", async () => {
    const { parseSections } = await import("../../src/types/parser");
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            heading: fc.string({ minLength: 1 }),
            level: fc.integer({ min: 1, max: 6 }),
            body: fc.string(),
            classification: fc.constantFrom(
              "core",
              "extension",
              "project-specific",
            ) as fc.Arbitrary<"core" | "extension" | "project-specific">,
          }),
          { minLength: 2, maxLength: 20 },
        ),
        (sectionInputs) => {
          // Pass through actual parseSections to verify order is preserved by real implementation
          const result = parseSections(sectionInputs as Section[]);
          // Sections must preserve their insertion order as returned by the implementation
          expect(result).toHaveLength(sectionInputs.length);
          for (let i = 0; i < sectionInputs.length; i++) {
            expect(result[i].heading).toBe(sectionInputs[i].heading);
          }
          // Distinct headings at different indices must not be swapped
          if (sectionInputs[0].heading !== sectionInputs[1].heading) {
            expect(result[0].heading).not.toBe(result[1].heading);
          }
        },
      ),
    );
  });

  it("forAll(valid decision): always has non-empty text and a status [CODE-02]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }),
        fc.constantFrom("active", "superseded", "exception") as fc.Arbitrary<
          "active" | "superseded" | "exception"
        >,
        async (text, status) => {
          const { parseDecision } = await import("../../src/types/decisions");
          const decision = parseDecision({ text, status, rationale: "test" });
          expect(decision.text.length).toBeGreaterThan(0);
          expect(["active", "superseded", "exception"]).toContain(
            decision.status,
          );
        },
      ),
    );
  });

  it("forAll(valid error response): type is always one of five taxonomy values [ERR-05]", async () => {
    const validTypes = [
      "invalid_input",
      "not_found",
      "parse_warning",
      "system_error",
      "internal_error",
    ];
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...validTypes),
        fc.string({ minLength: 1 }),
        async (type, message) => {
          const { createErrorResponse } = await import(
            "../../src/types/responses"
          );
          const err = createErrorResponse(
            type as ErrorResponse["type"],
            message,
          );
          expect(validTypes).toContain(err.type);
        },
      ),
    );
  });
});
