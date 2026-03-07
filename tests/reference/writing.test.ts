import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { _resetState, addReference } from "../../src/reference/writing";

// ---------------------------------------------------------------------------
// Unit Tests
// ---------------------------------------------------------------------------

describe("TASK-39: Reference — Writing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetState();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("basic writing [REF-04, REF-10]", () => {
    it("add reference with creator, title, and notes: entry written in correct format [REF-04]", async () => {
      const result = await addReference({
        section: "References: Films",
        creator: "Sean Penn",
        title: "Into the Wild",
        notes: "2007, themes of freedom",
      });
      // G-290: keep written flag but assert it explicitly, and assert referenceText contains creator
      expect(result.written).toBe(true);
      expect(result.referenceText).toContain("Sean Penn");
      expect(result.format).toMatch(
        /Sean Penn: Into the Wild \(2007, themes of freedom\)/,
      );
    });

    it("add reference without notes: entry written without parenthetical notes [REF-10]", async () => {
      const result = await addReference({
        section: "References: Films",
        creator: "Sean Penn",
        title: "Into the Wild",
      });
      expect(result.written).toBe(true);
      // G-291: stricter format assertion — exact format match (colon + title, no parenthetical when no notes)
      expect(result.format).toBe("Sean Penn: Into the Wild");
      expect(result.format).not.toContain("(");
    });
  });

  describe("ontology links [REF-04, REF-10]", () => {
    it("add reference with ontology_links: ref-link comments written after entry [REF-04]", async () => {
      const result = await addReference({
        section: "References: Films",
        creator: "Sean Penn",
        title: "Into the Wild",
        ontologyLinks: [{ pack: "theme-pack", entryId: "freedom" }],
      });
      expect(result.refLinkComments).toBeDefined();
      expect(result.refLinkComments!.length).toBe(1);
      // G-292: assert link content matches <!-- brief:ref-link {pack} {id} --> format [T39-03, T39-04]
      expect(result.refLinkComments![0].text).toContain("theme-pack");
      expect(result.refLinkComments![0].text).toContain("freedom");
      expect(result.refLinkComments![0].text).toMatch(
        /<!--\s*brief:ref-link\s+theme-pack\s+freedom\s*-->/,
      );
    });

    it("add reference with multiple ontology_links: one comment per link [REF-04]", async () => {
      const result = await addReference({
        section: "References: Films",
        creator: "Sean Penn",
        title: "Into the Wild",
        ontologyLinks: [
          { pack: "theme-pack", entryId: "freedom" },
          { pack: "theme-pack", entryId: "nature" },
        ],
      });
      expect(result.refLinkComments!.length).toBe(2);
      // G-293: assert each link contains expected text
      expect(result.refLinkComments![0].text).toContain("freedom");
      expect(result.refLinkComments![1].text).toContain("nature");
    });

    it("add reference without ontology_links: no ref-link comments written [REF-10]", async () => {
      const result = await addReference({
        section: "References: Films",
        creator: "Sean Penn",
        title: "Into the Wild",
      });
      expect(result.refLinkComments).toBeUndefined();
    });
  });

  describe("section management [REF-04]", () => {
    it("add reference to non-existent subsection: subsection created, then entry written [REF-04]", async () => {
      const result = await addReference({
        section: "References: New Category",
        creator: "Author",
        title: "Title",
      });
      // G-294: keep sectionCreated flag but assert it explicitly
      expect(result.sectionCreated).toBe(true);
      expect(result.written).toBe(true);
    });

    it("add reference to existing subsection: entry appended to existing content [REF-04]", async () => {
      const result = await addReference({
        section: "References: Films",
        creator: "New Director",
        title: "New Film",
      });
      expect(result.written).toBe(true);
      expect(result.sectionCreated).toBe(false);
    });
  });

  describe("deduplication [REF-11]", () => {
    it("exact duplicate in same section: warning returned, write still proceeds [REF-11]", async () => {
      // G-295: assert first write succeeds
      const firstResult = await addReference({
        section: "References: Films",
        creator: "Sean Penn",
        title: "Into the Wild",
      });
      expect(firstResult.written).toBe(true);
      const result = await addReference({
        section: "References: Films",
        creator: "Sean Penn",
        title: "Into the Wild",
      });
      expect(result.duplicateWarning).toBeDefined();
      expect(result.written).toBe(true);
    });

    it("same creator+title in different section: no warning, write proceeds (valid cross-section) [REF-11]", async () => {
      await addReference({
        section: "References: Films",
        creator: "Author",
        title: "Shared Title",
      });
      const result = await addReference({
        section: "References: Books",
        creator: "Author",
        title: "Shared Title",
      });
      expect(result.duplicateWarning).toBeUndefined();
      expect(result.written).toBe(true);
    });
  });

  describe("preservation [REF-04]", () => {
    it("reference preserves existing section content: no side effects on other entries [REF-04]", async () => {
      const result = await addReference({
        section: "References: Films",
        creator: "New Director",
        title: "New Film",
      });
      // G-296: keep contentPreserved flag but assert it explicitly
      expect(result.contentPreserved).toBe(true);
      expect(result.originalContent).toBeDefined();
      expect(result.afterContent).toContain(
        result.originalContent.slice(0, 50),
      );
    });
  });

  describe("guard [ARCH-06]", () => {
    it("no active project: guard error [ARCH-06]", async () => {
      await expect(
        addReference({
          section: "References: Films",
          creator: "Author",
          title: "Title",
          noActiveProject: true,
        }),
      ).rejects.toThrow(/active.*project|no project/i);
    });
  });
});

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe("TASK-39: Property Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetState();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // G-297: make async and await fc.assert
  it("forAll(reference with ontology_links): ref-link comments always written [REF-04]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .string({ minLength: 2, maxLength: 15 })
          .filter((s) => /^[a-zA-Z]+$/.test(s)),
        fc
          .string({ minLength: 2, maxLength: 20 })
          .filter((s) => /^[a-zA-Z ]+$/.test(s)),
        async (creator, title) => {
          const result = await addReference({
            section: "References: Test",
            creator,
            title,
            ontologyLinks: [{ pack: "test-pack", entryId: "e1" }],
          });
          expect(result.refLinkComments).toBeDefined();
          expect(result.refLinkComments!.length).toBeGreaterThan(0);
        },
      ),
      { numRuns: 5 },
    );
  });

  // G-298: make async and await fc.assert
  it("forAll(reference without ontology_links): no ref-link comments present [REF-10]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .string({ minLength: 2, maxLength: 15 })
          .filter((s) => /^[a-zA-Z]+$/.test(s)),
        fc
          .string({ minLength: 2, maxLength: 20 })
          .filter((s) => /^[a-zA-Z ]+$/.test(s)),
        async (creator, title) => {
          const result = await addReference({
            section: "References: Test",
            creator,
            title,
          });
          expect(result.refLinkComments).toBeUndefined();
        },
      ),
      { numRuns: 5 },
    );
  });

  // G-299: make async and await fc.assert
  it("forAll(same-section duplicate): warning always returned but write never blocked [REF-11]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .string({ minLength: 2, maxLength: 15 })
          .filter((s) => /^[a-zA-Z]+$/.test(s)),
        async (title) => {
          await addReference({
            section: "References: Prop",
            creator: "Author",
            title,
          });
          const result = await addReference({
            section: "References: Prop",
            creator: "Author",
            title,
          });
          expect(result.duplicateWarning).toBeDefined();
          expect(result.written).toBe(true);
        },
      ),
      { numRuns: 5 },
    );
  });

  // G-300: make async and await fc.assert
  it("forAll(add operation): confirmation includes file path [REF-04]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .string({ minLength: 2, maxLength: 15 })
          .filter((s) => /^[a-zA-Z]+$/.test(s)),
        async (title) => {
          const result = await addReference({
            section: "References: Test",
            creator: "Author",
            title,
          });
          expect(result.filePath).toBeDefined();
        },
      ),
      { numRuns: 5 },
    );
  });

  // Negative property: missing required fields always rejects
  it("forAll(invalid input): always rejects for noActiveProject guard", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .string({ minLength: 2, maxLength: 15 })
          .filter((s) => /^[a-zA-Z]+$/.test(s)),
        async (title) => {
          await expect(
            addReference({
              section: "References: Test",
              creator: "Author",
              title,
              noActiveProject: true,
            }),
          ).rejects.toThrow(/active.*project|no project/i);
        },
      ),
      { numRuns: 10 },
    );
  });

  // Structural invariant: result objects always have required fields
  it("forAll(add operation): result always has required output fields", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .string({ minLength: 2, maxLength: 15 })
          .filter((s) => /^[a-zA-Z]+$/.test(s)),
        async (title) => {
          const result = await addReference({
            section: "References: Test",
            creator: "Author",
            title,
          });
          expect(Object.keys(result)).toEqual(
            expect.arrayContaining([
              "written",
              "referenceText",
              "format",
              "contentPreserved",
              "filePath",
            ]),
          );
        },
      ),
      { numRuns: 5 },
    );
  });
});
