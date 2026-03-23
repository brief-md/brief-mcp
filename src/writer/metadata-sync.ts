// src/writer/metadata-sync.ts — TASK-16: Writer — Metadata Sync & Section Targeting

import type { MetadataSyncParams, WriterResult } from "../types/writer.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function buildNewFileContent(extensionMetaName: string): string {
  const today = todayISO();
  return [
    "**Project:** ",
    "**Type:** ",
    `**Extensions:** ${extensionMetaName}`,
    "**Status:** concept",
    `**Created:** ${today}`,
    `**Updated:** ${today}`,
    "**Version:** 1.0",
    "",
  ].join("\n");
}

// Canonical metadata field order for new files (WRITE-11)
// Ontologies removed — ontology config belongs in type guides, not BRIEF.md metadata.
export const CANONICAL_FIELD_ORDER = [
  "Project",
  "Type",
  "Extensions",
  "Status",
  "Created",
  "Updated",
  "Version",
];

// ---------------------------------------------------------------------------
// syncUpdatedTimestamp
// ---------------------------------------------------------------------------

/**
 * Replace (or insert) the **Updated:** metadata line with today's ISO date.
 * If no **Updated:** line exists, inserts one after **Created:** (or appends
 * to the metadata block).
 */
export function syncUpdatedTimestamp(content: string): string {
  const today = todayISO();
  const updatedRe = /^\*\*Updated:\*\*\s*.*$/m;

  if (updatedRe.test(content)) {
    return content.replace(updatedRe, `**Updated:** ${today}`);
  }

  // Insert after **Created:** line if present
  const createdRe = /^(\*\*Created:\*\*\s*.*)$/m;
  if (createdRe.test(content)) {
    return content.replace(createdRe, `$1\n**Updated:** ${today}`);
  }

  // Fallback: insert before first blank line or at end of first line block
  const firstBlankLine = content.indexOf("\n\n");
  if (firstBlankLine >= 0) {
    return (
      content.slice(0, firstBlankLine) +
      `\n**Updated:** ${today}` +
      content.slice(firstBlankLine)
    );
  }

  return `${content}\n**Updated:** ${today}\n`;
}

// ---------------------------------------------------------------------------
// syncTypeGuideMetadata (DEPRECATED)
// ---------------------------------------------------------------------------

/**
 * @deprecated Type guides are now resolved via the **Type:** field directly.
 * The **Type:** value IS the type guide lookup key — no separate metadata field needed.
 */
export function syncTypeGuideMetadata(
  content: string,
  _params: { slug: string; source: string },
): string {
  return content;
}

// ---------------------------------------------------------------------------
// translateExtensionName
// ---------------------------------------------------------------------------

/**
 * Translate an extension name between heading format and metadata format.
 * "toMetadata": "SONIC ARTS" → "sonic_arts"
 * "toHeading":  "sonic_arts" → "SONIC ARTS"
 */
export function translateExtensionName(
  name: string,
  direction: "toMetadata" | "toHeading",
): string {
  if (direction === "toMetadata") {
    return name.toLowerCase().replace(/ /g, "_");
  } else {
    return name.toUpperCase().replace(/_/g, " ");
  }
}

// ---------------------------------------------------------------------------
// validateExtensionName
// ---------------------------------------------------------------------------

/**
 * Validate an extension name (must be [A-Z0-9 ]+).
 * Throws on invalid input. (SEC-19)
 */
export function validateExtensionName(name: string): void {
  if (!/^[A-Z0-9 ]+$/.test(name)) {
    throw new Error(
      `Invalid extension name "${name}": must contain only uppercase letters (A-Z), digits (0-9), and spaces`,
    );
  }
}

// ---------------------------------------------------------------------------
// syncExtensionMetadata
// ---------------------------------------------------------------------------

/**
 * Sync extension metadata (add or remove an extension name from the Extensions field).
 * Returns the updated content string. (WRITE-05, WRITE-12)
 */
export async function syncExtensionMetadata(
  inputContent: string,
  params: {
    action: "add" | "remove";
    extensionName: string;
    isNewFile?: boolean;
  },
): Promise<string> {
  const metaName = translateExtensionName(params.extensionName, "toMetadata");

  // New file: generate canonical field order (WRITE-11)
  if (params.isNewFile && !inputContent.trim()) {
    return buildNewFileContent(params.action === "add" ? metaName : "");
  }

  if (params.action === "add") {
    if (/\*\*Extensions:\*\*/.test(inputContent)) {
      return inputContent.replace(
        /(\*\*Extensions:\*\*\s*)(.*)/,
        (_match, prefix: string, existing: string) => {
          const trimmed = existing.trim();
          if (!trimmed) return `${prefix}${metaName}`;
          const items = trimmed
            .split(",")
            .map((s: string) => s.trim())
            .filter(Boolean);
          if (!items.includes(metaName)) items.push(metaName);
          return `${prefix}${items.join(", ")}`;
        },
      );
    } else {
      // Add Extensions field after Type if present
      if (/\*\*Type:\*\*/.test(inputContent)) {
        return inputContent.replace(
          /(\*\*Type:\*\*[^\n]*\n)/,
          `$1**Extensions:** ${metaName}\n`,
        );
      }
      return `**Extensions:** ${metaName}\n${inputContent}`;
    }
  } else {
    // remove
    return inputContent.replace(
      /(\*\*Extensions:\*\*\s*)(.*)/,
      (_match, prefix: string, existing: string) => {
        const trimmed = existing.trim();
        const items = trimmed
          .split(",")
          .map((s: string) => s.trim())
          .filter(Boolean)
          .filter((item: string) => item !== metaName);
        return `${prefix}${items.join(", ")}`;
      },
    );
  }
}

// ---------------------------------------------------------------------------
// syncOntologyMetadata (DEPRECATED)
// ---------------------------------------------------------------------------

/**
 * @deprecated Ontology configuration now belongs in type guides, not BRIEF.md metadata.
 * The **Ontologies:** field is no longer written to BRIEF.md files.
 * Ontology packs are tracked in type guide YAML frontmatter (suggested_ontologies).
 */
export async function syncOntologyMetadata(
  inputContent: string,
  params: { pack: string; version?: string },
): Promise<string> {
  const { pack, version } = params;
  const versionSuffix = version ? ` (${version})` : "";
  const entry = `${pack}${versionSuffix}`;

  // If Ontologies field exists, append to it
  if (/\*\*Ontologies:\*\*/.test(inputContent)) {
    return inputContent.replace(
      /(\*\*Ontologies:\*\*\s*)(.*)/,
      (_match, prefix: string, existing: string) => {
        const trimmed = existing.trim();
        if (!trimmed) return `${prefix}${entry}`;
        if (trimmed.includes(pack)) return `${prefix}${trimmed}`;
        return `${prefix}${trimmed}, ${entry}`;
      },
    );
  }

  // No Ontologies field — prepend one
  return `**Ontologies:** ${entry}\n${inputContent}`;
}

// ---------------------------------------------------------------------------
// checkIdempotentTag
// ---------------------------------------------------------------------------

/**
 * Check if an ontology tag is already applied (idempotent tagging). (WRITE-15)
 * - alreadyTagged: true  → exact duplicate, nothing to do
 * - alreadyTagged: false + content → same pack/entryId, label updated in content
 * - alreadyTagged: false, no content → tag not found
 */
export async function checkIdempotentTag(
  inputContent: string,
  params: {
    pack: string;
    entryId: string;
    label: string;
    targetLine: number;
  },
): Promise<{ alreadyTagged: boolean; content?: string }> {
  const { pack, entryId, label } = params;

  const existingTagRe = new RegExp(
    `<!--\\s*brief:ontology\\s+${escapeRe(pack)}\\s+${escapeRe(entryId)}\\s+"([^"]*)"\\s*-->`,
  );
  const match = existingTagRe.exec(inputContent);

  if (!match) {
    return { alreadyTagged: false };
  }

  if (match[1] === label) {
    return { alreadyTagged: true };
  }

  // Same tag, different label — update label in-place
  const updatedContent = inputContent.replace(
    existingTagRe,
    `<!-- brief:ontology ${pack} ${entryId} "${label}" -->`,
  );
  return { alreadyTagged: false, content: updatedContent };
}

// ---------------------------------------------------------------------------
// checkIdempotentExtension
// ---------------------------------------------------------------------------

/**
 * Check if an extension already exists (idempotent extension creation). (WRITE-18)
 */
export async function checkIdempotentExtension(
  inputContent: string,
  extensionName: string,
): Promise<{
  alreadyExists: boolean;
  existingContent?: string;
  metadataUpdated?: boolean;
}> {
  const headingRe = new RegExp(`^##\\s+${escapeRe(extensionName)}\\s*$`, "m");
  const headingMatch = headingRe.exec(inputContent);

  if (!headingMatch) {
    return { alreadyExists: false };
  }

  // Extract section body up to next ## heading
  const afterHeading = inputContent.slice(
    headingMatch.index + headingMatch[0].length,
  );
  const nextHeadingMatch = /^##/m.exec(afterHeading);
  const body = nextHeadingMatch
    ? afterHeading.slice(0, nextHeadingMatch.index)
    : afterHeading;

  // Check if extension is in **Extensions:** metadata
  const metaName = translateExtensionName(extensionName, "toMetadata");
  const inMetadata = new RegExp(
    `\\*\\*Extensions:\\*\\*[^\\n]*\\b${escapeRe(metaName)}\\b`,
  ).test(inputContent);

  if (!inMetadata) {
    return {
      alreadyExists: true,
      existingContent: body.trim(),
      metadataUpdated: true,
    };
  }

  return { alreadyExists: true, existingContent: body.trim() };
}

// ---------------------------------------------------------------------------
// preserveToolSpecificSections
// ---------------------------------------------------------------------------

/**
 * Preserve tool-specific sections while modifying a core section. (WRITE-09, WRITE-10)
 * Returns the updated content string.
 */
export async function preserveToolSpecificSections(
  inputContent: string,
  params: {
    modifySection: string;
    newContent: string;
    canFitInCoreSection?: boolean;
  },
): Promise<string> {
  // Enforce brief-mcp tool-specific section policy (WRITE-10)
  if (
    /TOOL SPECIFIC:\s*brief-mcp/i.test(params.modifySection) &&
    params.canFitInCoreSection
  ) {
    throw new Error(
      "Refusing to create brief-mcp tool-specific section (last resort policy): " +
        "data should go in a core or extension section.",
    );
  }

  // Find the target section heading (## Section Name or # TOOL SPECIFIC: ...)
  const sectionRe = new RegExp(
    `^(#{1,3})\\s+${escapeRe(params.modifySection)}\\s*$`,
    "m",
  );
  const match = sectionRe.exec(inputContent);

  if (!match) {
    return inputContent;
  }

  const headingEnd = match.index + match[0].length;
  const before = inputContent.slice(0, headingEnd);
  const headingLevel = match[1].length;

  // Find end of this section's body (next heading at level <= headingLevel)
  const afterHeader = inputContent.slice(headingEnd);
  const nextSectionRe = new RegExp(`^#{1,${headingLevel}} `, "m");
  const nextMatch = nextSectionRe.exec(afterHeader);
  const after = nextMatch ? afterHeader.slice(nextMatch.index) : "";

  return `${before}\n${params.newContent}\n${after ? `\n${after}` : ""}`;
}

// ---------------------------------------------------------------------------
// writeExternalSessionBreadcrumb
// ---------------------------------------------------------------------------

/**
 * Write an external session breadcrumb entry. (WRITE-16a)
 * Format: "- {date} {tool}: {n} decisions captured — {comma-separated titles}"
 */
export async function writeExternalSessionBreadcrumb(
  inputContent: string,
  params: {
    date: string;
    tool: string;
    decisionCount: number;
    titles: string[];
  },
): Promise<string> {
  const { date, tool, decisionCount, titles } = params;
  const line = `- ${date} ${tool}: ${decisionCount} decisions captured — ${titles.join(", ")}`;

  const extSessionsRe = /^## External Tool Sessions\s*$/m;

  if (extSessionsRe.test(inputContent)) {
    return inputContent.replace(
      extSessionsRe,
      (heading) => `${heading}\n${line}`,
    );
  }

  // Create section at end of file
  const trimmed = inputContent.trimEnd();
  return `${trimmed}\n\n## External Tool Sessions\n${line}\n`;
}

// ---------------------------------------------------------------------------
// separateDecisionsByStatus — internal utility
// ---------------------------------------------------------------------------

export function separateDecisionsByStatus<T extends { status?: string }>(
  decisions: T[],
): { active: T[]; superseded: T[]; exception: T[] } {
  return {
    active: decisions.filter((d) => !d.status || d.status === "active"),
    superseded: decisions.filter((d) => d.status === "superseded"),
    exception: decisions.filter((d) => d.status === "exception"),
  };
}

// ---------------------------------------------------------------------------
// In-flight write tracking
// ---------------------------------------------------------------------------

let _inFlightWrites = 0;

export function incrementInFlightWrites(): void {
  _inFlightWrites++;
}

export function decrementInFlightWrites(): void {
  _inFlightWrites = Math.max(0, _inFlightWrites - 1);
}

export function getInFlightWriteCount(): number {
  return _inFlightWrites;
}

// ---------------------------------------------------------------------------
// Deprecated shims
// ---------------------------------------------------------------------------

/** @deprecated Use translateExtensionName(name, "toMetadata") instead */
export function headingToMetadataFormat(headingName: string): string {
  return translateExtensionName(headingName, "toMetadata");
}

/** @deprecated Use translateExtensionName(name, "toHeading") instead */
export function metadataToHeadingFormat(metadataName: string): string {
  return translateExtensionName(metadataName, "toHeading");
}

/** @deprecated Use syncExtensionMetadata instead */
export async function writeMetadataField(
  _filePath: string,
  _params: MetadataSyncParams,
): Promise<WriterResult> {
  throw new Error(
    "writeMetadataField is deprecated. Use syncExtensionMetadata.",
  );
}
