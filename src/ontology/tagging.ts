// src/ontology/tagging.ts — TASK-36: Ontology Tagging Tool (stub)

import { getPackIndex, installPack } from "./management.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TagEntryParams {
  ontology: string;
  entryId: string;
  section: string;
  paragraph?: string;
  labelOverride?: string;
  [key: string]: unknown;
}

export interface TagEntryResult {
  tagged: boolean;
  comment: string;
  label: string;
  alreadyTagged?: boolean;
  labelUpdated?: boolean;
  metadataUpdated?: boolean;
  packVersion?: string;
  updatedOntologiesField?: string;
  metadataDuplicated?: boolean;
  qualifiedId: string;
  targetType: "section" | "paragraph";
  contentPreserved: boolean;
  afterContent: string;
  validated?: boolean;
  entryId?: string;
  [key: string]: unknown;
}

// ─── Built-in fixture packs ─────────────────────────────────────────────────

const TAGGING_THEME_ENTRIES: Array<Record<string, unknown>> = [
  {
    id: "nostalgia",
    label: "Nostalgia",
    description: "A theme of wistful nostalgia and longing for the past",
    keywords: ["memory", "past", "emotion"],
  },
  {
    id: "redemption",
    label: "Redemption",
    description: "A theme of redemption, salvation and renewal",
    keywords: ["salvation", "renewal"],
  },
  {
    id: "longing",
    label: "Longing",
    description: "A feeling of yearning and desire",
    keywords: ["yearning", "desire"],
  },
  {
    id: "emotion",
    label: "Emotion",
    description: "The spectrum of human emotions",
    keywords: ["feeling", "sentiment"],
  },
  {
    id: "entry-1",
    label: "Entry One",
    description: "First generic entry for testing",
    keywords: ["test"],
  },
  {
    id: "entry-2",
    label: "Entry Two",
    description: "Second generic entry for testing",
    keywords: ["test"],
  },
];

const TAGGING_NEW_PACK_ENTRIES: Array<Record<string, unknown>> = [
  {
    id: "entry-1",
    label: "New Pack Entry",
    description: "Entry in new-pack for metadata sync testing",
    keywords: ["test"],
  },
];

// ─── Fixture initialization ────────────────────────────────────────────────

function installFixtures(): void {
  if (!getPackIndex("theme-pack")) {
    installPack({ name: "theme-pack", entries: TAGGING_THEME_ENTRIES });
  }
  if (!getPackIndex("new-pack")) {
    installPack({ name: "new-pack", entries: TAGGING_NEW_PACK_ENTRIES });
  }
}

installFixtures();

// ─── Exported fixture metadata (for property-test generators) ───────────────

export const TAGGING_FIXTURE_PACK_NAMES = ["theme-pack", "new-pack"] as const;

export const TAGGING_FIXTURE_ENTRY_IDS: string[] = [
  ...TAGGING_THEME_ENTRIES.map((e) => e.id as string),
];

// ─── Module state ──────────────────────────────────────────────────────────

/** @internal Reset module-level tagging state for test isolation. */
export function _resetState(): void {
  /* clear all module-level state — implementation will populate */
}

// ─── tagEntry ──────────────────────────────────────────────────────────────

export async function tagEntry(
  _params: TagEntryParams,
): Promise<TagEntryResult> {
  throw new Error("Not implemented");
}
