// src/writer/metadata-sync.ts — TASK-16: Writer — Metadata Sync & Section Targeting

import type { MetadataSyncParams, WriterResult } from "../types/writer.js";

// ─── Constants ────────────────────────────────────────────────────────────────

/** BRIEF.md core spec version written to new files (OQ-091). */
const SPEC_VERSION = "1.0";

/** Canonical metadata field order for new files (WRITE-11). */
const CANONICAL_FIELD_ORDER = [
  "Project",
  "Type",
  "Extensions",
  "Status",
  "Created",
  "Updated",
  "Ontologies",
  "Version",
] as const;

// ─── Internal Helpers ──────────────────────────────────────────────────────────

function normalizeLF(input: string): {
  content: string;
  restore: (s: string) => string;
} {
  const hasCRLF = input.includes("\r\n");
  return {
    content: input.replace(/\r\n/g, "\n"),
    restore: hasCRLF
      ? (s: string) => s.replace(/\n/g, "\r\n")
      : (s: string) => s,
  };
}

function getMetadataFieldValue(content: string, fieldName: string): string {
  const prefix = `**${fieldName}:**`;
  for (const line of content.split("\n")) {
    if (line.startsWith(prefix)) {
      return line.slice(prefix.length).trim();
    }
  }
  return "";
}

function updateMetadataField(
  content: string,
  fieldName: string,
  newValue: string,
): string | null {
  const prefix = `**${fieldName}:**`;
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if ((lines[i] ?? "").startsWith(prefix)) {
      lines[i] = newValue ? `${prefix} ${newValue}` : prefix;
      return lines.join("\n");
    }
  }
  return null;
}

function parseCSV(value: string): string[] {
  if (!value.trim()) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function formatCSV(items: string[]): string {
  return items.join(", ");
}

/** Build a canonical metadata block for a new file. */
function buildCanonicalMetadataBlock(extensionName?: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const extensionsValue = extensionName ? ` ${extensionName}` : "";
  const lines = [
    `**${CANONICAL_FIELD_ORDER[0]}:**`,
    `**${CANONICAL_FIELD_ORDER[1]}:**`,
    `**${CANONICAL_FIELD_ORDER[2]}:**${extensionsValue}`,
    `**${CANONICAL_FIELD_ORDER[3]}:**`,
    `**${CANONICAL_FIELD_ORDER[4]}:** ${today}`,
    `**${CANONICAL_FIELD_ORDER[5]}:** ${today}`,
    `**${CANONICAL_FIELD_ORDER[6]}:**`,
    `**${CANONICAL_FIELD_ORDER[7]}:** ${SPEC_VERSION}`,
    "",
  ];
  return lines.join("\n");
}

// Ontology tag HTML comment format:
// <!-- brief:ontology PACK ENTRY_ID "LABEL" -->
const ONTOLOGY_TAG_RE =
  /<!--\s*brief:ontology\s+(\S+)\s+(\S+)\s+"([^"]*)"\s*-->/;

// ─── Exported API ──────────────────────────────────────────────────────────────

/**
 * Translate an extension name between heading format and metadata format.
 * toMetadata: "SONIC ARTS" → "sonic_arts"
 * toHeading:  "sonic_arts" → "SONIC ARTS"
 */
export function translateExtensionName(
  name: string,
  direction: "toMetadata" | "toHeading",
): string {
  if (direction === "toMetadata") {
    return name.toLowerCase().replace(/ /g, "_");
  }
  // toHeading: uppercase then underscores → spaces
  return name.toUpperCase().replace(/_/g, " ");
}

/**
 * Validate an extension name (must be [A-Z0-9 ]+).
 * Throws on invalid input.
 */
export function validateExtensionName(name: string): void {
  if (!/^[A-Z0-9 ]+$/.test(name)) {
    throw new Error(
      `Invalid extension name "${name}": must contain only uppercase letters (A-Z), digits (0-9), and spaces`,
    );
  }
}

/**
 * Sync extension metadata (add or remove an extension name from the Extensions field).
 * When isNewFile=true and content is empty, creates a full canonical metadata block.
 * Returns the updated content string.
 */
export async function syncExtensionMetadata(
  inputContent: string,
  params: {
    action: "add" | "remove";
    extensionName: string;
    isNewFile?: boolean;
  },
): Promise<string> {
  const { action, extensionName, isNewFile } = params;

  // Always store in metadata format (lowercase_underscore)
  const metaName = /^[A-Z0-9 ]+$/.test(extensionName)
    ? translateExtensionName(extensionName, "toMetadata")
    : extensionName.toLowerCase().replace(/ /g, "_");

  // isNewFile: create canonical metadata block with extension already included
  if (isNewFile && !inputContent.trim()) {
    if (action === "add") {
      return buildCanonicalMetadataBlock(metaName);
    }
    return buildCanonicalMetadataBlock();
  }

  const { content, restore } = normalizeLF(inputContent);
  const currentValue = getMetadataFieldValue(content, "Extensions");
  const items = parseCSV(currentValue);

  const newItems =
    action === "add"
      ? items.includes(metaName)
        ? items
        : [...items, metaName]
      : items.filter((item) => item !== metaName);

  const updated = updateMetadataField(
    content,
    "Extensions",
    formatCSV(newItems),
  );
  return updated !== null ? restore(updated) : inputContent;
}

/**
 * Sync ontology metadata (add a pack name to the Ontologies field).
 * Version annotation format: "pack_name (vX.Y)".
 * Returns the updated content string.
 */
export async function syncOntologyMetadata(
  inputContent: string,
  params: { pack: string; version?: string },
): Promise<string> {
  const { pack, version } = params;
  const { content, restore } = normalizeLF(inputContent);

  // Format: "pack_name (version)" when version is provided
  const entry = version ? `${pack} (${version})` : pack;
  const currentValue = getMetadataFieldValue(content, "Ontologies");
  const items = parseCSV(currentValue);

  // Already present if pack name matches (with or without version annotation)
  const alreadyPresent = items.some(
    (item) => item === pack || item.startsWith(`${pack} (`),
  );
  if (alreadyPresent) return inputContent;

  const updated = updateMetadataField(
    content,
    "Ontologies",
    formatCSV([...items, entry]),
  );
  return updated !== null ? restore(updated) : inputContent;
}

/**
 * Check if an ontology tag is already applied (idempotent tagging).
 * Tag format: <!-- brief:ontology PACK ENTRY_ID "LABEL" -->
 * Returns { alreadyTagged, content? }.
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
  const { pack, entryId, label, targetLine } = params;
  const { content, restore } = normalizeLF(inputContent);
  const lines = content.split("\n");

  // Search within ±5 lines of targetLine (1-indexed → 0-indexed)
  const lineIdx = targetLine - 1;
  const windowStart = Math.max(0, lineIdx - 5);
  const windowEnd = Math.min(lines.length - 1, lineIdx + 5);

  for (let i = windowStart; i <= windowEnd; i++) {
    const line = lines[i] ?? "";
    const m = ONTOLOGY_TAG_RE.exec(line);
    if (m && m[1] === pack && m[2] === entryId) {
      const existingLabel = m[3] ?? "";
      if (existingLabel === label) {
        // Identical tag already exists
        return { alreadyTagged: true };
      }
      // Same entry but different label — update the label in place
      lines[i] = line.replace(
        ONTOLOGY_TAG_RE,
        `<!-- brief:ontology ${pack} ${entryId} "${label}" -->`,
      );
      return { alreadyTagged: false, content: restore(lines.join("\n")) };
    }
  }

  return { alreadyTagged: false };
}

/**
 * Check if an extension already exists (idempotent extension creation).
 * Returns { alreadyExists, existingContent?, metadataUpdated? }.
 */
export async function checkIdempotentExtension(
  inputContent: string,
  extensionName: string,
): Promise<{
  alreadyExists: boolean;
  existingContent?: string;
  metadataUpdated?: boolean;
}> {
  const { content } = normalizeLF(inputContent);

  // Normalize to heading format (ALL CAPS with spaces) for comparison
  const headingName = /^[a-z0-9_]+$/.test(extensionName)
    ? translateExtensionName(extensionName, "toHeading")
    : extensionName.toUpperCase().replace(/_/g, " ");
  const metaName = translateExtensionName(headingName, "toMetadata");

  // Search for the extension heading line-by-line
  const lines = content.split("\n");
  let headingLineIdx = -1;
  let headingLevel = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const m = /^(#{1,3}) (.+?)[ \t]*$/.exec(line);
    if (m) {
      const headText = (m[2] ?? "").replace(/\s*\{[^}]*\}$/, "").trim();
      if (headText.toUpperCase() === headingName.toUpperCase()) {
        headingLineIdx = i;
        headingLevel = (m[1] ?? "").length;
        break;
      }
    }
  }

  if (headingLineIdx === -1) {
    return { alreadyExists: false };
  }

  // Find where this section ends (next heading at same or higher level)
  let sectionEndLineIdx = lines.length;
  for (let i = headingLineIdx + 1; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const m = /^(#{1,3}) /.exec(line);
    if (m && (m[1] ?? "").length <= headingLevel) {
      sectionEndLineIdx = i;
      break;
    }
  }

  const sectionLines = lines.slice(headingLineIdx + 1, sectionEndLineIdx);
  const existingContent = sectionLines
    .join("\n")
    .replace(/^\n+/, "")
    .replace(/\n+$/, "");

  // Check metadata consistency
  const currentExtensions = getMetadataFieldValue(content, "Extensions");
  const items = parseCSV(currentExtensions);
  const metadataUpdated = !items.includes(metaName);

  return {
    alreadyExists: true,
    existingContent,
    metadataUpdated,
  };
}

/**
 * Write an external session breadcrumb entry.
 * Returns the updated content string.
 * Format: - [date] [tool]: [count] decisions captured — [comma-separated titles]
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
  const { content, restore } = normalizeLF(inputContent);

  const titleList = titles.join(", ");
  // em-dash: U+2014
  const breadcrumb = `- ${date} ${tool}: ${decisionCount} decisions captured \u2014 ${titleList}`;

  const sectionHeadingRe = /^## External Tool Sessions[ \t]*$/m;
  const match = sectionHeadingRe.exec(content);

  let result: string;

  if (match !== null) {
    const headingEnd = match.index + match[0].length;

    // Find end of this section (next heading at any level)
    const nextHeadingRe = /^#{1,3} /gm;
    nextHeadingRe.lastIndex = headingEnd + 1;
    const nextMatch = nextHeadingRe.exec(content);
    const sectionEnd = nextMatch ? nextMatch.index : content.length;

    // Build new section body: strip trailing newlines then append breadcrumb
    const sectionBody = content.slice(headingEnd, sectionEnd);
    const bodyWithoutTrailing = sectionBody.replace(/\n+$/, "");

    let newSectionBody: string;
    if (bodyWithoutTrailing.trim()) {
      // Existing entries present — append after last entry
      newSectionBody = `${bodyWithoutTrailing}\n${breadcrumb}\n`;
    } else {
      // Empty section — add blank line then breadcrumb
      newSectionBody = `\n\n${breadcrumb}\n`;
    }

    result =
      content.slice(0, headingEnd) + newSectionBody + content.slice(sectionEnd);
  } else {
    // Section missing — create it before TOOL SPECIFIC sections (or at end)
    const toolSpecificRe = /^# TOOL SPECIFIC: /m;
    const tsMatch = toolSpecificRe.exec(content);
    const insertAt = tsMatch ? tsMatch.index : content.length;

    const core = content.slice(0, insertAt).replace(/\n+$/, "");
    const newSection = `\n\n## External Tool Sessions\n\n${breadcrumb}\n`;
    const tail = tsMatch ? `\n\n${content.slice(insertAt)}` : "";
    result = core + newSection + tail;
  }

  // Ensure exactly one trailing newline
  result = `${result.replace(/[\r\n]+$/, "")}\n`;
  return restore(result);
}

/**
 * Preserve tool-specific sections while modifying a named section.
 * Returns the updated content string.
 * Throws if canFitInCoreSection is true and modifySection is a brief-mcp tool-specific section.
 */
export async function preserveToolSpecificSections(
  inputContent: string,
  params: {
    modifySection: string;
    newContent: string;
    canFitInCoreSection?: boolean;
  },
): Promise<string> {
  const { modifySection, newContent, canFitInCoreSection } = params;

  // WRITE-10: reject brief-mcp tool-specific writes when data fits in core section (last resort policy)
  const isBriefMcpSection = /tool\s+specific:\s*brief-mcp/i.test(modifySection);
  if (isBriefMcpSection && canFitInCoreSection === true) {
    throw new Error(
      "WRITE-10 last resort policy: Cannot write # TOOL SPECIFIC: brief-mcp section when data fits in a core section.",
    );
  }

  const { content, restore } = normalizeLF(inputContent);

  // Separate core content from tool-specific sections
  const toolSpecificRe = /^# TOOL SPECIFIC: /m;
  const firstTsMatch = toolSpecificRe.exec(content);
  const coreContent = firstTsMatch
    ? content.slice(0, firstTsMatch.index)
    : content;
  const toolSpecificContent = firstTsMatch
    ? content.slice(firstTsMatch.index)
    : "";

  // Find the target section in core content (line-by-line)
  const lines = coreContent.split("\n");
  let headingLineIdx = -1;
  let headingLevel = 0;
  let headingText = modifySection;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const m = /^(#{1,3}) (.+?)[ \t]*$/.exec(line);
    if (m) {
      const headText = (m[2] ?? "").replace(/\s*\{[^}]*\}$/, "").trim();
      if (headText.toLowerCase() === modifySection.toLowerCase()) {
        headingLineIdx = i;
        headingLevel = (m[1] ?? "").length;
        headingText = headText;
        break;
      }
    }
  }

  let modifiedCore: string;

  if (headingLineIdx !== -1) {
    // Find where this section ends
    let sectionEndLineIdx = lines.length;
    for (let i = headingLineIdx + 1; i < lines.length; i++) {
      const line = lines[i] ?? "";
      const m = /^(#{1,3}) /.exec(line);
      if (m && (m[1] ?? "").length <= headingLevel) {
        sectionEndLineIdx = i;
        break;
      }
    }

    const headingLine = `${"#".repeat(headingLevel)} ${headingText}`;
    const trimmedNewContent = newContent.trimEnd();
    const bodyContent = trimmedNewContent ? `\n\n${trimmedNewContent}\n` : "\n";

    const before = lines.slice(0, headingLineIdx).join("\n");
    const after = lines.slice(sectionEndLineIdx).join("\n");
    modifiedCore =
      (before ? `${before}\n` : "") + headingLine + bodyContent + (after || "");
  } else {
    // Append new section
    const trimmedCore = coreContent.replace(/\n+$/, "");
    const trimmedNewContent = newContent.trimEnd();
    const bodyContent = trimmedNewContent ? `\n\n${trimmedNewContent}\n` : "\n";
    modifiedCore = `${trimmedCore}\n\n## ${modifySection}${bodyContent}`;
  }

  // Re-append tool-specific sections verbatim (WRITE-09)
  let result: string;
  if (toolSpecificContent) {
    const trimmedCore = modifiedCore.replace(/\n+$/, "");
    result = `${trimmedCore}\n\n${toolSpecificContent}`;
  } else {
    result = modifiedCore;
  }

  result = `${result.replace(/[\r\n]+$/, "")}\n`;
  return restore(result);
}

// ─── Deprecated Shims ─────────────────────────────────────────────────────────

/** @deprecated Use translateExtensionName(name, "toMetadata") instead */
export function headingToMetadataFormat(headingName: string): string {
  return translateExtensionName(headingName, "toMetadata");
}

/** @deprecated Use translateExtensionName(name, "toHeading") instead */
export function metadataToHeadingFormat(metadataName: string): string {
  return translateExtensionName(metadataName, "toHeading");
}

/** @deprecated Use syncExtensionMetadata or syncOntologyMetadata instead */
export async function writeMetadataField(
  _filePath: string,
  _params: MetadataSyncParams,
): Promise<WriterResult> {
  throw new Error("Not implemented: writeMetadataField (deprecated)");
}
