import { describe, expect, it } from "vitest";
import { extractConflictPatterns } from "../../src/type-intelligence/conflict-patterns";
import type { TypeGuide } from "../../src/types/type-intelligence";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGuide(
  overrides: Partial<TypeGuide> & { metadata?: any } = {},
): TypeGuide {
  return {
    slug: "test-guide",
    displayName: "Test Guide",
    metadata: {
      type: "test",
      source: "bundled" as const,
      version: "1.0",
      ...overrides.metadata,
    },
    content: overrides.content ?? "",
    path: "/fake/path.md",
    body: overrides.body,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("conflict-patterns: extractConflictPatterns", () => {
  it("extracts conflict_patterns from metadata into pairs array", () => {
    const guide = makeGuide({
      metadata: {
        type: "music-release",
        source: "bundled",
        version: "1.0",
        conflictPatterns: [
          ["lo-fi aesthetic", "high-fidelity mastering"],
          ["live recording", "programmed drums"],
        ],
      },
    });
    const result = extractConflictPatterns(guide);
    expect(result.pairs).toEqual([
      ["lo-fi aesthetic", "high-fidelity mastering"],
      ["live recording", "programmed drums"],
    ]);
  });

  it("extracts snake_case conflict_patterns from metadata", () => {
    const guide = makeGuide({
      metadata: {
        type: "music-release",
        source: "bundled",
        version: "1.0",
        conflict_patterns: [["acoustic focus", "heavy synthesis"]],
      },
    });
    const result = extractConflictPatterns(guide);
    expect(result.pairs).toEqual([["acoustic focus", "heavy synthesis"]]);
  });

  it("extracts ## Known Tensions section into tensionProse", () => {
    const guide = makeGuide({
      body: `## Setup Guide

Some intro text.

## Known Tensions

- **Lo-fi vs high-fidelity**: Pick a lane.
- **Live vs programmed**: Budget tensions.

## Next Steps

More content here.`,
    });
    const result = extractConflictPatterns(guide);
    expect(result.tensionProse).toContain("Lo-fi vs high-fidelity");
    expect(result.tensionProse).toContain("Live vs programmed");
    expect(result.tensionProse).not.toContain("Next Steps");
    expect(result.tensionProse).not.toContain("Setup Guide");
  });

  it("returns empty pairs when guide has no conflict_patterns", () => {
    const guide = makeGuide({
      metadata: { type: "plain", source: "bundled", version: "1.0" },
    });
    const result = extractConflictPatterns(guide);
    expect(result.pairs).toEqual([]);
  });

  it("returns undefined tensionProse when guide has no body", () => {
    const guide = makeGuide({ body: undefined });
    const result = extractConflictPatterns(guide);
    expect(result.tensionProse).toBeUndefined();
  });

  it("returns undefined tensionProse when body has no Known Tensions section", () => {
    const guide = makeGuide({ body: "## Setup\n\nSome text." });
    const result = extractConflictPatterns(guide);
    expect(result.tensionProse).toBeUndefined();
  });

  it("handles malformed conflict_patterns (non-array) gracefully", () => {
    const guide = makeGuide({
      metadata: {
        type: "bad",
        source: "bundled",
        version: "1.0",
        conflictPatterns: "not an array",
      },
    });
    const result = extractConflictPatterns(guide);
    expect(result.pairs).toEqual([]);
  });

  it("handles malformed conflict_patterns entries (wrong shape) gracefully", () => {
    const guide = makeGuide({
      metadata: {
        type: "bad",
        source: "bundled",
        version: "1.0",
        conflictPatterns: [
          ["valid-a", "valid-b"],
          ["only-one"],
          [123, 456],
          ["", "non-empty"],
          null,
          "string-entry",
        ],
      },
    });
    const result = extractConflictPatterns(guide);
    expect(result.pairs).toEqual([["valid-a", "valid-b"]]);
  });

  it("returns empty tensionProse when Known Tensions section is empty", () => {
    const guide = makeGuide({
      body: "## Known Tensions\n\n## Next Section",
    });
    const result = extractConflictPatterns(guide);
    expect(result.tensionProse).toBeUndefined();
  });

  it("extracts Known Tensions at end of body (no following section)", () => {
    const guide = makeGuide({
      body: "## Known Tensions\n\n- Tension one.\n- Tension two.",
    });
    const result = extractConflictPatterns(guide);
    expect(result.tensionProse).toContain("Tension one");
    expect(result.tensionProse).toContain("Tension two");
  });
});
