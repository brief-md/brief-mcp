import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchAndConvert, previewDataset } from "../../src/ontology/dataset";
import { getPackIndex } from "../../src/ontology/management";

// ---------------------------------------------------------------------------
// Mock fetch
// ---------------------------------------------------------------------------

let fetchMock: ReturnType<typeof vi.fn>;

function mockHfResponse(
  rows: Array<Record<string, unknown>>,
  opts?: { status?: number; numRowsTotal?: number },
) {
  const status = opts?.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () =>
      Promise.resolve(
        JSON.stringify({
          rows: rows.map((row) => ({ row })),
          num_rows_total: opts?.numRowsTotal ?? rows.length,
          features: Object.keys(rows[0] ?? {}).map((name) => ({ name })),
        }),
      ),
    json: () =>
      Promise.resolve({
        rows: rows.map((row) => ({ row })),
        num_rows_total: opts?.numRowsTotal ?? rows.length,
        features: Object.keys(rows[0] ?? {}).map((name) => ({ name })),
      }),
  };
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// previewDataset Tests
// ---------------------------------------------------------------------------

describe("WP4/GAP-C: previewDataset", () => {
  it("returns columns and sample rows from HF dataset API", async () => {
    const rows = [
      { id: "1", label: "Alpha", description: "First entry" },
      { id: "2", label: "Beta", description: "Second entry" },
    ];
    fetchMock.mockResolvedValueOnce(
      mockHfResponse(rows, { numRowsTotal: 100 }),
    );

    const result = await previewDataset({ source: "test-org/test-dataset" });
    expect(result.columns).toEqual(["id", "label", "description"]);
    expect(result.sampleRows).toHaveLength(2);
    expect(result.sampleRows[0]).toEqual(rows[0]);
    expect(result.totalRows).toBe(100);
    expect(result.format).toBe("huggingface");
  });

  it("respects maxRows parameter", async () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({
      id: String(i),
      label: `Entry ${i}`,
    }));
    fetchMock.mockResolvedValueOnce(mockHfResponse(rows));

    const result = await previewDataset({
      source: "test-org/test-dataset",
      maxRows: 5,
    });
    expect(result.sampleRows.length).toBeLessThanOrEqual(5);
  });

  it("handles HF API failure gracefully", async () => {
    fetchMock.mockResolvedValueOnce(mockHfResponse([], { status: 404 }));

    const result = await previewDataset({ source: "nonexistent/dataset" });
    expect(result.sampleRows).toEqual([]);
    expect(result.signal).toContain("404");
  });

  it("rejects non-HTTPS URLs", async () => {
    await expect(
      previewDataset({ source: "http://example.com/data.json" }),
    ).rejects.toThrow("HTTPS");
  });

  it("rejects private/SSRF addresses", async () => {
    await expect(
      previewDataset({ source: "https://10.0.0.1/api/data" }),
    ).rejects.toThrow("SSRF");
  });

  it("handles empty dataset", async () => {
    fetchMock.mockResolvedValueOnce(mockHfResponse([]));

    const result = await previewDataset({ source: "test-org/empty-ds" });
    expect(result.sampleRows).toEqual([]);
    expect(result.signal).toContain("No rows");
  });
});

// ---------------------------------------------------------------------------
// fetchAndConvert Tests
// ---------------------------------------------------------------------------

describe("WP4/GAP-C: fetchAndConvert", () => {
  it("converts HF dataset to pack and installs it", async () => {
    const rows = [
      { id: "alpha", name: "Alpha", desc: "First" },
      { id: "beta", name: "Beta", desc: "Second" },
    ];
    fetchMock.mockResolvedValueOnce(mockHfResponse(rows));

    const result = await fetchAndConvert({
      source: "test-org/test-dataset",
      name: "test-convert-pack",
      idColumn: "id",
      labelColumn: "name",
      descriptionColumn: "desc",
    });

    expect(result.created).toBe(true);
    expect(result.packName).toBe("test-convert-pack");
    expect(result.entryCount).toBe(2);
    expect(result.droppedRows).toBe(0);

    // Verify pack was installed
    const packIndex = getPackIndex("test-convert-pack");
    expect(packIndex).toBeDefined();
  });

  it("maps user-specified columns to pack entry fields", async () => {
    const rows = [{ my_id: "one", my_label: "One Label", my_desc: "One Desc" }];
    fetchMock.mockResolvedValueOnce(mockHfResponse(rows));

    const result = await fetchAndConvert({
      source: "test-org/test-dataset",
      name: "custom-cols-pack",
      idColumn: "my_id",
      labelColumn: "my_label",
      descriptionColumn: "my_desc",
    });

    expect(result.entryCount).toBe(1);
  });

  it("drops rows missing required columns", async () => {
    const rows = [
      { id: "valid", name: "Valid Entry" },
      { id: "", name: "Missing ID" },
      { id: "no-name", name: "" },
      { id: "ok", name: "OK Entry" },
    ];
    fetchMock.mockResolvedValueOnce(mockHfResponse(rows));

    const result = await fetchAndConvert({
      source: "test-org/test-dataset",
      name: "dropped-pack",
      idColumn: "id",
      labelColumn: "name",
    });

    expect(result.entryCount).toBe(2);
    expect(result.droppedRows).toBe(2);
  });

  it("caps entries at maxEntries", async () => {
    const rows = Array.from({ length: 50 }, (_, i) => ({
      id: `entry-${i}`,
      label: `Entry ${i}`,
    }));
    fetchMock.mockResolvedValueOnce(mockHfResponse(rows));

    const result = await fetchAndConvert({
      source: "test-org/test-dataset",
      name: "capped-pack",
      idColumn: "id",
      labelColumn: "label",
      maxEntries: 10,
    });

    expect(result.entryCount).toBeLessThanOrEqual(10);
  });

  it("returns fitEvaluation when samplingFn provided", async () => {
    const rows = [
      { id: "alpha", label: "Alpha" },
      { id: "beta", label: "Beta" },
    ];
    fetchMock.mockResolvedValueOnce(mockHfResponse(rows));

    const mockSampling = vi.fn().mockResolvedValue({
      content: [
        {
          type: "text",
          text: '{"score": 8, "reasoning": "Great fit for music ontology"}',
        },
      ],
    });

    const result = await fetchAndConvert(
      {
        source: "test-org/test-dataset",
        name: "eval-pack",
        idColumn: "id",
        labelColumn: "label",
      },
      mockSampling,
    );

    expect(result.fitEvaluation).toBeDefined();
    expect(result.fitEvaluation?.score).toBe(8);
    expect(result.fitEvaluation?.reasoning).toContain("music");
  });

  it("works without samplingFn (no fitEvaluation)", async () => {
    const rows = [{ id: "one", label: "One" }];
    fetchMock.mockResolvedValueOnce(mockHfResponse(rows));

    const result = await fetchAndConvert({
      source: "test-org/test-dataset",
      name: "no-eval-pack",
      idColumn: "id",
      labelColumn: "label",
    });

    expect(result.fitEvaluation).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe("WP4/GAP-C: Property Tests", () => {
  it("forAll(maxRows 1-50): previewDataset never returns more than maxRows", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 50 }), async (maxRows) => {
        const rows = Array.from({ length: 100 }, (_, i) => ({
          id: String(i),
          label: `E${i}`,
        }));
        fetchMock.mockResolvedValueOnce(mockHfResponse(rows));

        const result = await previewDataset({
          source: "test-org/ds",
          maxRows,
        });
        expect(result.sampleRows.length).toBeLessThanOrEqual(maxRows);
      }),
      { numRuns: 10 },
    );
  });

  it("forAll(column mapping): fetchAndConvert always produces valid pack entries", async () => {
    const columnPairs = [
      { id: "id", label: "name" },
      { id: "code", label: "title" },
      { id: "key", label: "value" },
    ];
    await fc.assert(
      fc.asyncProperty(fc.constantFrom(...columnPairs), async (cols) => {
        const rows = [
          { [cols.id]: "test-1", [cols.label]: "Test One" },
          { [cols.id]: "test-2", [cols.label]: "Test Two" },
        ];
        fetchMock.mockResolvedValueOnce(mockHfResponse(rows));

        const result = await fetchAndConvert({
          source: "test-org/ds",
          name: `prop-pack-${cols.id}-${cols.label}`,
          idColumn: cols.id,
          labelColumn: cols.label,
        });
        expect(result.entryCount).toBeGreaterThan(0);
        expect(result.created).toBe(true);
      }),
      { numRuns: 3 },
    );
  });

  it("forAll(source string): previewDataset never throws for valid sources", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom("org/dataset-1", "user/my-data", "team/ontology-pack"),
        async (source) => {
          fetchMock.mockResolvedValueOnce(
            mockHfResponse([{ id: "1", label: "test" }]),
          );
          const result = await previewDataset({ source });
          expect(result).toBeDefined();
        },
      ),
      { numRuns: 3 },
    );
  });
});
