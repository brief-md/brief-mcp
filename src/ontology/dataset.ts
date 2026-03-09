// src/ontology/dataset.ts — WP4/GAP-C: Dataset Preview & Fetch+Convert

import { installPack } from "./management.js";
import { validatePackSchema } from "./schema.js";

// ---------------------------------------------------------------------------
// SSRF protection (shared pattern from management.ts / discovery.ts)
// ---------------------------------------------------------------------------

function isPrivateHost(hostname: string): boolean {
  if (hostname === "localhost" || hostname === "::1") return true;
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 127) return true;
  }
  if (hostname.startsWith("fd")) return true;
  return false;
}

// Thin wrapper — reads globalThis.fetch at call time (test-spy compatible)
const httpGet = (u: RequestInfo | URL, i?: RequestInit) =>
  globalThis.fetch(u, i); // check-rules-ignore

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SamplingFn = (params: {
  messages: Array<{
    role: "user" | "assistant";
    content: { type: "text"; text: string };
  }>;
  maxTokens: number;
  systemPrompt?: string;
}) => Promise<Record<string, unknown>>;

const HF_TIMEOUT_MS = 30_000;
const MAX_RESPONSE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_ENTRIES = 50_000;

// ---------------------------------------------------------------------------
// previewDataset
// ---------------------------------------------------------------------------

export async function previewDataset(params: {
  source: string;
  maxRows?: number;
}): Promise<{
  columns: string[];
  sampleRows: Array<Record<string, unknown>>;
  totalRows?: number;
  format: string;
  signal: string;
}> {
  const { source, maxRows = 10 } = params;

  if (!source || source.trim().length === 0) {
    return {
      columns: [],
      sampleRows: [],
      format: "unknown",
      signal: "Source is required. Provide a HuggingFace dataset ID or URL.",
    };
  }

  // Validate URL security
  const url = buildHfRowsUrl(source, maxRows);
  const parsed = new URL(url);

  if (parsed.protocol !== "https:") {
    throw new Error("Only HTTPS URLs are supported for security.");
  }
  if (isPrivateHost(parsed.hostname)) {
    throw new Error("SSRF: URL resolves to private/internal address.");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HF_TIMEOUT_MS);

  try {
    const response = await httpGet(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    clearTimeout(timer);

    if (!response.ok) {
      return {
        columns: [],
        sampleRows: [],
        format: "unknown",
        signal: `Dataset API returned status ${response.status}. Check the dataset ID and try again.`,
      };
    }

    const text = await response.text();
    if (text.length > MAX_RESPONSE_SIZE) {
      return {
        columns: [],
        sampleRows: [],
        format: "unknown",
        signal: "Response exceeds 10MB size limit.",
      };
    }

    const data = JSON.parse(text) as {
      rows?: Array<{ row?: Record<string, unknown> }>;
      num_rows_total?: number;
      features?: Array<{ name: string }>;
    };

    const rows = Array.isArray(data.rows)
      ? data.rows
          .slice(0, maxRows)
          .map((r) => r.row ?? {})
          .filter((r) => Object.keys(r).length > 0)
      : [];

    // Extract columns from first row or features
    const columns =
      Array.isArray(data.features) && data.features.length > 0
        ? data.features.map((f) => f.name)
        : rows.length > 0
          ? Object.keys(rows[0])
          : [];

    return {
      columns,
      sampleRows: rows,
      totalRows: data.num_rows_total,
      format: "huggingface",
      signal:
        rows.length > 0
          ? `Preview: ${rows.length} rows, ${columns.length} columns. Use brief_fetch_dataset to convert to an ontology pack.`
          : "No rows found in dataset. Verify the dataset ID.",
    };
  } catch (err: unknown) {
    clearTimeout(timer);
    const isAbort =
      err instanceof Error &&
      (err.name === "AbortError" || err.message.includes("abort"));
    if (isAbort) {
      return {
        columns: [],
        sampleRows: [],
        format: "unknown",
        signal: "Request timed out after 30 seconds.",
      };
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// fetchAndConvert
// ---------------------------------------------------------------------------

export async function fetchAndConvert(
  params: {
    source: string;
    name: string;
    idColumn: string;
    labelColumn: string;
    descriptionColumn?: string;
    keywordsColumn?: string;
    maxEntries?: number;
  },
  samplingFn?: SamplingFn,
): Promise<{
  created: boolean;
  packName: string;
  entryCount: number;
  droppedRows: number;
  fitEvaluation?: { score: number; reasoning: string };
  warnings: string[];
}> {
  const {
    source,
    name,
    idColumn,
    labelColumn,
    descriptionColumn,
    keywordsColumn,
    maxEntries = 500,
  } = params;

  if (!source || !name || !idColumn || !labelColumn) {
    throw new Error(
      "source, name, idColumn, and labelColumn are all required.",
    );
  }

  const cappedMax = Math.min(maxEntries, MAX_ENTRIES);

  // Fetch rows from HuggingFace (paginated if needed)
  const allRows = await fetchAllRows(source, cappedMax);

  // Map columns to pack entry fields
  const entries: Array<Record<string, unknown>> = [];
  let droppedRows = 0;
  const warnings: string[] = [];

  for (const row of allRows) {
    const id = String(row[idColumn] ?? "").trim();
    const label = String(row[labelColumn] ?? "").trim();

    if (!id || !label) {
      droppedRows++;
      continue;
    }

    // Sanitize ID to valid pack entry format
    const sanitizedId = id.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 200);
    if (sanitizedId !== id && warnings.length < 5) {
      warnings.push(`ID "${id}" sanitized to "${sanitizedId}"`);
    }

    const entry: Record<string, unknown> = {
      id: sanitizedId,
      label: label.slice(0, 500),
    };

    if (descriptionColumn && row[descriptionColumn] != null) {
      entry.description = String(row[descriptionColumn]).slice(0, 5000);
    }

    if (keywordsColumn && row[keywordsColumn] != null) {
      const kw = row[keywordsColumn];
      entry.keywords = Array.isArray(kw)
        ? kw.filter((k): k is string => typeof k === "string").slice(0, 100)
        : String(kw)
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
            .slice(0, 100);
    }

    entries.push(entry);
    if (entries.length >= cappedMax) break;
  }

  if (entries.length === 0) {
    throw new Error(
      `No valid entries could be extracted. ${droppedRows} rows dropped due to missing id/label columns.`,
    );
  }

  // Build pack object
  const pack = {
    name,
    version: "1.0.0",
    entries,
  };

  // Validate via schema
  validatePackSchema(pack);

  // Install pack
  await installPack(pack);

  // Optional AI fit evaluation
  let fitEvaluation: { score: number; reasoning: string } | undefined;
  if (samplingFn) {
    try {
      fitEvaluation = await evaluateFit(samplingFn, name, entries.slice(0, 5));
    } catch {
      /* best-effort */
    }
  }

  return {
    created: true,
    packName: name,
    entryCount: entries.length,
    droppedRows,
    fitEvaluation,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildHfRowsUrl(source: string, limit: number): string {
  // If it looks like a dataset ID (org/name), build HF API URL
  if (/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+$/.test(source.trim())) {
    return `https://huggingface.co/api/datasets/${encodeURIComponent(source.trim())}/rows?config=default&split=train&offset=0&length=${limit}`;
  }
  // Otherwise treat as direct URL
  return source;
}

async function fetchAllRows(
  source: string,
  maxRows: number,
): Promise<Array<Record<string, unknown>>> {
  const url = buildHfRowsUrl(source, Math.min(maxRows, 100));
  const parsed = new URL(url);

  if (parsed.protocol !== "https:") {
    throw new Error("Only HTTPS URLs are supported for security.");
  }
  if (isPrivateHost(parsed.hostname)) {
    throw new Error("SSRF: URL resolves to private/internal address.");
  }

  const allRows: Array<Record<string, unknown>> = [];
  let offset = 0;
  const pageSize = 100;

  while (allRows.length < maxRows) {
    const pageUrl = buildHfRowsUrl(source, pageSize).replace(
      /offset=\d+/,
      `offset=${offset}`,
    );

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HF_TIMEOUT_MS);

    try {
      const response = await httpGet(pageUrl, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      clearTimeout(timer);

      if (!response.ok) break;

      const text = await response.text();
      if (text.length > MAX_RESPONSE_SIZE) break;

      const data = JSON.parse(text) as {
        rows?: Array<{ row?: Record<string, unknown> }>;
      };

      const rows = Array.isArray(data.rows) ? data.rows : [];
      if (rows.length === 0) break;

      for (const r of rows) {
        if (r.row && Object.keys(r.row).length > 0) {
          allRows.push(r.row);
          if (allRows.length >= maxRows) break;
        }
      }

      offset += pageSize;
      if (rows.length < pageSize) break; // last page
    } catch {
      clearTimeout(timer);
      break;
    }
  }

  return allRows;
}

async function evaluateFit(
  samplingFn: SamplingFn,
  packName: string,
  sampleEntries: Array<Record<string, unknown>>,
): Promise<{ score: number; reasoning: string }> {
  const entryDescriptions = sampleEntries
    .map(
      (e) =>
        `- ${e.id}: ${e.label}${e.description ? ` (${String(e.description).slice(0, 100)})` : ""}`,
    )
    .join("\n");

  const result = await samplingFn({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: `Evaluate if this dataset "${packName}" would be useful as a creative ontology pack for a BRIEF project. Sample entries:\n${entryDescriptions}\n\nRespond with JSON: {"score": 0-10, "reasoning": "brief explanation"}`,
        },
      },
    ],
    maxTokens: 200,
  });

  // Parse AI response
  const content = result?.content as
    | Array<{ type: string; text?: string }>
    | undefined;
  const text = content?.[0]?.text ?? "";
  const jsonMatch = text.match(
    /\{[^}]*"score"\s*:\s*(\d+)[^}]*"reasoning"\s*:\s*"([^"]*)"/,
  );
  if (jsonMatch) {
    return {
      score: Number(jsonMatch[1]),
      reasoning: jsonMatch[2],
    };
  }
  return { score: 5, reasoning: "Could not parse AI evaluation." };
}
