import { describe, expect, it } from "vitest";
import { checkConflicts } from "../../src/validation/conflicts";

// ---------------------------------------------------------------------------
// Tests: Domain pattern augmentation of heuristic layer
// ---------------------------------------------------------------------------

describe("conflicts: domain pattern augmentation", () => {
  it("domain antonym pair triggers conflict that generic antonyms miss", () => {
    // "acoustic" and "synthesis" are not in the generic ANTONYM_PAIRS.
    // extractKeywords splits on non-word chars, so domain patterns must use
    // keywords that appear in the extracted keyword sets.
    const result = checkConflicts({
      decisions: [
        { text: "Focus on acoustic instruments only", status: "active" },
        { text: "Rely heavily on synthesis throughout", status: "active" },
      ],
      constraints: [],
      domainPatterns: [["acoustic", "synthesis"]],
    });
    expect(result.conflicts.length).toBeGreaterThan(0);
    expect(result.conflicts[0].items.map((i: any) => i.text)).toEqual(
      expect.arrayContaining([
        "Focus on acoustic instruments only",
        "Rely heavily on synthesis throughout",
      ]),
    );
  });

  it("domain patterns are additive — generic antonym detection still works", () => {
    const result = checkConflicts({
      decisions: [
        { text: "Use a simple approach", status: "active" },
        { text: "Build a complex system", status: "active" },
      ],
      constraints: [],
      domainPatterns: [["lo-fi", "high-fidelity"]],
    });
    // simple/complex is a generic antonym pair — should still trigger
    expect(result.conflicts.length).toBeGreaterThan(0);
  });

  it("no domainPatterns → identical behavior to before (backward compat)", () => {
    const withoutDomain = checkConflicts({
      decisions: [
        { text: "Use REST API", status: "active" },
        { text: "Use GraphQL API", status: "active" },
      ],
      constraints: [],
    });
    const withEmptyDomain = checkConflicts({
      decisions: [
        { text: "Use REST API", status: "active" },
        { text: "Use GraphQL API", status: "active" },
      ],
      constraints: [],
      domainPatterns: undefined,
    });
    expect(withoutDomain.conflicts.length).toBe(
      withEmptyDomain.conflicts.length,
    );
  });

  it("empty domainPatterns array → identical behavior to before", () => {
    const without = checkConflicts({
      decisions: [
        { text: "Use REST API", status: "active" },
        { text: "Use GraphQL API", status: "active" },
      ],
      constraints: [],
    });
    const withEmpty = checkConflicts({
      decisions: [
        { text: "Use REST API", status: "active" },
        { text: "Use GraphQL API", status: "active" },
      ],
      constraints: [],
      domainPatterns: [],
    });
    expect(without.conflicts.length).toBe(withEmpty.conflicts.length);
  });

  it("domain patterns work for decision-constraint conflicts", () => {
    const result = checkConflicts({
      decisions: [{ text: "Focus on acoustic instruments", status: "active" }],
      constraints: ["heavy synthesis"],
      domainPatterns: [["acoustic", "synthesis"]],
    });
    expect(result.conflicts.length).toBeGreaterThan(0);
  });

  it("domain patterns work for constraint-constraint conflicts", () => {
    const result = checkConflicts({
      decisions: [],
      constraints: [
        "Must support lo-fi output",
        "Require high-fidelity output",
      ],
      domainPatterns: [["lo-fi", "high-fidelity"]],
    });
    expect(result.conflicts.length).toBeGreaterThan(0);
  });
});
