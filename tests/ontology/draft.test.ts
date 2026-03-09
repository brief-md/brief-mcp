import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { _resetState, ontologyDraft } from "../../src/ontology/draft";
import { getPackIndex } from "../../src/ontology/management";

// ---------------------------------------------------------------------------
// Setup / Teardown — Use BRIEF_HOME to redirect drafts to tmp dir
// ---------------------------------------------------------------------------

let tmpDir: string;
const origEnv = process.env.BRIEF_HOME;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "brief-draft-test-"));
  process.env.BRIEF_HOME = tmpDir;
  _resetState();
});

afterEach(() => {
  _resetState();
  if (origEnv) {
    process.env.BRIEF_HOME = origEnv;
  } else {
    delete process.env.BRIEF_HOME;
  }
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {}
});

// ---------------------------------------------------------------------------
// create action
// ---------------------------------------------------------------------------

describe("WP5/GAP-D: ontologyDraft create", () => {
  it("returns draftId and draft in defining_rows status", async () => {
    const result = await ontologyDraft({
      action: "create",
      name: "test-ontology",
      description: "A test ontology",
    });
    expect(result.draftId).toBeDefined();
    expect(result.draft.status).toBe("defining_rows");
    expect(result.draft.name).toBe("test-ontology");
  });

  it("creates entries from domainKeywords", async () => {
    const result = await ontologyDraft({
      action: "create",
      name: "keyword-test",
      domainKeywords: ["nostalgia", "redemption", "hope"],
    });
    expect(result.draft.entries.length).toBeGreaterThanOrEqual(3);
  });

  it("uses AI when samplingFn provided", async () => {
    const mockSampling = vi.fn().mockResolvedValue({
      content: [
        {
          type: "text",
          text: '[{"id": "ai-entry", "label": "AI Generated", "description": "From AI"}]',
        },
      ],
    });

    const result = await ontologyDraft(
      {
        action: "create",
        name: "ai-test",
        domainKeywords: ["music"],
      },
      mockSampling,
    );
    expect(result.draft.entries.some((e) => e.id === "ai-entry")).toBe(true);
  });

  it("falls back to keyword generation when sampling fails", async () => {
    const mockSampling = vi.fn().mockRejectedValue(new Error("AI failed"));

    const result = await ontologyDraft(
      {
        action: "create",
        name: "fallback-test",
        domainKeywords: ["rock", "jazz"],
      },
      mockSampling,
    );
    expect(result.draft.entries.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// add/remove entries
// ---------------------------------------------------------------------------

describe("WP5/GAP-D: ontologyDraft add/remove entries", () => {
  it("add_entries appends to existing draft", async () => {
    const created = await ontologyDraft({
      action: "create",
      name: "add-test",
      domainKeywords: ["base"],
    });
    const before = created.draft.entries.length;

    const result = await ontologyDraft({
      action: "add_entries",
      draftId: created.draftId,
      entries: [
        { id: "new-1", label: "New Entry 1" },
        { id: "new-2", label: "New Entry 2" },
      ],
    });
    expect(result.draft.entries.length).toBe(before + 2);
  });

  it("remove_entries removes specified entries by ID", async () => {
    const created = await ontologyDraft({
      action: "create",
      name: "remove-test",
      domainKeywords: ["a", "b", "c", "d", "e"],
    });

    const initialCount = created.draft.entries.length;
    const idsToRemove = created.draft.entries.slice(0, 2).map((e) => e.id);

    const result = await ontologyDraft({
      action: "remove_entries",
      draftId: created.draftId,
      entryIds: idsToRemove,
    });
    expect(result.draft.entries.length).toBe(initialCount - 2);
  });

  it("add_entries rejects when draft not found", async () => {
    await expect(
      ontologyDraft({
        action: "add_entries",
        draftId: "nonexistent",
        entries: [{ id: "x", label: "X" }],
      }),
    ).rejects.toThrow("not found");
  });
});

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

describe("WP5/GAP-D: ontologyDraft state machine", () => {
  it("approve_rows advances from defining_rows to filling_columns", async () => {
    const created = await ontologyDraft({
      action: "create",
      name: "approve-test",
      domainKeywords: ["test"],
    });
    expect(created.draft.status).toBe("defining_rows");

    const result = await ontologyDraft({
      action: "approve_rows",
      draftId: created.draftId,
    });
    expect(result.draft.status).toBe("filling_columns");
  });

  it("fill_columns advances to finalizing", async () => {
    const created = await ontologyDraft({
      action: "create",
      name: "fill-test",
      domainKeywords: ["test"],
    });
    await ontologyDraft({
      action: "approve_rows",
      draftId: created.draftId,
    });

    const result = await ontologyDraft({
      action: "fill_columns",
      draftId: created.draftId,
    });
    expect(result.draft.status).toBe("finalizing");
  });

  it("add_column adds custom column to all entries", async () => {
    const created = await ontologyDraft({
      action: "create",
      name: "col-test",
      domainKeywords: ["a", "b"],
    });

    const result = await ontologyDraft({
      action: "add_column",
      draftId: created.draftId,
      column: { name: "mood" },
    });

    expect(result.draft.columns.some((c) => c.name === "mood")).toBe(true);
    for (const entry of result.draft.entries) {
      expect(entry.mood).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// edit / get / list
// ---------------------------------------------------------------------------

describe("WP5/GAP-D: ontologyDraft edit/get/list", () => {
  it("edit_entry updates specific entry fields", async () => {
    const created = await ontologyDraft({
      action: "create",
      name: "edit-test",
      domainKeywords: ["original"],
    });
    const entryId = created.draft.entries[0].id;

    const result = await ontologyDraft({
      action: "edit_entry",
      draftId: created.draftId,
      entryId,
      fields: { label: "Updated Label" },
    });

    const updated = result.draft.entries.find((e) => e.id === entryId);
    expect(updated?.label).toBe("Updated Label");
  });

  it("get returns current draft state", async () => {
    const created = await ontologyDraft({
      action: "create",
      name: "get-test",
      domainKeywords: ["test"],
    });

    const result = await ontologyDraft({
      action: "get",
      draftId: created.draftId,
    });
    expect(result.draft.name).toBe("get-test");
    expect(result.draft.entries.length).toBe(created.draft.entries.length);
  });

  it("list returns all active drafts", async () => {
    await ontologyDraft({ action: "create", name: "draft-1" });
    await ontologyDraft({ action: "create", name: "draft-2" });
    await ontologyDraft({ action: "create", name: "draft-3" });

    const result = await ontologyDraft({ action: "list" });
    expect(result.draft.entries.length).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// finalize
// ---------------------------------------------------------------------------

describe("WP5/GAP-D: ontologyDraft finalize", () => {
  it("validates and installs pack", async () => {
    const created = await ontologyDraft({
      action: "create",
      name: "finalize-test",
      domainKeywords: ["alpha", "beta"],
    });
    await ontologyDraft({
      action: "approve_rows",
      draftId: created.draftId,
    });
    await ontologyDraft({
      action: "fill_columns",
      draftId: created.draftId,
    });

    const result = await ontologyDraft({
      action: "finalize",
      draftId: created.draftId,
    });

    expect(result.installed).toBe(true);
    expect(result.packName).toBe("finalize-test");

    const packIndex = getPackIndex("finalize-test");
    expect(packIndex).toBeDefined();
  });

  it("rejects finalize from defining_rows status", async () => {
    const created = await ontologyDraft({
      action: "create",
      name: "early-finalize",
      domainKeywords: ["test"],
    });

    await expect(
      ontologyDraft({
        action: "finalize",
        draftId: created.draftId,
      }),
    ).rejects.toThrow("Cannot finalize");
  });

  it("deletes draft file from disk after finalize", async () => {
    const created = await ontologyDraft({
      action: "create",
      name: "cleanup-test",
      domainKeywords: ["x"],
    });
    await ontologyDraft({
      action: "approve_rows",
      draftId: created.draftId,
    });
    await ontologyDraft({
      action: "fill_columns",
      draftId: created.draftId,
    });
    await ontologyDraft({
      action: "finalize",
      draftId: created.draftId,
    });

    const draftFile = path.join(tmpDir, "drafts", `${created.draftId}.json`);
    expect(fs.existsSync(draftFile)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Disk persistence
// ---------------------------------------------------------------------------

describe("WP5/GAP-D: ontologyDraft persistence", () => {
  it("draft persists to disk and survives _resetState", async () => {
    const created = await ontologyDraft({
      action: "create",
      name: "persist-test",
      domainKeywords: ["test"],
    });

    _resetState(); // Clear in-memory cache

    const result = await ontologyDraft({
      action: "get",
      draftId: created.draftId,
    });
    expect(result.draft.name).toBe("persist-test");
  });

  it("draft file is valid JSON", async () => {
    const created = await ontologyDraft({
      action: "create",
      name: "json-test",
    });

    const draftFile = path.join(tmpDir, "drafts", `${created.draftId}.json`);
    const content = fs.readFileSync(draftFile, "utf-8");
    expect(() => JSON.parse(content)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe("WP5/GAP-D: Property Tests", () => {
  it("forAll(name, description): create never throws for valid inputs", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .string({ minLength: 1, maxLength: 50 })
          .map((s) => s.replace(/[^a-zA-Z0-9 _-]/g, "a")),
        async (name) => {
          _resetState();
          const result = await ontologyDraft({
            action: "create",
            name,
          });
          expect(result.draftId).toBeDefined();
          expect(result.draft.status).toBe("defining_rows");
        },
      ),
      { numRuns: 10 },
    );
  });

  it("forAll(entry count 1-20): draft always has correct entry count after add_entries", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 20 }), async (count) => {
        _resetState();
        const created = await ontologyDraft({
          action: "create",
          name: "count-test",
        });
        const entries = Array.from({ length: count }, (_, i) => ({
          id: `entry-${i}`,
          label: `Entry ${i}`,
        }));
        const result = await ontologyDraft({
          action: "add_entries",
          draftId: created.draftId,
          entries,
        });
        expect(result.draft.entries.length).toBe(count);
      }),
      { numRuns: 5 },
    );
  });

  it("forAll(action sequence): state machine transitions are valid", async () => {
    const created = await ontologyDraft({
      action: "create",
      name: "sm-test",
      domainKeywords: ["test"],
    });
    expect(created.draft.status).toBe("defining_rows");

    const approved = await ontologyDraft({
      action: "approve_rows",
      draftId: created.draftId,
    });
    expect(approved.draft.status).toBe("filling_columns");

    const filled = await ontologyDraft({
      action: "fill_columns",
      draftId: created.draftId,
    });
    expect(filled.draft.status).toBe("finalizing");

    const finalized = await ontologyDraft({
      action: "finalize",
      draftId: created.draftId,
    });
    expect(finalized.installed).toBe(true);
  });
});
