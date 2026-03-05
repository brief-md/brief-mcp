// src/ontology/management.ts — Stub for ontology pack management (TASK-35)
// Provides minimal API for index rebuild testing in TASK-32a

import { buildIndex, searchIndex } from "./indexer.js";

// In-memory pack index cache
const packIndexes = new Map<string, ReturnType<typeof buildIndex>>();

/**
 * Install a pack and immediately rebuild its index.
 * Returns confirmation that the index was rebuilt (OQ-251).
 * Accepts both `name` and `packName` for pack identification.
 */
export async function installPack(pack: {
  name?: string;
  packName?: string;
  entries: Array<Record<string, unknown>>;
  synonyms?: Record<string, string[]>;
  searchFields?: string[];
}): Promise<{ index_rebuilt: boolean; packName: string }> {
  const resolvedName = pack.name ?? pack.packName ?? "unknown";
  const index = buildIndex({
    name: resolvedName,
    entries: pack.entries,
    synonyms: pack.synonyms,
    searchFields: pack.searchFields,
  });
  packIndexes.set(resolvedName, index);
  return { index_rebuilt: true, packName: resolvedName };
}

/**
 * Uninstall a pack and remove its index from cache synchronously.
 */
export async function uninstallPack(packName: string): Promise<void> {
  packIndexes.delete(packName);
}

/**
 * Get the cached index for a specific pack.
 */
export function getPackIndex(
  packName: string,
): ReturnType<typeof buildIndex> | undefined {
  return packIndexes.get(packName);
}

/**
 * Get all cached indexes.
 */
export function getAllIndexes(): Array<ReturnType<typeof buildIndex>> {
  return [...packIndexes.values()];
}

/**
 * Clear all cached indexes (for testing).
 */
export function clearIndexes(): void {
  packIndexes.clear();
}

// Re-export indexer functions for convenience
export { buildIndex, searchIndex };
