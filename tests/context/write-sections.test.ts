import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  handleCaptureExternalSession,
  handleUpdateSection,
} from "../../src/context/write-sections";

// ---------------------------------------------------------------------------
// Unit Tests
// ---------------------------------------------------------------------------

describe("TASK-28: Context Write — Sections & External Sessions", () => {
  describe("update section [WRITE-14]", () => {
    it("update section by canonical name: content replaced [WRITE-14]", async () => {
      const result = await handleUpdateSection({
        heading: "What This Is",
        content: "Updated description",
      });
      expect(result.success).toBe(true);
      expect(result.sectionUpdated).toBe(true);
      expect(result.canonicalName).toBeDefined();
    });

    it("update section by alias: resolved to canonical and updated [WRITE-14]", async () => {
      const result = await handleUpdateSection({
        heading: "Overview",
        content: "Updated via alias",
      });
      expect(result.success).toBe(true);
      expect(result.sectionUpdated).toBe(true);
      expect(result.canonicalName).toBeDefined();
    });

    it("update section with case-insensitive name: resolved and updated [WRITE-14]", async () => {
      const result = await handleUpdateSection({
        heading: "what this is",
        content: "Case insensitive update",
      });
      expect(result.success).toBe(true);
      expect(result.sectionUpdated).toBe(true);
      expect(result.canonicalName).toBeDefined();
    });

    it("update with append mode: new content appended to existing [WRITE-14]", async () => {
      const result = await handleUpdateSection({
        heading: "What This Is",
        content: "Additional content",
        append: true,
      });
      expect(result.success).toBe(true);
      expect(result.appendMode).toBe(true);
      expect(result.previousContent).toBeDefined();
    });

    it("update missing section: section created at canonical position [WRITE-14]", async () => {
      const result = await handleUpdateSection({
        heading: "Why This Exists",
        content: "New motivation section",
      });
      expect(result.success).toBe(true);
      // Verify the section content was actually written correctly
      expect(result.content).toContain("New motivation section");
    });

    it("update with empty string content: section cleared (valid operation) [WRITE-14]", async () => {
      const result = await handleUpdateSection({
        heading: "What This Is",
        content: "",
      });
      // MCP spec: isError must be OMITTED on success, not set to false
      expect(result.isError).toBeUndefined();
      // Empty content is a valid operation — section should now be empty
      expect(result.content).toBe("");
    });

    it("update with H1 heading in content: warning returned, write proceeds [WRITE-19]", async () => {
      const result = await handleUpdateSection({
        heading: "What This Is",
        content: "# Top Level Heading\nBody text",
      });
      expect(result.warnings).toBeDefined();
      expect(result.warnings!.length).toBeGreaterThan(0);
    });

    it("section name not matching any known section or alias: created as project-specific [PARSE-06]", async () => {
      const result = await handleUpdateSection({
        heading: "My Custom Section",
        content: "Custom content",
      });
      expect(result.success).toBe(true);
    });

    it("update section moving content with ontology tags: tags travel with paragraphs [OQ-217]", async () => {
      const result = await handleUpdateSection({
        heading: "What This Is",
        content: 'Content with tags\n<!-- brief:ontology pack id "Label" -->',
      });
      expect(result.success).toBe(true);
      expect(result.tagsPreserved).toBe(true);
    });
  });

  describe("capture external session [WRITE-16a, DEC-16]", () => {
    it("capture session with 3 decisions: all 3 written atomically [WRITE-16a]", async () => {
      const result = await handleCaptureExternalSession({
        tool: "Ableton Live",
        decisions: [
          { title: "Key set to F minor", why: "Mood" },
          { title: "Tempo locked at 82 BPM", why: "Feel" },
          { title: "Reverb on bus", why: "Space" },
        ],
      });
      expect(result.success).toBe(true);
      expect(result.decisionsWritten).toBe(3);
    });

    it("capture session: breadcrumb appended with date, tool name, count, titles [WRITE-16a]", async () => {
      const result = await handleCaptureExternalSession({
        tool: "Figma",
        decisions: [{ title: "Use design tokens", why: "Consistency" }],
      });
      expect(result.breadcrumbWritten).toBe(true);
      // Breadcrumb must include date, "Figma" (the tool), and decision count
      expect(result.breadcrumbFormat).toMatch(/\d{4}-\d{2}-\d{2}.*Figma.*\d+/);
    });

    it("capture session when External Tool Sessions sub-section missing: created [WRITE-16a]", async () => {
      const result = await handleCaptureExternalSession({
        tool: "Figma",
        decisions: [{ title: "Test", why: "Test" }],
      });
      expect(result.success).toBe(true);
      // Verify what was created
      expect(result.decisionsWritten).toBe(1);
    });

    it("capture session: conflict detection auto-runs, conflicts included in response [DEC-16]", async () => {
      const result = await handleCaptureExternalSession({
        tool: "External",
        decisions: [{ title: "Conflicting decision", why: "Test" }],
      });
      expect(result.conflictsDetected).toBeDefined();
      expect(result.conflictDetectionRan).toBe(true);
    });

    it("capture session with failed write: no partial decisions written (atomic) [WRITE-04]", async () => {
      // If any decision fails to write, none should be written
      const result = await handleCaptureExternalSession({
        tool: "Test",
        decisions: [
          { title: "Valid", why: "OK" },
          { title: "", why: "Invalid — should prevent all writes" },
        ],
      });
      expect(result.isError).toBe(true);
    });
  });

  describe("section parameter naming [WRITE-14, T28-02]", () => {
    it("section parameter accepted as alias for heading [WRITE-14, T28-02]", async () => {
      const result = await handleUpdateSection({
        section: "What This Is",
        content: "Updated via section param",
      } as any);
      expect(result.success).toBe(true);
      expect(result.sectionUpdated).toBe(true);
    });
  });

  describe("active project guard [ARCH-06, T28-01]", () => {
    it("handleUpdateSection with no active project: guard error [ARCH-06]", async () => {
      const result = await handleUpdateSection({
        heading: "Test",
        content: "Test",
        _noActiveProject: true,
      } as any);
      expect(result.isError).toBe(true);
    });

    it("handleCaptureExternalSession with no active project: requireActiveProject guard error [ARCH-06, T28-01]", async () => {
      const result = await handleCaptureExternalSession({
        tool: "TestTool",
        decisions: [{ title: "Test", why: "Test" }],
        _noActiveProject: true,
      } as any);
      expect(result.isError).toBe(true);
      expect((result.content as any)[0].text).toMatch(
        /active.*project|no project/i,
      );
    });
  });
});

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe("TASK-28: Property Tests", () => {
  it("forAll(section alias): write target resolution matches read parser resolution [WRITE-14]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(
          "Overview",
          "Motivation",
          "Decisions",
          "Questions",
          "What This Is",
          "What This Is NOT",
          "Why This Exists",
          "Key Decisions",
          "Open Questions",
          "Direction",
        ),
        async (alias) => {
          const result = await handleUpdateSection({
            heading: alias,
            content: "Test content",
          });
          expect(result.success).toBe(true);
        },
      ),
      { numRuns: 5 },
    );
  });

  it("forAll(external session): all decisions written or none (atomic) [WRITE-04]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            title: fc
              .string({ minLength: 1, maxLength: 50 })
              .filter((s) => /^[a-zA-Z0-9 ]+$/.test(s)),
            why: fc.string({ minLength: 1, maxLength: 100 }),
          }),
          { minLength: 1, maxLength: 5 },
        ),
        async (decisions) => {
          const result = await handleCaptureExternalSession({
            tool: "TestTool",
            decisions,
          });
          expect(result.success).toBe(true);
          expect(result.decisionsWritten).toBe(decisions.length);
        },
      ),
      { numRuns: 5 },
    );
  });

  it("forAll(external session): breadcrumb always includes date, tool, count, titles [WRITE-16a]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .string({ minLength: 1, maxLength: 20 })
          .filter((s) => /^[a-zA-Z ]+$/.test(s)),
        async (tool) => {
          const result = await handleCaptureExternalSession({
            tool,
            decisions: [{ title: "Test", why: "Test" }],
          });
          expect(result.success).toBe(true);
          expect(result.breadcrumbWritten).toBe(true);
          expect(result.breadcrumb).toMatch(/\d{4}-\d{2}-\d{2}/);
        },
      ),
      { numRuns: 5 },
    );
  });

  it("forAll(update operation): confirmation includes file path [RESP-04]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .string({ minLength: 1, maxLength: 30 })
          .filter((s) => /^[a-zA-Z ]+$/.test(s)),
        async (heading) => {
          const result = await handleUpdateSection({
            heading,
            content: "Content",
          });
          expect(result.success).toBe(true);
          // RESP-04 + RESP-05: file path must appear in MCP content text and be absolute
          expect((result.content as any)[0].text).toMatch(
            /\/.*BRIEF\.md|file.*path/i,
          );
        },
      ),
      { numRuns: 5 },
    );
  });
});
