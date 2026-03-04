// src/writer/metadata-sync.ts — stub for TASK-16
// Replace with real implementation during build loop.

import type { MetadataSyncParams, WriterResult } from "../types/writer.js";

// ---------------------------------------------------------------------------
// New exports (matching test expectations)
// ---------------------------------------------------------------------------

/**
 * Sync extension metadata (add or remove an extension name from the Extensions field).
 * Returns the updated content string.
 */
export async function syncExtensionMetadata(
  _inputContent: string,
  _params: {
    action: "add" | "remove";
    extensionName: string;
    isNewFile?: boolean;
  },
): Promise<string> {
  throw new Error("Not implemented: syncExtensionMetadata");
}

/**
 * Sync ontology metadata (add a pack name to the Ontologies field).
 * Returns the updated content string.
 */
export async function syncOntologyMetadata(
  _inputContent: string,
  _params: { pack: string; version?: string },
): Promise<string> {
  throw new Error("Not implemented: syncOntologyMetadata");
}

/**
 * Translate an extension name between heading format and metadata format.
 * direction: "toMetadata" converts heading (e.g., "SONIC ARTS") to metadata (e.g., "sonic_arts").
 * direction: "toHeading" converts metadata (e.g., "sonic_arts") to heading (e.g., "SONIC ARTS").
 */
export function translateExtensionName(
  _name: string,
  _direction: "toMetadata" | "toHeading",
): string {
  throw new Error("Not implemented: translateExtensionName");
}

/**
 * Check if an ontology tag is already applied (idempotent tagging).
 * Returns { alreadyTagged, content? }.
 */
export async function checkIdempotentTag(
  _inputContent: string,
  _params: {
    pack: string;
    entryId: string;
    label: string;
    targetLine: number;
  },
): Promise<{ alreadyTagged: boolean; content?: string }> {
  throw new Error("Not implemented: checkIdempotentTag");
}

/**
 * Check if an extension already exists (idempotent extension creation).
 * Returns { alreadyExists, existingContent?, metadataUpdated? }.
 */
export async function checkIdempotentExtension(
  _inputContent: string,
  _extensionName: string,
): Promise<{
  alreadyExists: boolean;
  existingContent?: string;
  metadataUpdated?: boolean;
}> {
  throw new Error("Not implemented: checkIdempotentExtension");
}

/**
 * Preserve tool-specific sections while modifying a core section.
 * Returns the updated content string.
 */
export async function preserveToolSpecificSections(
  _inputContent: string,
  _params: {
    modifySection: string;
    newContent: string;
    canFitInCoreSection?: boolean;
  },
): Promise<string> {
  throw new Error("Not implemented: preserveToolSpecificSections");
}

/**
 * Write an external session breadcrumb entry.
 * Returns the updated content string.
 */
export async function writeExternalSessionBreadcrumb(
  _inputContent: string,
  _params: {
    date: string;
    tool: string;
    decisionCount: number;
    titles: string[];
  },
): Promise<string> {
  throw new Error("Not implemented: writeExternalSessionBreadcrumb");
}

/**
 * Validate an extension name (must be [A-Z0-9 ]+).
 * Throws on invalid input.
 */
export function validateExtensionName(_name: string): void {
  throw new Error("Not implemented: validateExtensionName");
}

// ---------------------------------------------------------------------------
// Deprecated shims (original stubs kept for backward compatibility)
// ---------------------------------------------------------------------------

/** @deprecated Use translateExtensionName(name, "toMetadata") instead */
export function headingToMetadataFormat(_headingName: string): string {
  throw new Error("Not implemented: headingToMetadataFormat (deprecated)");
}

/** @deprecated Use translateExtensionName(name, "toHeading") instead */
export function metadataToHeadingFormat(_metadataName: string): string {
  throw new Error("Not implemented: metadataToHeadingFormat (deprecated)");
}

/** @deprecated Use syncExtensionMetadata or syncOntologyMetadata instead */
export async function writeMetadataField(
  _filePath: string,
  _params: MetadataSyncParams,
): Promise<WriterResult> {
  throw new Error("Not implemented: writeMetadataField (deprecated)");
}
