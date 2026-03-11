// src/ontology/draft.ts — WP5/GAP-D: Interactive Ontology Builder

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getConfigDir } from "../config/config.js"; // check-rules-ignore
import { atomicWriteFile } from "../io/file-io.js";
import { installPack } from "./management.js";
import { validatePackSchema } from "./schema.js";

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

export type DraftStatus =
  | "defining_rows"
  | "reviewing_rows"
  | "filling_columns"
  | "finalizing";

export interface DraftEntry {
  id: string;
  label: string;
  description?: string;
  [col: string]: unknown;
}

export interface OntologyDraft {
  id: string;
  name: string;
  description: string;
  status: DraftStatus;
  entries: DraftEntry[];
  columns: Array<{ name: string; type: "standard" | "custom" }>;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Disk persistence
// ---------------------------------------------------------------------------

function getDraftsDir(): string {
  return path.join(getConfigDir(), "drafts");
}

function draftFilePath(draftId: string): string {
  return path.join(getDraftsDir(), `${draftId}.json`);
}

async function saveDraft(draft: OntologyDraft): Promise<void> {
  const dir = getDraftsDir();
  await fs.promises.mkdir(dir, { recursive: true });
  await atomicWriteFile(
    draftFilePath(draft.id),
    JSON.stringify(draft, null, 2),
  );
}

async function loadDraft(draftId: string): Promise<OntologyDraft | null> {
  try {
    const content = await fs.promises.readFile(draftFilePath(draftId), "utf-8");
    return JSON.parse(content) as OntologyDraft;
  } catch {
    return null;
  }
}

async function deleteDraft(draftId: string): Promise<void> {
  try {
    await fs.promises.unlink(draftFilePath(draftId));
  } catch {
    /* best-effort */
  }
}

async function listDraftFiles(): Promise<OntologyDraft[]> {
  const dir = getDraftsDir();
  try {
    const files = await fs.promises.readdir(dir);
    const drafts: OntologyDraft[] = [];
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      try {
        const content = await fs.promises.readFile(
          path.join(dir, file),
          "utf-8",
        );
        drafts.push(JSON.parse(content) as OntologyDraft);
      } catch {
        /* skip corrupt files */
      }
    }
    return drafts;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// In-memory cache
// ---------------------------------------------------------------------------

const draftCache = new Map<string, OntologyDraft>();

/** @internal Reset module-level state for test isolation */
export function _resetState(): void {
  draftCache.clear();
}

async function getDraft(draftId: string): Promise<OntologyDraft | null> {
  const cached = draftCache.get(draftId);
  if (cached) return cached;
  const loaded = await loadDraft(draftId);
  if (loaded) draftCache.set(loaded.id, loaded);
  return loaded;
}

// ---------------------------------------------------------------------------
// Draft expiry (7 days)
// ---------------------------------------------------------------------------

const EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

function isExpired(draft: OntologyDraft): boolean {
  const updated = new Date(draft.updatedAt).getTime();
  return Date.now() - updated > EXPIRY_MS;
}

// ---------------------------------------------------------------------------
// Keyword-based entry generation
// ---------------------------------------------------------------------------

function generateFromKeywords(keywords: string[]): DraftEntry[] {
  return keywords.map((kw) => ({
    id: kw
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .slice(0, 50),
    label: kw,
    description: `Entry derived from keyword: ${kw}`,
  }));
}

// ---------------------------------------------------------------------------
// ontologyDraft — main function
// ---------------------------------------------------------------------------

export async function ontologyDraft(
  params: {
    action:
      | "create"
      | "add_entries"
      | "remove_entries"
      | "approve_rows"
      | "fill_columns"
      | "add_column"
      | "edit_entry"
      | "get"
      | "list"
      | "finalize";
    // create params
    name?: string;
    description?: string;
    domainKeywords?: string[];
    initialEntryCount?: number;
    // update params
    draftId?: string;
    entries?: Array<{ id: string; label: string; description?: string }>;
    entryIds?: string[];
    column?: { name: string };
    entryId?: string;
    fields?: Record<string, unknown>;
  },
  samplingFn?: SamplingFn,
): Promise<{
  draftId: string;
  draft: OntologyDraft;
  signal: string;
  installed?: boolean;
  packName?: string;
}> {
  const { action } = params;

  switch (action) {
    case "create":
      return handleCreate(params, samplingFn);
    case "add_entries":
      return handleAddEntries(params);
    case "remove_entries":
      return handleRemoveEntries(params);
    case "approve_rows":
      return handleApproveRows(params);
    case "fill_columns":
      return handleFillColumns(params, samplingFn);
    case "add_column":
      return handleAddColumn(params);
    case "edit_entry":
      return handleEditEntry(params);
    case "get":
      return handleGet(params);
    case "list":
      return handleList();
    case "finalize":
      return handleFinalize(params);
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

async function handleCreate(
  params: {
    name?: string;
    description?: string;
    domainKeywords?: string[];
    initialEntryCount?: number;
  },
  samplingFn?: SamplingFn,
): Promise<{ draftId: string; draft: OntologyDraft; signal: string }> {
  const name = params.name ?? "untitled";
  const description = params.description ?? "";
  const keywords = params.domainKeywords ?? [];

  const id = crypto.randomUUID().slice(0, 8);
  const now = new Date().toISOString();

  let entries: DraftEntry[] = [];

  if (samplingFn && keywords.length > 0) {
    try {
      entries = await generateWithAI(samplingFn, name, keywords);
    } catch {
      entries = generateFromKeywords(keywords);
    }
  } else if (keywords.length > 0) {
    entries = generateFromKeywords(keywords);
  }

  const draft: OntologyDraft = {
    id,
    name,
    description,
    status: "defining_rows",
    entries,
    columns: [
      { name: "id", type: "standard" },
      { name: "label", type: "standard" },
      { name: "description", type: "standard" },
    ],
    createdAt: now,
    updatedAt: now,
  };

  draftCache.set(id, draft);
  await saveDraft(draft);

  return {
    draftId: id,
    draft,
    signal: `Draft "${name}" created with ${entries.length} entries. Add more entries or call approve_rows to advance.`,
  };
}

async function handleAddEntries(params: {
  draftId?: string;
  entries?: Array<{ id: string; label: string; description?: string }>;
}): Promise<{ draftId: string; draft: OntologyDraft; signal: string }> {
  if (!params.draftId) throw new Error("draftId is required");
  const draft = await getDraft(params.draftId);
  if (!draft) throw new Error(`Draft not found: ${params.draftId}`);

  const newEntries = params.entries ?? [];
  for (const e of newEntries) {
    draft.entries.push({
      id: e.id,
      label: e.label,
      description: e.description,
    });
  }

  draft.updatedAt = new Date().toISOString();
  await saveDraft(draft);

  return {
    draftId: draft.id,
    draft,
    signal: `Added ${newEntries.length} entries. Total: ${draft.entries.length}.`,
  };
}

async function handleRemoveEntries(params: {
  draftId?: string;
  entryIds?: string[];
}): Promise<{ draftId: string; draft: OntologyDraft; signal: string }> {
  if (!params.draftId) throw new Error("draftId is required");
  const draft = await getDraft(params.draftId);
  if (!draft) throw new Error(`Draft not found: ${params.draftId}`);

  const toRemove = new Set(params.entryIds ?? []);
  const before = draft.entries.length;
  draft.entries = draft.entries.filter((e) => !toRemove.has(e.id));

  draft.updatedAt = new Date().toISOString();
  await saveDraft(draft);

  return {
    draftId: draft.id,
    draft,
    signal: `Removed ${before - draft.entries.length} entries. ${draft.entries.length} remain.`,
  };
}

async function handleApproveRows(params: {
  draftId?: string;
}): Promise<{ draftId: string; draft: OntologyDraft; signal: string }> {
  if (!params.draftId) throw new Error("draftId is required");
  const draft = await getDraft(params.draftId);
  if (!draft) throw new Error(`Draft not found: ${params.draftId}`);

  if (draft.status !== "defining_rows" && draft.status !== "reviewing_rows") {
    throw new Error(
      `Cannot approve rows in status "${draft.status}". Expected defining_rows or reviewing_rows.`,
    );
  }

  draft.status = "filling_columns";
  draft.updatedAt = new Date().toISOString();
  await saveDraft(draft);

  return {
    draftId: draft.id,
    draft,
    signal: `Rows approved. Status advanced to filling_columns. Use fill_columns or add_column to enrich entries.`,
  };
}

async function handleFillColumns(
  params: { draftId?: string },
  samplingFn?: SamplingFn,
): Promise<{ draftId: string; draft: OntologyDraft; signal: string }> {
  if (!params.draftId) throw new Error("draftId is required");
  const draft = await getDraft(params.draftId);
  if (!draft) throw new Error(`Draft not found: ${params.draftId}`);

  const customCols = draft.columns
    .filter((c) => c.type === "custom")
    .map((c) => c.name);
  let filled = false;
  let aiError = false;

  if (samplingFn) {
    try {
      await fillColumnsWithAI(samplingFn, draft);
      filled = true;
    } catch {
      aiError = true;
    }
  }

  draft.status = "finalizing";
  draft.updatedAt = new Date().toISOString();
  await saveDraft(draft);

  // Build informative signal
  let signal: string;
  if (filled) {
    signal = `Columns filled. Status: finalizing. Call finalize to install the pack.`;
  } else if (aiError) {
    signal = `AI column-fill failed. ${customCols.length > 0 ? `Use edit_entry to manually fill: ${customCols.join(", ")}. ` : ""}Status: finalizing. Call finalize when entries are complete.`;
  } else {
    signal = `No AI sampling available — columns were NOT auto-filled. ${customCols.length > 0 ? `Use edit_entry to manually fill: ${customCols.join(", ")} for each entry. ` : ""}Status: finalizing.`;
  }

  return { draftId: draft.id, draft, signal };
}

async function handleAddColumn(params: {
  draftId?: string;
  column?: { name: string };
}): Promise<{ draftId: string; draft: OntologyDraft; signal: string }> {
  if (!params.draftId) throw new Error("draftId is required");
  if (!params.column?.name) throw new Error("column.name is required");
  const draft = await getDraft(params.draftId);
  if (!draft) throw new Error(`Draft not found: ${params.draftId}`);

  const colName = params.column.name;
  if (!draft.columns.find((c) => c.name === colName)) {
    draft.columns.push({ name: colName, type: "custom" });
  }

  // Initialize column value for all entries
  for (const entry of draft.entries) {
    if (entry[colName] === undefined) {
      entry[colName] = "";
    }
  }

  draft.updatedAt = new Date().toISOString();
  await saveDraft(draft);

  return {
    draftId: draft.id,
    draft,
    signal: `Column "${colName}" added to all ${draft.entries.length} entries.`,
  };
}

async function handleEditEntry(params: {
  draftId?: string;
  entryId?: string;
  fields?: Record<string, unknown>;
}): Promise<{ draftId: string; draft: OntologyDraft; signal: string }> {
  if (!params.draftId) throw new Error("draftId is required");
  if (!params.entryId) throw new Error("entryId is required");
  const draft = await getDraft(params.draftId);
  if (!draft) throw new Error(`Draft not found: ${params.draftId}`);

  const entry = draft.entries.find((e) => e.id === params.entryId);
  if (!entry) throw new Error(`Entry not found: ${params.entryId}`);

  if (params.fields) {
    for (const [key, value] of Object.entries(params.fields)) {
      entry[key] = value;
    }
  }

  draft.updatedAt = new Date().toISOString();
  await saveDraft(draft);

  return {
    draftId: draft.id,
    draft,
    signal: `Entry "${params.entryId}" updated.`,
  };
}

async function handleGet(params: {
  draftId?: string;
}): Promise<{ draftId: string; draft: OntologyDraft; signal: string }> {
  if (!params.draftId) throw new Error("draftId is required");
  const draft = await getDraft(params.draftId);
  if (!draft) throw new Error(`Draft not found: ${params.draftId}`);

  return {
    draftId: draft.id,
    draft,
    signal: `Draft "${draft.name}" — status: ${draft.status}, ${draft.entries.length} entries.`,
  };
}

async function handleList(): Promise<{
  draftId: string;
  draft: OntologyDraft;
  signal: string;
}> {
  // Load from disk + cache
  const diskDrafts = await listDraftFiles();
  for (const d of diskDrafts) {
    if (!draftCache.has(d.id)) draftCache.set(d.id, d);
  }

  // Clean expired
  const expired: string[] = [];
  for (const [id, draft] of draftCache) {
    if (isExpired(draft)) {
      expired.push(id);
      await deleteDraft(id);
      draftCache.delete(id);
    }
  }

  const all = Array.from(draftCache.values());

  // Return a summary draft (list uses the first draft as the "current" one)
  const summary: OntologyDraft = {
    id: "list",
    name: "Draft Summary",
    description: `${all.length} active drafts${expired.length > 0 ? `, ${expired.length} expired removed` : ""}`,
    status: "defining_rows",
    entries: all.map((d) => ({
      id: d.id,
      label: d.name,
      description: `${d.status} — ${d.entries.length} entries`,
    })),
    columns: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return {
    draftId: "list",
    draft: summary,
    signal: `${all.length} active drafts.${expired.length > 0 ? ` ${expired.length} expired drafts cleaned up.` : ""}`,
  };
}

async function handleFinalize(params: { draftId?: string }): Promise<{
  draftId: string;
  draft: OntologyDraft;
  signal: string;
  installed: boolean;
  packName: string;
}> {
  if (!params.draftId) throw new Error("draftId is required");
  const draft = await getDraft(params.draftId);
  if (!draft) throw new Error(`Draft not found: ${params.draftId}`);

  if (draft.status !== "finalizing" && draft.status !== "filling_columns") {
    throw new Error(
      `Cannot finalize in status "${draft.status}". Advance through approve_rows and fill_columns first.`,
    );
  }

  // Build pack — include all standard + custom column data
  const customColNames = draft.columns
    .filter((c) => c.type === "custom")
    .map((c) => c.name);

  const pack = {
    name: draft.name,
    version: "1.0.0",
    entries: draft.entries.map((e) => {
      const entry: Record<string, unknown> = { id: e.id, label: e.label };
      if (e.description) entry.description = e.description;
      if (e.keywords) entry.keywords = e.keywords;
      // Include custom column data
      for (const col of customColNames) {
        if (e[col] !== undefined && e[col] !== "") {
          entry[col] = e[col];
        }
      }
      return entry;
    }),
  };

  validatePackSchema(pack);
  await installPack(pack);

  // Clean up draft
  await deleteDraft(draft.id);
  draftCache.delete(draft.id);

  return {
    draftId: draft.id,
    draft,
    signal: `Pack "${draft.name}" installed with ${pack.entries.length} entries. Draft deleted.`,
    installed: true,
    packName: draft.name,
  };
}

// ---------------------------------------------------------------------------
// AI helpers
// ---------------------------------------------------------------------------

async function generateWithAI(
  samplingFn: SamplingFn,
  name: string,
  keywords: string[],
): Promise<DraftEntry[]> {
  const result = await samplingFn({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: `Generate 5-10 ontology entries for a "${name}" taxonomy covering: ${keywords.join(", ")}. Respond with a JSON array of {id, label, description} objects. IDs should be lowercase-hyphenated.`,
        },
      },
    ],
    maxTokens: 1000,
  });

  const content = result?.content as
    | Array<{ type: string; text?: string }>
    | undefined;
  const text = content?.[0]?.text ?? "";
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
    const parsed = JSON.parse(jsonMatch[0]) as DraftEntry[];
    return parsed.filter((e) => e.id && e.label);
  }
  throw new Error("Could not parse AI response");
}

async function fillColumnsWithAI(
  samplingFn: SamplingFn,
  draft: OntologyDraft,
): Promise<void> {
  const customCols = draft.columns
    .filter((c) => c.type === "custom")
    .map((c) => c.name);

  // If there are custom columns, ask AI to fill them
  if (customCols.length > 0) {
    const entryLabels = draft.entries.map((e) => e.label);
    const colList = customCols.join(", ");

    const result = await samplingFn({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `For the ontology "${draft.name}" (${draft.description}), fill these columns for each entry: ${colList}.\n\nEntries: ${entryLabels.join(", ")}\n\nRespond with a JSON object where keys are entry labels and values are objects with the column values. Example: {"mp3": {"media_type": "audio", "mime_type": "audio/mpeg"}}`,
          },
        },
      ],
      maxTokens: 2000,
    });

    const content = result?.content as
      | Array<{ type: string; text?: string }>
      | undefined;
    const text = content?.[0]?.text ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const mapping = JSON.parse(jsonMatch[0]) as Record<
        string,
        Record<string, unknown>
      >;
      for (const entry of draft.entries) {
        const data = mapping[entry.label] ?? mapping[entry.id];
        if (data && typeof data === "object") {
          for (const col of customCols) {
            if (data[col] !== undefined) {
              entry[col] = data[col];
            }
          }
        }
      }
    }
  } else {
    // No custom columns — fall back to keyword suggestion
    const sampleIds = draft.entries.slice(0, 10).map((e) => e.label);

    const result = await samplingFn({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `For the ontology "${draft.name}" with entries: ${sampleIds.join(", ")}. Suggest 3-5 keywords for each entry. Respond with a JSON object mapping entry labels to keyword arrays.`,
          },
        },
      ],
      maxTokens: 1000,
    });

    const content = result?.content as
      | Array<{ type: string; text?: string }>
      | undefined;
    const text = content?.[0]?.text ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const mapping = JSON.parse(jsonMatch[0]) as Record<string, string[]>;
      for (const entry of draft.entries) {
        const kws = mapping[entry.label];
        if (Array.isArray(kws)) {
          entry.keywords = kws;
        }
      }
    }
  }
}
