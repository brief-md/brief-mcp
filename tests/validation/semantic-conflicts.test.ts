import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import {
  buildSemanticPrompt,
  checkConflictsWithSemantic,
  parseSemanticResponse,
  runSemanticAnalysis,
  type SamplingFn,
} from "../../src/validation/semantic-conflicts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockSamplingFn(response: object): SamplingFn {
  return vi.fn().mockResolvedValue(response);
}

function validAiResponse(
  results: Array<{
    pairIndex: number;
    isConflict: boolean;
    confidence: number;
    reasoning: string;
  }>,
) {
  return {
    content: { type: "text", text: JSON.stringify({ results }) },
    model: "test-model",
    role: "assistant" as const,
  };
}

// ---------------------------------------------------------------------------
// Unit Tests: parseSemanticResponse
// ---------------------------------------------------------------------------

describe("semantic-conflicts: parseSemanticResponse", () => {
  it("parses valid JSON response", () => {
    const result = parseSemanticResponse({
      content: {
        type: "text",
        text: '{ "results": [{ "pairIndex": 1, "isConflict": true, "confidence": 0.85, "reasoning": "They conflict" }] }',
      },
    });
    expect(result).toHaveLength(1);
    expect(result![0].pairIndex).toBe(1);
    expect(result![0].confidence).toBe(0.85);
  });

  it("strips markdown code fences before parsing", () => {
    const result = parseSemanticResponse({
      content: {
        type: "text",
        text: '```json\n{ "results": [{ "pairIndex": 1, "isConflict": true, "confidence": 0.9, "reasoning": "test" }] }\n```',
      },
    });
    expect(result).toHaveLength(1);
  });

  it("handles array content format", () => {
    const result = parseSemanticResponse({
      content: [
        {
          type: "text",
          text: '{ "results": [{ "pairIndex": 0, "isConflict": true, "confidence": 0.7, "reasoning": "r" }] }',
        },
      ],
    });
    expect(result).toHaveLength(1);
  });

  it("returns null for malformed JSON", () => {
    const result = parseSemanticResponse({
      content: { type: "text", text: "not json at all" },
    });
    expect(result).toBeNull();
  });

  it("returns null for empty content", () => {
    const result = parseSemanticResponse({
      content: { type: "image", text: undefined },
    });
    expect(result).toBeNull();
  });

  it("returns null for valid JSON but wrong shape", () => {
    const result = parseSemanticResponse({
      content: { type: "text", text: '{ "foo": "bar" }' },
    });
    expect(result).toBeNull();
  });

  it("drops entries with invalid fields", () => {
    const result = parseSemanticResponse({
      content: {
        type: "text",
        text: JSON.stringify({
          results: [
            {
              pairIndex: 1,
              isConflict: true,
              confidence: 0.8,
              reasoning: "ok",
            },
            {
              pairIndex: "bad",
              isConflict: true,
              confidence: 0.8,
              reasoning: "ok",
            },
            {
              pairIndex: 2,
              isConflict: true,
              confidence: 1.5,
              reasoning: "over 1",
            },
          ],
        }),
      },
    });
    // Only first entry is valid (third has confidence > 1)
    expect(result).toHaveLength(1);
    expect(result![0].pairIndex).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Unit Tests: buildSemanticPrompt
// ---------------------------------------------------------------------------

describe("semantic-conflicts: buildSemanticPrompt", () => {
  it("serializes pairs into numbered list", () => {
    const prompt = buildSemanticPrompt([
      { a: "Use REST", b: "Use GraphQL", pairType: "decision-decision" },
      {
        a: "Keep it simple",
        b: "a complex system",
        pairType: "decision-constraint",
      },
    ]);
    expect(prompt).toContain(
      '1. A: "Use REST" | B: "Use GraphQL" [decision-decision]',
    );
    expect(prompt).toContain(
      '2. A: "Keep it simple" | B: "a complex system" [decision-constraint]',
    );
  });

  it("appends domain context when tensionProse is provided", () => {
    const prompt = buildSemanticPrompt(
      [{ a: "A", b: "B", pairType: "decision-decision" }],
      "- Lo-fi vs high-fidelity: Pick a lane.",
    );
    expect(prompt).toContain("DOMAIN CONTEXT");
    expect(prompt).toContain("Lo-fi vs high-fidelity");
  });

  it("omits domain context when tensionProse is undefined", () => {
    const prompt = buildSemanticPrompt([
      { a: "A", b: "B", pairType: "decision-decision" },
    ]);
    expect(prompt).not.toContain("DOMAIN CONTEXT");
  });
});

// ---------------------------------------------------------------------------
// Unit Tests: checkConflictsWithSemantic
// ---------------------------------------------------------------------------

describe("semantic-conflicts: checkConflictsWithSemantic", () => {
  it("semantic: false → returns heuristic result with no semanticAnalysis", async () => {
    const result = await checkConflictsWithSemantic({
      decisions: [
        { text: "Use simple approach", status: "active" },
        { text: "Build complex system", status: "active" },
      ],
      constraints: [],
      semantic: false,
    });
    expect(result.conflicts.length).toBeGreaterThan(0);
    expect(result.semanticAnalysis).toBeUndefined();
  });

  it("semantic: true, no sampling → semanticAnalysis.status === 'unavailable'", async () => {
    const result = await checkConflictsWithSemantic(
      {
        decisions: [{ text: "A", status: "active" }],
        constraints: [],
        semantic: true,
      },
      undefined, // no samplingFn
      undefined, // no availability checker
    );
    expect(result.semanticAnalysis).toBeDefined();
    expect(result.semanticAnalysis!.status).toBe("unavailable");
  });

  it("semantic: true, sampling unavailable → status 'unavailable'", async () => {
    const fn = mockSamplingFn(validAiResponse([]));
    const result = await checkConflictsWithSemantic(
      {
        decisions: [{ text: "A", status: "active" }],
        constraints: [],
        semantic: true,
      },
      fn,
      () => false, // sampling not available
    );
    expect(result.semanticAnalysis!.status).toBe("unavailable");
    expect(fn).not.toHaveBeenCalled();
  });

  it("semantic: true, mock samplingFn returns valid conflicts → produces AI conflicts", async () => {
    const fn = mockSamplingFn(
      validAiResponse([
        {
          pairIndex: 1,
          isConflict: true,
          confidence: 0.9,
          reasoning: "Semantic conflict",
        },
      ]),
    );

    const result = await checkConflictsWithSemantic(
      {
        decisions: [
          { text: "Prioritize speed to market", status: "active" },
          {
            text: "Ensure comprehensive testing before release",
            status: "active",
          },
        ],
        constraints: [],
        semantic: true,
      },
      fn,
      () => true,
    );

    expect(result.semanticAnalysis).toBeDefined();
    expect(result.semanticAnalysis!.status).toBe("completed");
    expect(fn).toHaveBeenCalled();
  });

  it("semantic: true, samplingFn throws → status 'error'", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("Sampling failed"));

    const result = await checkConflictsWithSemantic(
      {
        decisions: [
          { text: "A", status: "active" },
          { text: "B", status: "active" },
        ],
        constraints: [],
        semantic: true,
      },
      fn as unknown as SamplingFn,
      () => true,
    );

    expect(result.semanticAnalysis!.status).toBe("error");
    expect(result.semanticAnalysis!.errorMessage).toContain("Sampling failed");
    // Heuristic results are still present
    expect(result.conflicts).toBeDefined();
  });

  it("heuristic results always present regardless of semantic outcome", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("fail"));

    const result = await checkConflictsWithSemantic(
      {
        decisions: [
          { text: "Use simple approach", status: "active" },
          { text: "Build complex system", status: "active" },
        ],
        constraints: [],
        semantic: true,
      },
      fn as unknown as SamplingFn,
      () => true,
    );

    // Heuristic should catch simple/complex antonym
    expect(result.conflicts.length).toBeGreaterThan(0);
    expect(result.semanticAnalysis!.status).toBe("error");
  });

  it("AI conflicts are deduplicated against heuristic conflicts", async () => {
    // simple/complex will be caught by both heuristic and AI
    const fn = mockSamplingFn(
      validAiResponse([
        {
          pairIndex: 1,
          isConflict: true,
          confidence: 0.9,
          reasoning: "They conflict",
        },
      ]),
    );

    const result = await checkConflictsWithSemantic(
      {
        decisions: [
          { text: "Use simple approach", status: "active" },
          { text: "Build complex system", status: "active" },
        ],
        constraints: [],
        semantic: true,
      },
      fn,
      () => true,
    );

    // The semantic analysis should have deduplicated the conflict
    // since heuristic already caught it via simple/complex antonym
    expect(result.semanticAnalysis!.status).toBe("completed");
    expect(result.semanticAnalysis!.conflicts.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Unit Tests: runSemanticAnalysis
// ---------------------------------------------------------------------------

describe("semantic-conflicts: runSemanticAnalysis", () => {
  it("returns 'skipped' when there are no pairs to analyze", async () => {
    const fn = mockSamplingFn(validAiResponse([]));
    const result = await runSemanticAnalysis([], [], [], fn);
    expect(result.status).toBe("skipped");
    expect(result.pairsAnalyzed).toBe(0);
    expect(fn).not.toHaveBeenCalled();
  });

  it("includes tensionProse in prompt when provided", async () => {
    const fn = mockSamplingFn(validAiResponse([]));
    await runSemanticAnalysis(
      [
        { text: "Decision A", status: "active" },
        { text: "Decision B", status: "active" },
      ],
      [],
      [],
      fn,
      { tensionProse: "Lo-fi vs high-fidelity tension" },
    );
    expect(fn).toHaveBeenCalled();
    const callArgs = (fn as any).mock.calls[0][0];
    expect(callArgs.messages[0].content.text).toContain(
      "Lo-fi vs high-fidelity",
    );
  });

  it("filters out low-confidence results", async () => {
    const fn = mockSamplingFn(
      validAiResponse([
        {
          pairIndex: 1,
          isConflict: true,
          confidence: 0.3,
          reasoning: "Low confidence",
        },
      ]),
    );

    const result = await runSemanticAnalysis(
      [
        { text: "A", status: "active" },
        { text: "B", status: "active" },
      ],
      [],
      [],
      fn,
    );

    expect(result.status).toBe("completed");
    expect(result.conflicts).toHaveLength(0);
  });

  it("returns error on timeout", async () => {
    const fn = vi
      .fn()
      .mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 5000)),
      ) as unknown as SamplingFn;

    const result = await runSemanticAnalysis(
      [
        { text: "A", status: "active" },
        { text: "B", status: "active" },
      ],
      [],
      [],
      fn,
      { timeoutMs: 50 },
    );

    expect(result.status).toBe("error");
    expect(result.errorMessage).toContain("timed out");
  });
});

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe("semantic-conflicts: property tests", () => {
  it("semantic: false never produces semanticAnalysis field", () => {
    fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            text: fc.string({ minLength: 1, maxLength: 50 }),
            status: fc.constant("active"),
          }),
          { minLength: 0, maxLength: 5 },
        ),
        fc.array(fc.string({ minLength: 1, maxLength: 50 }), {
          minLength: 0,
          maxLength: 3,
        }),
        async (decisions, constraints) => {
          const result = await checkConflictsWithSemantic({
            decisions,
            constraints,
            semantic: false,
          });
          expect(result.semanticAnalysis).toBeUndefined();
        },
      ),
    );
  });

  it("heuristic conflicts array is always present and valid shape", () => {
    fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            text: fc.string({ minLength: 1, maxLength: 50 }),
            status: fc.constant("active"),
          }),
          { minLength: 0, maxLength: 5 },
        ),
        fc.array(fc.string({ minLength: 1, maxLength: 50 }), {
          minLength: 0,
          maxLength: 3,
        }),
        async (decisions, constraints) => {
          const result = await checkConflictsWithSemantic({
            decisions,
            constraints,
            semantic: true,
          });
          expect(Array.isArray(result.conflicts)).toBe(true);
          expect(typeof result.filesModified).toBe("number");
        },
      ),
    );
  });
});
