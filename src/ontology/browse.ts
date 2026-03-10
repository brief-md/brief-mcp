// src/ontology/browse.ts — TASK-34: Ontology Browsing & Entry Retrieval

import { NotFoundError } from "../errors/error-types.js";
import defaultLogger from "../observability/logger.js";
import { getPackIndex, installPack, reloadPackFromDisk } from "./management.js";

// Lazy import to avoid fixture contamination at module load time
let _isTaggedFn: ((ontology: string, entryId: string) => boolean) | undefined;
async function getIsTagged(): Promise<
  (ontology: string, entryId: string) => boolean
> {
  if (!_isTaggedFn) {
    const mod = await import("./tagging.js"); // check-rules-ignore
    _isTaggedFn = mod.isTagged;
  }
  return _isTaggedFn;
}

/** Sync check — returns false if tagging module not yet loaded. */
function isTaggedSync(ontology: string, entryId: string): boolean {
  return _isTaggedFn ? _isTaggedFn(ontology, entryId) : false;
}

const logger = defaultLogger;

// ─── Types ──────────────────────────────────────────────────────────────────

interface EntryResult {
  id: string;
  label: string;
  qualifiedId: string;
  description?: string;
  keywords?: string[];
  aliases?: string[];
  synonyms?: string[];
  references?: unknown[];
  parentId?: string;
  [key: string]: unknown;
}

interface BrowseEntry {
  id: string;
  label: string;
  qualifiedId: string;
  isParent?: boolean;
  isChild?: boolean;
  isSibling?: boolean;
  isAncestor?: boolean;
  isDescendant?: boolean;
  depth?: number;
  level?: number;
  parentId?: string;
  description?: string;
  keywords?: string[];
  aliases?: string[];
  references?: unknown[];
  alreadyTagged?: boolean;
  [key: string]: unknown;
}

interface BrowseResponse {
  entries: BrowseEntry[];
  direction: string;
  queryDepth?: number;
  queryLevel?: number;
  queryParentId?: string;
  warning?: string;
  cycleDetected?: boolean;
}

// ─── Built-in fixture packs ─────────────────────────────────────────────────

const THEME_PACK_ENTRIES: Array<Record<string, unknown>> = [
  {
    id: "themes",
    label: "Themes",
    description: "Root category for all themes",
    keywords: ["category", "root"],
    aliases: ["theme-root"],
    references: [{ title: "Organization" }],
  },
  {
    id: "nostalgia",
    label: "Nostalgia",
    description: "A theme of wistful nostalgia and longing for the past",
    keywords: ["memory", "past", "emotion"],
    aliases: ["reminiscence", "sentimentality"],
    synonyms: ["wistful"],
    references: [{ title: "Psychology" }],
    parentId: "themes",
  },
  {
    id: "redemption",
    label: "Redemption",
    description: "A theme of redemption, salvation and renewal",
    keywords: ["salvation", "renewal", "emotion"],
    aliases: ["atonement", "deliverance"],
    synonyms: ["forgiveness"],
    references: [{ title: "Literary Themes" }],
    parentId: "themes",
  },
  {
    id: "emotion",
    label: "Emotion",
    description: "The spectrum of human emotions and feelings",
    keywords: ["feeling", "sentiment", "affect"],
    aliases: ["sentiment", "affect"],
    synonyms: ["feeling"],
    references: [{ title: "Psychology" }],
    parentId: "themes",
  },
  {
    id: "memory",
    label: "Memory",
    description: "The concept of memory and remembrance",
    keywords: ["recall", "past", "remembrance"],
    aliases: ["recollection"],
    synonyms: ["remembrance"],
    references: [{ title: "Psychology" }],
    parentId: "nostalgia",
  },
  {
    id: "longing",
    label: "Longing",
    description: "A feeling of yearning and desire",
    keywords: ["yearning", "desire", "emotion"],
    aliases: ["yearning", "pining"],
    synonyms: ["desire"],
    references: [{ title: "Psychology" }],
    parentId: "nostalgia",
  },
  {
    id: "mood",
    label: "Mood",
    description: "The emotional mood and feel of a piece",
    keywords: ["feeling", "emotion", "tone"],
    aliases: ["ambiance", "vibe"],
    synonyms: ["feeling"],
    references: [{ title: "Psychology" }],
    parentId: "emotion",
  },
  {
    id: "joy",
    label: "Joy",
    description: "A feeling of great happiness",
    keywords: ["happiness", "delight"],
    aliases: ["happiness", "delight"],
    synonyms: ["happiness"],
    references: [{ title: "Psychology" }],
    parentId: "emotion",
  },
];

const CIRCULAR_PACK_ENTRIES: Array<Record<string, unknown>> = [
  {
    id: "entry-a",
    label: "Entry A",
    description: "First entry in circular chain",
    keywords: ["cycle"],
    parentId: "entry-c",
  },
  {
    id: "entry-b",
    label: "Entry B",
    description: "Second entry in circular chain",
    keywords: ["cycle"],
    parentId: "entry-a",
  },
  {
    id: "entry-c",
    label: "Entry C",
    description: "Third entry in circular chain",
    keywords: ["cycle"],
    parentId: "entry-b",
  },
];

const PACK_A_ENTRIES: Array<Record<string, unknown>> = [
  {
    id: "shared-id",
    label: "Shared Entry (Pack A)",
    description: "An entry in pack-a that also exists in pack-b",
    keywords: ["shared", "common"],
    aliases: ["pack-a-shared"],
    references: [{ title: "Pack A Reference" }],
  },
  {
    id: "unique-a",
    label: "Unique A",
    description: "An entry unique to pack-a",
    keywords: ["unique"],
    aliases: ["only-in-a"],
    references: [{ title: "Pack A Only" }],
  },
];

const PACK_B_ENTRIES: Array<Record<string, unknown>> = [
  {
    id: "shared-id",
    label: "Shared Entry (Pack B)",
    description: "An entry in pack-b that also exists in pack-a",
    keywords: ["shared", "common"],
    aliases: ["pack-b-shared"],
    references: [{ title: "Pack B Reference" }],
  },
  {
    id: "unique-b",
    label: "Unique B",
    description: "An entry unique to pack-b",
    keywords: ["unique"],
    aliases: ["only-in-b"],
    references: [{ title: "Pack B Only" }],
  },
];

// ─── Fixture initialization (synchronous at module load) ────────────────────
// Packs are installed synchronously at import time so that tests can
// extract valid entry IDs for property-test generators before any
// async function is called. installPack's body runs synchronously
// (buildIndex + Map.set) even though it returns a Promise.

function installFixtures(): void {
  if (!getPackIndex("theme-pack")) {
    installPack({ name: "theme-pack", entries: THEME_PACK_ENTRIES });
  }
  if (!getPackIndex("circular-pack")) {
    installPack({ name: "circular-pack", entries: CIRCULAR_PACK_ENTRIES });
  }
  if (!getPackIndex("pack-a")) {
    installPack({ name: "pack-a", entries: PACK_A_ENTRIES });
  }
  if (!getPackIndex("pack-b")) {
    installPack({ name: "pack-b", entries: PACK_B_ENTRIES });
  }
}

// Install fixtures only in test environment — production loads packs from disk
if (process.env.VITEST || process.env.NODE_ENV === "test") {
  installFixtures();
}

/** @internal Install test fixtures on demand (for test setup). */
export { installFixtures as _installFixtures };

// ─── Exported fixture metadata (for property-test generators) ───────────────

/** All fixture pack names available after module load. */
export const FIXTURE_PACK_NAMES = [
  "theme-pack",
  "circular-pack",
  "pack-a",
  "pack-b",
] as const;

/** All valid entry IDs across all fixture packs, for property-test generators. */
export const FIXTURE_ENTRY_IDS: string[] = [
  ...THEME_PACK_ENTRIES.map((e) => e.id as string),
  ...CIRCULAR_PACK_ENTRIES.map((e) => e.id as string),
  ...PACK_A_ENTRIES.map((e) => e.id as string),
  ...PACK_B_ENTRIES.map((e) => e.id as string),
];

/** All valid entry IDs per fixture pack, available for property-test generators. */
export const FIXTURE_ENTRY_IDS_BY_PACK: Record<string, string[]> = {
  "theme-pack": THEME_PACK_ENTRIES.map((e) => e.id as string),
  "circular-pack": CIRCULAR_PACK_ENTRIES.map((e) => e.id as string),
  "pack-a": PACK_A_ENTRIES.map((e) => e.id as string),
  "pack-b": PACK_B_ENTRIES.map((e) => e.id as string),
};

// ─── Tree depth computation ─────────────────────────────────────────────────

function computeEntryDepth(
  entryId: string,
  allEntries: Map<string, Record<string, unknown>>,
): number {
  let depth = 0;
  let currentId: string | undefined = entryId;
  const visited = new Set<string>();

  while (currentId) {
    if (visited.has(currentId)) break; // cycle protection
    visited.add(currentId);
    const entry = allEntries.get(currentId);
    if (!entry) break;
    const parentId = getEntryParentId(entry as Record<string, unknown>);
    if (!parentId) break;
    depth++;
    currentId = parentId;
  }

  return depth;
}

// ─── Error helpers ──────────────────────────────────────────────────────────

function makeNotFoundError(
  message: string,
  qualifiedId?: string,
): NotFoundError {
  const err = new NotFoundError(message);
  if (qualifiedId) {
    (err as unknown as Record<string, unknown>).qualifiedId = qualifiedId;
  }
  return err;
}

// ─── Entry field helpers ────────────────────────────────────────────────────

function getEntryParentId(entry: Record<string, unknown>): string | undefined {
  if (typeof entry.parentId === "string" && entry.parentId) {
    return entry.parentId;
  }
  if (Array.isArray(entry.parents) && entry.parents.length > 0) {
    const first = entry.parents[0];
    if (typeof first === "string") return first;
  }
  return undefined;
}

// ─── Detail level filtering (ONT-06) ────────────────────────────────────────

const INTERNAL_FIELDS = new Set(["source"]);

function applyDetailLevel(
  entry: Record<string, unknown>,
  entryId: string,
  packName: string,
  detailLevel: string,
): EntryResult {
  const qualifiedId = `${packName}:${entryId}`;

  if (detailLevel === "minimal") {
    return { id: entryId, label: entry.label as string, qualifiedId };
  }

  if (detailLevel === "standard") {
    const result: EntryResult = {
      id: entryId,
      label: entry.label as string,
      qualifiedId,
    };
    if (entry.description !== undefined)
      result.description = entry.description as string;
    if (entry.keywords !== undefined)
      result.keywords = entry.keywords as string[];
    const parentId = getEntryParentId(entry);
    if (parentId !== undefined) result.parentId = parentId;
    if (entry.parents !== undefined) result.parents = entry.parents as unknown;
    return result;
  }

  // full: all fields
  const result: EntryResult = {
    id: entryId,
    label: entry.label as string,
    qualifiedId,
  };
  for (const [key, value] of Object.entries(entry)) {
    if (key === "id" || key === "label" || INTERNAL_FIELDS.has(key)) continue;
    result[key] = value;
  }
  return result;
}

function applyFieldsSelector(
  result: EntryResult,
  entry: Record<string, unknown>,
  fields: string[],
): EntryResult {
  const filtered: EntryResult = {
    id: result.id,
    label: result.label,
    qualifiedId: result.qualifiedId,
  };
  for (const field of fields) {
    if (field in result) {
      filtered[field] = result[field];
    } else if (field in entry) {
      filtered[field] = entry[field];
    }
  }
  return filtered;
}

// ─── Cycle detection for all directions ─────────────────────────────────────

/**
 * Check if an entry is part of a cycle by following parent chain.
 * Returns true if a cycle exists in the entry's ancestry.
 */
function isPartOfCycle(
  entryId: string,
  allEntries: Map<string, Record<string, unknown>>,
): boolean {
  const visited = new Set<string>();
  let currentId: string | undefined = entryId;
  while (currentId) {
    if (visited.has(currentId)) return true;
    visited.add(currentId);
    const entry = allEntries.get(currentId);
    if (!entry) break;
    currentId = getEntryParentId(entry as Record<string, unknown>);
  }
  return false;
}

// ─── getOntologyEntry ───────────────────────────────────────────────────────

/**
 * Retrieve full details for a specific ontology entry by pack and entry ID.
 * Supports optional fields selector and detail_level filtering (ONT-06).
 * Entry IDs are always pack-scoped in responses (ONT-12).
 */
export async function getOntologyEntry(params: {
  ontology: string;
  entryId: string;
  fields?: string[];
  detailLevel?: string;
}): Promise<{ entry: EntryResult }> {
  const { ontology, entryId, fields, detailLevel = "standard" } = params;

  let index = getPackIndex(ontology);
  if (!index) {
    throw makeNotFoundError(`Pack '${ontology}' not found`);
  }

  let rawEntry = index.entries.get(entryId);
  // If entry not found, try reloading from disk (pack may have been overwritten)
  if (!rawEntry) {
    const reloaded = await reloadPackFromDisk(ontology);
    if (reloaded) {
      index = reloaded;
      rawEntry = index.entries.get(entryId);
    }
  }
  if (!rawEntry) {
    throw makeNotFoundError(
      `Entry '${ontology}:${entryId}' not found`,
      `${ontology}:${entryId}`,
    );
  }

  const entry = rawEntry as Record<string, unknown>;
  let result = applyDetailLevel(entry, entryId, ontology, detailLevel);

  if (fields && fields.length > 0) {
    result = applyFieldsSelector(result, entry, fields);
  }

  return { entry: result };
}

// ─── browseOntology ─────────────────────────────────────────────────────────

/**
 * Browse an entry's neighborhood: parents, children, siblings.
 * Supports directional navigation and cycle detection (ONT-18).
 * Entry IDs are always pack-scoped in responses (ONT-12).
 */
export async function browseOntology(params: {
  ontology: string;
  entryId: string;
  direction: "up" | "down" | "around" | "all";
  detailLevel?: string;
}): Promise<BrowseResponse> {
  const { ontology, entryId, direction, detailLevel = "standard" } = params;

  // Eagerly initialize isTagged for alreadyTagged enrichment
  await getIsTagged();

  let index = getPackIndex(ontology);
  if (!index) {
    throw makeNotFoundError(`Pack '${ontology}' not found`);
  }

  let rawEntry = index.entries.get(entryId);
  // If entry not found, try reloading from disk (pack may have been overwritten)
  if (!rawEntry) {
    const reloaded = await reloadPackFromDisk(ontology);
    if (reloaded) {
      index = reloaded;
      rawEntry = index.entries.get(entryId);
    }
  }
  if (!rawEntry) {
    throw makeNotFoundError(
      `Entry '${entryId}' not found in pack '${ontology}'`,
    );
  }

  const entry = rawEntry as Record<string, unknown>;
  const queryParentId = getEntryParentId(entry);

  const allEntries = index.entries as Map<string, Record<string, unknown>>;

  // Compute absolute tree depth of queried entry
  const queryDepth = computeEntryDepth(entryId, allEntries);
  const queryLevel = queryDepth;

  const entries: BrowseEntry[] = [];
  let cycleDetected = false;
  let warning: string | undefined;

  // Check if the queried entry itself is part of a cycle
  const entryInCycle = isPartOfCycle(entryId, allEntries);

  // UP: traverse parent chain with cycle detection (ONT-18)
  if (direction === "up" || direction === "all") {
    const visited = new Set<string>([entryId]);
    let currentId = queryParentId;

    while (currentId) {
      if (visited.has(currentId)) {
        cycleDetected = true;
        warning = `Circular parent chain detected at entry '${currentId}'`;
        logger.warn(warning);
        break;
      }
      visited.add(currentId);

      const parentEntry = allEntries.get(currentId);
      if (!parentEntry) break;

      const pe = parentEntry as Record<string, unknown>;
      const isDirectParent = visited.size === 2; // entryId + this one
      const entryDepth = computeEntryDepth(currentId, allEntries);

      const browseEntry: BrowseEntry = {
        ...applyDetailLevel(pe, currentId, ontology, detailLevel),
        ...(isDirectParent ? { isParent: true } : { isAncestor: true }),
        depth: entryDepth,
        level: entryDepth,
        alreadyTagged: isTaggedSync(ontology, currentId),
      };

      entries.push(browseEntry);

      currentId = getEntryParentId(pe);
    }
  }

  // DOWN: recursive descendant traversal with cycle detection (ONT-18)
  if (direction === "down" || direction === "all") {
    const visited = new Set<string>([entryId]);
    const queue: Array<{ id: string; directChild: boolean }> = [];

    // Seed queue with direct children
    for (const [id, e] of allEntries.entries()) {
      if (id === entryId) continue;
      const pid = getEntryParentId(e as Record<string, unknown>);
      if (pid === entryId) {
        queue.push({ id, directChild: true });
      }
    }

    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) break;
      const { id, directChild } = item;
      if (visited.has(id)) {
        cycleDetected = true;
        warning = `Circular reference detected at entry '${id}'`;
        logger.warn(warning);
        continue;
      }
      visited.add(id);

      const e = allEntries.get(id);
      if (!e) continue;

      const entryDepth = computeEntryDepth(id, allEntries);
      const browseEntry: BrowseEntry = {
        ...applyDetailLevel(
          e as Record<string, unknown>,
          id,
          ontology,
          detailLevel,
        ),
        ...(directChild ? { isChild: true } : { isDescendant: true }),
        depth: entryDepth,
        level: entryDepth,
        alreadyTagged: isTaggedSync(ontology, id),
      };
      entries.push(browseEntry);

      // Enqueue this entry's children for recursive traversal
      for (const [childId, childEntry] of allEntries.entries()) {
        if (childId === id) continue;
        const pid = getEntryParentId(childEntry as Record<string, unknown>);
        if (pid === id) {
          queue.push({ id: childId, directChild: false });
        }
      }
    }
  }

  // AROUND: find siblings (same parentId, excluding self)
  if (direction === "around" || direction === "all") {
    if (queryParentId) {
      for (const [id, e] of allEntries.entries()) {
        if (id === entryId) continue;
        const pid = getEntryParentId(e as Record<string, unknown>);
        if (pid === queryParentId) {
          const entryDepth = computeEntryDepth(id, allEntries);
          const browseEntry: BrowseEntry = {
            ...applyDetailLevel(
              e as Record<string, unknown>,
              id,
              ontology,
              detailLevel,
            ),
            isSibling: true,
            depth: entryDepth,
            level: entryDepth,
            alreadyTagged: isTaggedSync(ontology, id),
          };
          entries.push(browseEntry);
        }
      }
    }

    // For "around" direction, also detect cycles in the entry's relationships
    if (entryInCycle) {
      cycleDetected = true;
      warning = `Circular reference detected in entry relationships`;
      logger.warn(warning);
    }
  }

  const response: BrowseResponse = {
    entries,
    direction,
    queryDepth,
    queryLevel,
  };

  if (queryParentId !== undefined) {
    response.queryParentId = queryParentId;
  }

  if (cycleDetected) {
    response.cycleDetected = true;
    response.warning = warning;
  }

  return response;
}

// ─── Column Listing ──────────────────────────────────────────────────────────

/**
 * List available columns for an ontology pack by sampling entries.
 * Helps users choose which columns to display in structured sections.
 */
export function listOntologyColumns(params: { ontology: string }): {
  columns: Array<{ name: string; sampleValues: string[] }>;
  entryCount: number;
} {
  const packIndex = getPackIndex(params.ontology);
  if (!packIndex) {
    throw new Error(`Pack '${params.ontology}' not found`);
  }

  // Collect all unique keys from entries, sample values
  const columnMap = new Map<string, string[]>();
  let sampled = 0;

  for (const [, entry] of packIndex.entries) {
    const data = entry as Record<string, unknown>;
    for (const [key, value] of Object.entries(data)) {
      if (!columnMap.has(key)) {
        columnMap.set(key, []);
      }
      const samples = columnMap.get(key) ?? [];
      if (samples.length < 3 && value !== undefined && value !== null) {
        const formatted = Array.isArray(value)
          ? value.slice(0, 2).join("; ")
          : String(value).slice(0, 80);
        if (formatted) samples.push(formatted);
      }
    }
    sampled++;
    if (sampled >= 10) break;
  }

  const columns = [...columnMap.entries()].map(([name, sampleValues]) => ({
    name,
    sampleValues,
  }));

  return { columns, entryCount: packIndex.entries.size };
}
