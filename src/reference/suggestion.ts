// src/reference/suggestion.ts — Suggestion & entry reference tools (TASK-38)

import type { ReferenceSuggestionResult } from "../types/references.js";

export async function getEntryReferences(_params: {
  ontology: string;
  entryId: string;
  typeFilter?: string;
  extensionFilter?: string;
  maxResults?: number;
}): Promise<{
  references: Array<{ type: string; extension?: string }>;
}> {
  throw new Error("Not implemented");
}

export async function suggestReferences(_params: {
  context: { section: string; activeExtensions: string[] };
  existingReferences?: Array<{ ontology: string; entryId: string }>;
}): Promise<ReferenceSuggestionResult> {
  throw new Error("Not implemented");
}

/** @internal Reset module-level state for test isolation */
export function _resetState(): void {
  // Reset any module-level state
}
