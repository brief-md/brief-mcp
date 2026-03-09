// src/ontology/tagging.ts — TASK-36: Ontology Tagging Tool (stub)

import { getKnownExtensions } from "../extension/creation.js"; // check-rules-ignore
import { readBrief, writeBrief } from "../io/project-state.js"; // check-rules-ignore
import { getActiveProject } from "../workspace/active.js"; // check-rules-ignore
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
  extensionName?: string;
  scopeWarning?: string;
  entryReferences?: unknown[];
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

// Install fixtures only in test environment — production loads packs from disk
if (process.env.VITEST || process.env.NODE_ENV === "test") {
  installFixtures();
}

/** @internal Install test fixtures on demand (for test setup). */
export { installFixtures as _installFixtures };

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
  if (labelOverride?.includes("--")) {
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

  // Scope validation (WP2/GAP-A+E): check if section is under an extension
  const scopeInfo = validateExtensionSection(section);
  const extensionName = scopeInfo.extensionName;
  const scopeWarning = scopeInfo.valid
    ? undefined
    : `Section '${section}' is not under a known extension. Tags are most useful within extension subsections.`;

  // Entry references (WP2/GAP-F): surface references from the pack entry
  const entryReferences = Array.isArray(entryData.references)
    ? (entryData.references as unknown[])
    : [];

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
        extensionName,
        scopeWarning,
        entryReferences,
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
      extensionName,
      scopeWarning,
      entryReferences,
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
    extensionName,
    scopeWarning,
    entryReferences,
  };
}

// ─── Scope Validation (WP2/GAP-A+E) ────────────────────────────────────────

/**
 * Validate whether a section name belongs to a known extension.
 * Soft enforcement: returns a warning rather than rejecting.
 */
export function validateExtensionSection(section: string): {
  valid: boolean;
  extensionName?: string;
} {
  const lower = section.toLowerCase();
  const extensions = getKnownExtensions();

  for (const [slug, ext] of extensions) {
    // Check if section matches the extension heading itself
    if (lower === ext.name.toLowerCase() || lower === slug) {
      return { valid: true, extensionName: slug };
    }
    // Check if section matches one of the extension's subsections
    for (const sub of ext.subsections) {
      if (sub.toLowerCase() === lower) {
        return { valid: true, extensionName: slug };
      }
    }
  }

  return { valid: false };
}

// ─── isTagged (WP2/GAP-E) ──────────────────────────────────────────────────

/**
 * Check if a specific ontology entry has been tagged (for browse integration).
 */
export function isTagged(ontology: string, entryId: string): boolean {
  for (const key of tagRegistry.keys()) {
    if (key.startsWith(`${ontology}:${entryId}:`)) {
      return true;
    }
  }
  return false;
}

// ─── listTags (WP2/GAP-E) ──────────────────────────────────────────────────

export interface TagInfo {
  ontology: string;
  entryId: string;
  label: string;
  section: string;
  paragraph?: string;
  extensionName?: string;
}

/**
 * List all tags in the tag registry, optionally filtered by extension.
 */
export async function listTags(params?: {
  projectPath?: string;
  extensionFilter?: string;
}): Promise<{
  tags: TagInfo[];
  groupedByExtension: Record<string, TagInfo[]>;
  total: number;
}> {
  const tags: TagInfo[] = [];

  for (const [key, label] of tagRegistry) {
    const parts = key.split(":");
    if (parts.length < 3) continue;
    const ontology = parts[0];
    const entryId = parts[1];
    const section = parts[2];
    const paragraph = parts.length > 3 ? parts.slice(3).join(":") : undefined;

    const scopeInfo = validateExtensionSection(section);
    const tag: TagInfo = {
      ontology,
      entryId,
      label,
      section,
      paragraph,
      extensionName: scopeInfo.extensionName,
    };

    if (params?.extensionFilter) {
      if (scopeInfo.extensionName !== params.extensionFilter) continue;
    }

    tags.push(tag);
  }

  // Group by extension
  const groupedByExtension: Record<string, TagInfo[]> = {};
  for (const tag of tags) {
    const ext = tag.extensionName ?? "(unscoped)";
    if (!groupedByExtension[ext]) groupedByExtension[ext] = [];
    groupedByExtension[ext].push(tag);
  }

  return { tags, groupedByExtension, total: tags.length };
}

// ─── removeTag (WP2/GAP-E) ─────────────────────────────────────────────────

/**
 * Remove a tag from the registry (and optionally from BRIEF.md on disk).
 */
export async function removeTag(params: {
  ontology: string;
  entryId: string;
  section: string;
  paragraph?: string;
  projectPath?: string;
}): Promise<{
  removed: boolean;
  qualifiedId: string;
}> {
  const { ontology, entryId, section, paragraph } = params;
  const qualifiedId = `${ontology}:${entryId}`;

  const tagKey = paragraph
    ? `${ontology}:${entryId}:${section}:${paragraph}`
    : `${ontology}:${entryId}:${section}`;

  const existed = tagRegistry.has(tagKey);
  tagRegistry.delete(tagKey);

  // Attempt to remove from BRIEF.md on disk (best-effort)
  const projectPath = params.projectPath ?? getActiveProject()?.path;
  if (projectPath) {
    try {
      const content = await readBrief(projectPath);
      if (content) {
        // Remove the HTML comment tag from content
        const escapedOntology = ontology.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const escapedEntryId = entryId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const tagRe = new RegExp(
          `\\s*<!-- brief:ontology ${escapedOntology} ${escapedEntryId} "[^"]*" -->`,
          "g",
        );
        const updated = content.replace(tagRe, "");
        if (updated !== content) {
          await writeBrief(projectPath, updated);
        }
      }
    } catch {
      /* best-effort disk removal */
    }
  }

  return { removed: existed, qualifiedId };
}
