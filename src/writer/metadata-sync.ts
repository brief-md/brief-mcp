// src/writer/metadata-sync.ts — stub for TASK-16
// Replace with real implementation during build loop.

import type { MetadataSyncParams, WriterResult } from "../types/writer.js";

export async function syncExtensionMetadata(
  _filePath: string,
  _extensionName: string,
  _action: "add" | "remove",
): Promise<WriterResult> {
  throw new Error("Not implemented: syncExtensionMetadata");
}

export async function syncOntologyMetadata(
  _filePath: string,
  _packName: string,
  _version?: string,
): Promise<WriterResult> {
  throw new Error("Not implemented: syncOntologyMetadata");
}

export function headingToMetadataFormat(_headingName: string): string {
  throw new Error("Not implemented: headingToMetadataFormat");
}

export function metadataToHeadingFormat(_metadataName: string): string {
  throw new Error("Not implemented: metadataToHeadingFormat");
}

export async function writeMetadataField(
  _filePath: string,
  _params: MetadataSyncParams,
): Promise<WriterResult> {
  throw new Error("Not implemented: writeMetadataField");
}

export async function writeExternalSessionBreadcrumb(
  _filePath: string,
  _sessionDate: string,
  _toolName: string,
  _decisionCount: number,
  _decisionTitles: string[],
): Promise<WriterResult> {
  throw new Error("Not implemented: writeExternalSessionBreadcrumb");
}

export function validateExtensionName(_name: string): void {
  throw new Error("Not implemented: validateExtensionName");
}
