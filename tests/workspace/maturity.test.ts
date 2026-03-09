import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import fc from "fast-check";
import { afterEach, describe, expect, it } from "vitest";
import { getMaturitySignals } from "../../src/workspace/maturity";

// ---------------------------------------------------------------------------
// Temp directory management
// ---------------------------------------------------------------------------

const tmpDirs: string[] = [];

async function makeTmpProject(briefContent: string): Promise<string> {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "brief-maturity-"));
  tmpDirs.push(dir);
  await fsp.writeFile(path.join(dir, "BRIEF.md"), briefContent, "utf-8");
  return dir;
}

afterEach(async () => {
  for (const d of tmpDirs) {
    await fsp.rm(d, { recursive: true, force: true }).catch(() => {});
  }
  tmpDirs.length = 0;
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const EMPTY_BRIEF = `**Project:** Test
**Type:** test
**Created:** 2026-01-01

## Key Decisions

## Open Questions
`;

const THREE_MINIMAL = `**Project:** Test
**Type:** test
**Created:** 2026-01-01

## Key Decisions

### Use TypeScript
We chose TypeScript for type safety.

### Target Node 20
We want to use the latest LTS runtime.

### Use Vitest
Fast and modern test runner.

## Open Questions
`;

const SEVEN_FULL = `**Project:** Test
**Type:** test
**Created:** 2026-01-01

## Key Decisions

### Decision A
WHAT: Do thing A
WHY: Reason A
WHEN: 2026-01-01
ALTERNATIVES CONSIDERED: None

### Decision B
WHAT: Do thing B
WHY: Reason B
WHEN: 2026-01-02
ALTERNATIVES CONSIDERED: Thing B2

### Decision C
WHAT: Do thing C
WHY: Reason C
WHEN: 2026-01-03
ALTERNATIVES CONSIDERED: Thing C2

### Decision D
WHAT: Do thing D
WHY: Reason D
WHEN: 2026-01-04
ALTERNATIVES CONSIDERED: None

### Decision E
WHAT: Do thing E
WHY: Reason E
WHEN: 2026-01-05
ALTERNATIVES CONSIDERED: None

### Decision F
WHAT: Do thing F
WHY: Reason F
WHEN: 2026-01-06
ALTERNATIVES CONSIDERED: None

### Decision G
WHAT: Do thing G
WHY: Reason G
WHEN: 2026-01-07
ALTERNATIVES CONSIDERED: None

## Open Questions
`;

const MIXED_BRIEF = `**Project:** Test
**Type:** test
**Created:** 2026-01-01

## Key Decisions

### Use TypeScript
We chose TypeScript for type safety.

### Target Node 20

WHAT: Use Node.js 20 as minimum runtime
WHY: LTS support until 2026
WHEN: 2026-01-15
ALTERNATIVES CONSIDERED: Node 18, Deno

### Use Vitest
Fast test runner with native ESM support.

### ~~Use Jest~~ (superseded)
Old test runner choice.

### API Design

WHAT: REST-based API
WHY: Industry standard
WHEN: 2026-02-01
ALTERNATIVES CONSIDERED: GraphQL, gRPC

## Open Questions

- Should we support Windows?
- What CI provider to use?
`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("WP6: getMaturitySignals", () => {
  it("empty BRIEF.md → nascent, 0 decisions", async () => {
    const dir = await makeTmpProject(EMPTY_BRIEF);
    const result = await getMaturitySignals({ projectPath: dir });

    expect(result.maturityLevel).toBe("nascent");
    expect(result.decisionCount).toBe(0);
    expect(result.minimalFormatCount).toBe(0);
    expect(result.fullFormatCount).toBe(0);
    expect(result.upgradeableDecisions).toEqual([]);
    expect(result.openQuestionCount).toBe(0);
    expect(result.signals).toEqual([]);
    expect(result.nextSteps).toEqual([]);
  });

  it("BRIEF.md with 3 minimal decisions → developing, 3 minimalFormatCount", async () => {
    const dir = await makeTmpProject(THREE_MINIMAL);
    const result = await getMaturitySignals({ projectPath: dir });

    expect(result.maturityLevel).toBe("developing");
    expect(result.decisionCount).toBe(3);
    expect(result.minimalFormatCount).toBe(3);
    expect(result.fullFormatCount).toBe(0);
    expect(result.upgradeableDecisions).toHaveLength(3);
    // Each should be missing all four fields
    for (const ud of result.upgradeableDecisions) {
      expect(ud.missingFields).toContain("what");
      expect(ud.missingFields).toContain("why");
      expect(ud.missingFields).toContain("when");
      expect(ud.missingFields).toContain("alternativesConsidered");
    }
    expect(result.signals).toContain(
      "3 decision(s) use minimal format and could be upgraded to include WHAT/WHY/WHEN fields",
    );
  });

  it("BRIEF.md with 7 full-format decisions → maturing, 0 upgradeableDecisions", async () => {
    const dir = await makeTmpProject(SEVEN_FULL);
    const result = await getMaturitySignals({ projectPath: dir });

    expect(result.maturityLevel).toBe("maturing");
    expect(result.decisionCount).toBe(7);
    expect(result.minimalFormatCount).toBe(0);
    expect(result.fullFormatCount).toBe(7);
    expect(result.upgradeableDecisions).toEqual([]);
    expect(result.signals).toContain(
      "Project is mature enough to use full decision format by default",
    );
    expect(result.nextSteps).toContain(
      "New decisions should include WHAT, WHY, WHEN, and ALTERNATIVES CONSIDERED fields",
    );
  });

  it("mixed decisions → correct classification and upgrade suggestions", async () => {
    const dir = await makeTmpProject(MIXED_BRIEF);
    const result = await getMaturitySignals({ projectPath: dir });

    // 4 non-superseded decisions (strikethrough Jest is excluded)
    expect(result.decisionCount).toBe(4);
    expect(result.maturityLevel).toBe("developing");
    expect(result.fullFormatCount).toBe(2); // Target Node 20, API Design
    expect(result.minimalFormatCount).toBe(2); // Use TypeScript, Use Vitest

    // upgradeableDecisions should list the 2 minimal ones
    expect(result.upgradeableDecisions).toHaveLength(2);
    const titles = result.upgradeableDecisions.map((u) => u.title);
    expect(titles).toContain("Use TypeScript");
    expect(titles).toContain("Use Vitest");

    // Each upgradeable should list missing fields
    for (const ud of result.upgradeableDecisions) {
      expect(ud.missingFields).toContain("what");
      expect(ud.missingFields).toContain("why");
    }

    // Signals
    expect(result.signals).toContain(
      "2 decision(s) use minimal format and could be upgraded to include WHAT/WHY/WHEN fields",
    );

    // nextSteps should include upgrade suggestions
    expect(result.nextSteps.some((s) => s.includes("Use TypeScript"))).toBe(
      true,
    );
    expect(result.nextSteps.some((s) => s.includes("Use Vitest"))).toBe(true);
  });

  it("open questions are counted", async () => {
    const dir = await makeTmpProject(MIXED_BRIEF);
    const result = await getMaturitySignals({ projectPath: dir });

    expect(result.openQuestionCount).toBe(2);
    expect(result.signals).toContain("2 open question(s) remain unresolved");
  });

  // ── Property Tests ──────────────────────────────────────────────────────

  describe("Property Tests", () => {
    it("forAll(decision count): maturity level is always consistent with decision count", async () => {
      await fc.assert(
        fc.asyncProperty(fc.integer({ min: 0, max: 15 }), async (count) => {
          let decisions = "";
          for (let i = 0; i < count; i++) {
            decisions += `\n### Decision ${i + 1}\nWHAT: Thing ${i + 1}\nWHY: Reason ${i + 1}\nWHEN: 2026-01-01\nALTERNATIVES CONSIDERED: None\n`;
          }
          const content = `**Project:** Test\n**Type:** test\n**Created:** 2026-01-01\n\n## Key Decisions\n${decisions}\n## Open Questions\n`;

          const dir = await makeTmpProject(content);
          const result = await getMaturitySignals({ projectPath: dir });

          expect(result.decisionCount).toBe(count);
          if (count <= 2) expect(result.maturityLevel).toBe("nascent");
          else if (count <= 5) expect(result.maturityLevel).toBe("developing");
          else if (count <= 10) expect(result.maturityLevel).toBe("maturing");
          else expect(result.maturityLevel).toBe("established");
        }),
        { numRuns: 10 },
      );
    });

    it("forAll(decision count): fullFormatCount + minimalFormatCount always equals decisionCount", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: 5 }),
          fc.integer({ min: 0, max: 5 }),
          async (full, minimal) => {
            let decisions = "";
            for (let i = 0; i < full; i++) {
              decisions += `\n### Full ${i + 1}\nWHAT: Thing\nWHY: Reason\nWHEN: 2026-01-01\nALTERNATIVES CONSIDERED: None\n`;
            }
            for (let i = 0; i < minimal; i++) {
              decisions += `\n### Minimal ${i + 1}\nJust a short note.\n`;
            }
            const content = `**Project:** Test\n**Type:** test\n**Created:** 2026-01-01\n\n## Key Decisions\n${decisions}\n## Open Questions\n`;

            const dir = await makeTmpProject(content);
            const result = await getMaturitySignals({ projectPath: dir });

            expect(result.fullFormatCount + result.minimalFormatCount).toBe(
              result.decisionCount,
            );
          },
        ),
        { numRuns: 10 },
      );
    });

    it("forAll(open question count): bullet items are always counted correctly", async () => {
      await fc.assert(
        fc.asyncProperty(fc.integer({ min: 0, max: 10 }), async (count) => {
          let questions = "";
          for (let i = 0; i < count; i++) {
            questions += `- Question ${i + 1}?\n`;
          }
          const content = `**Project:** Test\n**Type:** test\n**Created:** 2026-01-01\n\n## Key Decisions\n\n## Open Questions\n\n${questions}`;

          const dir = await makeTmpProject(content);
          const result = await getMaturitySignals({ projectPath: dir });

          expect(result.openQuestionCount).toBe(count);
        }),
        { numRuns: 10 },
      );
    });

    it("forAll(BRIEF content): getMaturitySignals never throws", async () => {
      await fc.assert(
        fc.asyncProperty(fc.string({ maxLength: 2000 }), async (content) => {
          const briefContent = `**Project:** Test\n**Type:** test\n**Created:** 2026-01-01\n\n${content}`;
          const dir = await makeTmpProject(briefContent);
          const result = await getMaturitySignals({ projectPath: dir });
          expect(result).toBeDefined();
          expect(typeof result.maturityLevel).toBe("string");
          expect(typeof result.decisionCount).toBe("number");
        }),
        { numRuns: 15 },
      );
    });
  });
});
