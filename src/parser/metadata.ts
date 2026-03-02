// src/parser/metadata.ts — stub for TASK-09
// Replace with real implementation during build loop.

import type { ParsedMetadata } from "../types/parser.js";

export function extractMetadata(_rawContent: string): ParsedMetadata {
  throw new Error("Not implemented: extractMetadata");
}

export function normalizeMetadataField(_fieldName: string): string {
  throw new Error("Not implemented: normalizeMetadataField");
}

export function parseExtensionsField(_value: string): string[] {
  throw new Error("Not implemented: parseExtensionsField");
}

export function parseOntologiesField(
  _value: string,
): import("../types/parser.js").OntologyMetadataEntry[] {
  throw new Error("Not implemented: parseOntologiesField");
}

export function normalizeType(_typeValue: string): string {
  throw new Error("Not implemented: normalizeType");
}
