// src/ontology/pack-loader.ts — Ontology pack disk persistence
// Loads/saves ontology packs from ~/.brief/ontologies/{packName}/pack.json

import * as fsp from "node:fs/promises";
import path from "node:path";

import { getConfigDir } from "../config/config.js"; // check-rules-ignore
import { atomicWriteFile, readFileSafe } from "../io/file-io.js"; // check-rules-ignore

// ── Types ────────────────────────────────────────────────────────────────────

export interface PackEntry {
  id: string;
  label: string;
  description?: string;
  keywords?: string[];
  aliases?: string[];
  synonyms?: string[];
  references?: unknown[];
  parentId?: string;
  categories?: string[];
  tags?: string[];
  [key: string]: unknown;
}

export interface PackData {
  name: string;
  version?: string;
  entries: PackEntry[];
  synonyms?: Record<string, string[]>;
  searchFields?: string[];
  description?: string;
}

// ── Bundled packs ────────────────────────────────────────────────────────────
// These were previously hardcoded as fixture data in browse.ts and
// suggestion.ts. They serve as defaults installed on first run.

export const BUNDLED_PACKS: PackData[] = [
  {
    name: "theme-pack",
    version: "1.0.0",
    description: "Themes and emotions for creative projects",
    entries: [
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
        references: [
          {
            creator: "Bon Iver",
            title: "For Emma, Forever Ago",
            type: "album",
          },
          { creator: "Jean-Pierre Jeunet", title: "Amelie", type: "film" },
          { title: "Psychology" },
        ],
        parentId: "themes",
        categories: ["emotion"],
        tags: ["indie-folk", "cinema"],
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
      {
        id: "freedom",
        label: "Freedom",
        description: "A theme of freedom and liberation",
        keywords: ["liberty", "independence"],
        references: [
          { creator: "Jon Krakauer", title: "Into the Wild", type: "book" },
          { creator: "Sean Penn", title: "Into the Wild", type: "film" },
        ],
        categories: ["theme"],
        tags: ["adventure", "wilderness"],
      },
      {
        id: "spirit",
        label: "Spirit",
        description: "Spirited Away - themes of identity and belonging",
        keywords: ["identity", "belonging", "animation"],
        references: [
          { creator: "Hayao Miyazaki", title: "Spirited Away", type: "film" },
        ],
        categories: ["theme"],
        tags: ["animation", "japanese"],
      },
    ],
  },
  {
    name: "film-pack",
    version: "1.0.0",
    description: "Film and soundtrack references",
    entries: [
      {
        id: "wild-song",
        label: "Wild Soundtrack",
        description: "Into the Wild film soundtrack",
        references: [
          { creator: "Eddie Vedder", title: "Into the Wild", type: "song" },
        ],
        categories: ["soundtrack"],
        tags: ["rock"],
      },
      {
        id: "crosspack-b",
        label: "Shared B",
        references: [
          { creator: "Various", title: "Common Title", type: "book" },
        ],
        categories: ["misc"],
        tags: ["shared"],
      },
    ],
  },
];

/** All bundled pack names. */
export const BUNDLED_PACK_NAMES = BUNDLED_PACKS.map((p) => p.name);

/** All bundled entry IDs per pack. */
export const BUNDLED_ENTRY_IDS_BY_PACK: Record<string, string[]> =
  Object.fromEntries(
    BUNDLED_PACKS.map((p) => [p.name, p.entries.map((e) => e.id)]),
  );

/** All bundled entry IDs (flat). */
export const BUNDLED_ENTRY_IDS: string[] = BUNDLED_PACKS.flatMap((p) =>
  p.entries.map((e) => e.id),
);

// ── Disk operations ──────────────────────────────────────────────────────────

function ontologiesDir(): string {
  return path.join(getConfigDir(), "ontologies");
}

function packDir(packName: string): string {
  return path.join(ontologiesDir(), packName);
}

function packFilePath(packName: string): string {
  return path.join(packDir(packName), "pack.json");
}

/** Load a pack from disk. Returns null if not found. */
export async function loadPackFromDisk(
  packName: string,
): Promise<PackData | null> {
  try {
    const raw = await readFileSafe(packFilePath(packName));
    return JSON.parse(raw) as PackData;
  } catch {
    return null;
  }
}

/** Save a pack to disk. */
export async function savePackToDisk(pack: PackData): Promise<void> {
  const dir = packDir(pack.name);
  await fsp.mkdir(dir, { recursive: true });
  await atomicWriteFile(packFilePath(pack.name), JSON.stringify(pack, null, 2));
}

/** Remove a pack from disk. */
export async function removePackFromDisk(packName: string): Promise<boolean> {
  try {
    await fsp.rm(packDir(packName), { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

/** List all installed pack names (directories under ~/.brief/ontologies/). */
export async function listInstalledPacks(): Promise<string[]> {
  const dir = ontologiesDir();
  try {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

/**
 * Ensure bundled packs are installed on disk.
 * Only writes packs that don't already exist (won't overwrite user edits).
 */
export async function ensureBundledPacks(): Promise<string[]> {
  const installed: string[] = [];
  const existing = await listInstalledPacks();
  const existingSet = new Set(existing);

  for (const pack of BUNDLED_PACKS) {
    if (!existingSet.has(pack.name)) {
      await savePackToDisk(pack);
      installed.push(pack.name);
    }
  }

  return installed;
}

/**
 * Load all installed packs from disk.
 * Returns an array of PackData for every valid pack.json found.
 */
export async function loadAllPacks(): Promise<PackData[]> {
  const names = await listInstalledPacks();
  const results = await Promise.all(
    names.map((name) => loadPackFromDisk(name)),
  );
  return results.filter((pack): pack is PackData => pack !== null);
}
