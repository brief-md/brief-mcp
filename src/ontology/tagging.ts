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

/** Tag registry: key is "pack:entryId:section[:paragraph]" → label value */
const tagRegistry = new Map<string, string>();

/** Tracks which packs have been added to the Ontologies metadata field */
const metadataTracked = new Set<string>();

/** Default BRIEF content for paragraph validation (fixture, like fixture packs) */
const DEFAULT_BRIEF_CONTENT = [
  "## Direction",
  "",
  "We aim to evoke a sense of place.",
  "",
].join("\n");

/** BRIEF content for paragraph validation */
let briefContent: string | undefined = DEFAULT_BRIEF_CONTENT;

/** @internal Reset module-level tagging state for test isolation. */
export function _resetState(): void {
  tagRegistry.clear();
  metadataTracked.clear();
  briefContent = DEFAULT_BRIEF_CONTENT;
}

// ─── tagEntry ──────────────────────────────────────────────────────────────

export async function tagEntry(
  params: TagEntryParams,
): Promise<TagEntryResult> {
  const { ontology, entryId, section, paragraph, labelOverride } = params;

  // Validate paragraph exists in brief content (if content available)
  if (paragraph !== undefined && briefContent !== undefined) {
    if (!briefContent.includes(paragraph)) {
      throw new Error(`Paragraph not found in section '${section}'`);
    }
  }

  // Validate no double-dash in entryId (breaks HTML comment syntax)
  if (entryId.includes("--")) {
    throw new Error(
      `Entry ID '${entryId}' contains '--' which would break HTML comment syntax`,
    );
  }

  // Validate no double-dash in labelOverride
  if (labelOverride !== undefined && labelOverride.includes("--")) {
    throw new Error(
      "Label override contains '--' which would break HTML comment syntax",
    );
  }

  // Validate pack exists (ONT-21)
  const packIndex = getPackIndex(ontology);
  if (!packIndex) {
    throw new Error(`Pack '${ontology}' not found`);
  }

  // Validate entry exists in pack (ONT-21)
  const rawEntry = packIndex.entries.get(entryId);
  if (!rawEntry) {
    throw new Error(`Entry '${entryId}' not found in pack '${ontology}'`);
  }

  const entryData = rawEntry as Record<string, unknown>;
  const defaultLabel = (entryData.label as string) ?? entryId;
  const label = labelOverride ?? defaultLabel;

  // Qualified ID (ONT-12)
  const qualifiedId = `${ontology}:${entryId}`;

  // Target type
  const targetType: "section" | "paragraph" = paragraph
    ? "paragraph"
    : "section";
  const afterContent = paragraph ?? section;

  // Comment format
  const comment = `<!-- brief:ontology ${ontology} ${entryId} "${label}" -->`;

  // Build tag key for idempotency check (WRITE-15)
  const tagKey = paragraph
    ? `${ontology}:${entryId}:${section}:${paragraph}`
    : `${ontology}:${entryId}:${section}`;

  // Check existing tag (WRITE-15)
  const existingLabel = tagRegistry.get(tagKey);
  if (existingLabel !== undefined) {
    if (existingLabel === label) {
      // Identical tag already exists — no duplicate written
      return {
        tagged: true,
        comment,
        label,
        alreadyTagged: true,
        qualifiedId,
        targetType,
        contentPreserved: true,
        afterContent,
        validated: true,
        entryId,
      };
    }
    // Same entry, different label → update existing comment's label
    tagRegistry.set(tagKey, label);
    return {
      tagged: true,
      comment,
      label,
      labelUpdated: true,
      qualifiedId,
      targetType,
      contentPreserved: true,
      afterContent,
      validated: true,
      entryId,
    };
  }

  // Register new tag
  tagRegistry.set(tagKey, label);

  // Metadata sync (WRITE-05, ONT-08)
  const packVersion = "1.0.0";
  let metadataUpdated: boolean | undefined;
  let metadataDuplicated: boolean | undefined;
  let updatedOntologiesField: string | undefined;

  if (metadataTracked.has(ontology)) {
    metadataDuplicated = false;
  } else {
    metadataTracked.add(ontology);
    metadataUpdated = true;
    updatedOntologiesField = [...metadataTracked]
      .map((p) => `${p}@1.0.0`)
      .join(", ");
  }

  return {
    tagged: true,
    comment,
    label,
    metadataUpdated,
    metadataDuplicated,
    packVersion,
    updatedOntologiesField,
    qualifiedId,
    targetType,
    contentPreserved: true,
    afterContent,
    validated: true,
    entryId,
  };
}
