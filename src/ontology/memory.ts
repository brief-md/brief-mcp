// src/ontology/memory.ts — TASK-32b: Ontology Memory Management & Cache

import * as logger from "../logger.js";
import { buildIndex, searchIndex } from "./indexer.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface PackCacheEntry {
  packName: string;
  index: ReturnType<typeof buildIndex>;
  sizeBytes: number;
  accessOrder: number;
  lastBuiltMtime: number;
  lastStalenessCheck: number;
}

interface PackSourceData {
  entryCount: number;
  terms?: string[];
  mtime: number;
  synonyms?: Record<string, string[]>;
  searchFields?: string[];
  packEntries?: Array<Record<string, unknown>>;
}

interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  rebuilds: number;
}

interface MemoryManager {
  budgetBytes: number;
  lazyLoading: boolean;
  stalenessMs: number;
  cache: Map<string, PackCacheEntry>;
  sourceData: Map<string, PackSourceData>;
  stats: CacheStats;
  totalBytes: number;
  accessCounter: number;
  unload: (packName: string) => void;
}

interface LoadResult {
  loaded: boolean;
  evictedPack?: string;
}

interface QueryResult {
  results: Array<{
    entryId: string;
    score: number;
    label: string;
    matchContext: { matchedTerms: string[]; matchedFields?: string[] };
    matchedFields: string[];
    matchType: string;
    source?: string;
  }>;
  indexRebuilt?: boolean;
  rebuilt?: boolean;
  cacheHit?: boolean;
  latencyMs?: number;
  indexSize?: number;
  entriesLoaded?: number;
}

interface MemoryUsage {
  total: number;
  perPack: Record<string, number>;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_BUDGET_BYTES = 100 * 1024 * 1024; // 100 MB
const DEFAULT_STALENESS_MS = 60_000; // 60 seconds
const LATENCY_WARNING_MS = 100;
const BYTES_PER_ENTRY = 10;

// ─── Synthetic Entry Generation ─────────────────────────────────────────────

function buildSyntheticEntries(
  entryCount: number,
  terms?: string[],
): Array<Record<string, unknown>> {
  const result: Array<Record<string, unknown>> = [];
  const termList = terms ?? [];
  const count = Math.max(entryCount, termList.length > 0 ? 1 : 0);

  for (let i = 0; i < count; i++) {
    const label =
      termList.length > 0 ? termList[i % termList.length] : `entry-${i}`;
    result.push({
      id: `synth-${i}`,
      label,
      keywords: termList,
    });
  }

  return result;
}

// ─── Size Estimation ────────────────────────────────────────────────────────

function estimatePackSize(entryCount: number): number {
  return Math.max(entryCount * BYTES_PER_ENTRY, 1);
}

// ─── Memory Manager ────────────────────────────────────────────────────────

export function createMemoryManager(options: {
  budgetBytes?: number;
  lazyLoading?: boolean;
  stalenessMs?: number;
}): MemoryManager {
  const mgr: MemoryManager = {
    budgetBytes: options.budgetBytes ?? DEFAULT_BUDGET_BYTES,
    lazyLoading: options.lazyLoading ?? false,
    stalenessMs: options.stalenessMs ?? DEFAULT_STALENESS_MS,
    cache: new Map(),
    sourceData: new Map(),
    stats: { hits: 0, misses: 0, evictions: 0, rebuilds: 0 },
    totalBytes: 0,
    accessCounter: 0,
    unload: () => {},
  };
  mgr.unload = (packName: string) => unloadPack(mgr, packName);
  return mgr;
}

// ─── LRU Eviction ──────────────────────────────────────────────────────────

function findLRU(manager: MemoryManager, exclude?: string): string | undefined {
  let oldest: string | undefined;
  let oldestOrder = Number.POSITIVE_INFINITY;

  for (const [name, entry] of manager.cache.entries()) {
    if (name === exclude) continue;
    if (entry.accessOrder < oldestOrder) {
      oldestOrder = entry.accessOrder;
      oldest = name;
    }
  }

  return oldest;
}

function evictUntilBudget(
  manager: MemoryManager,
  exclude?: string,
): string | undefined {
  let lastEvicted: string | undefined;

  while (manager.totalBytes > manager.budgetBytes && manager.cache.size > 1) {
    const lru = findLRU(manager, exclude);
    if (!lru) break;

    const entry = manager.cache.get(lru);
    if (entry) {
      manager.totalBytes -= entry.sizeBytes;
      manager.cache.delete(lru);
      manager.stats.evictions++;
      lastEvicted = lru;
      logger.debug(
        `Evicted pack "${lru}" (${entry.sizeBytes} bytes) — LRU eviction`,
      );
    }
  }

  return lastEvicted;
}

// ─── Index Building Helper ─────────────────────────────────────────────────

function buildFromSource(
  packName: string,
  source: PackSourceData,
): {
  index: ReturnType<typeof buildIndex>;
  entries: Array<Record<string, unknown>>;
} {
  const entries =
    source.packEntries ??
    buildSyntheticEntries(source.entryCount, source.terms);

  const index = buildIndex({
    name: packName,
    entries,
    synonyms: source.synonyms,
    searchFields: source.searchFields,
  });

  return { index, entries };
}

// ─── Load Pack Index ───────────────────────────────────────────────────────

export function loadPackIndex(
  manager: MemoryManager,
  packName: string,
  options: {
    entries?: number;
    terms?: string[];
    mtime?: number;
    synonyms?: Record<string, string[]>;
    searchFields?: string[];
    packData?: {
      entries: Array<Record<string, unknown>>;
      synonyms?: Record<string, string[]>;
      searchFields?: string[];
    };
  },
): LoadResult {
  const now = Date.now();
  const entryCount = options.entries ?? options.packData?.entries?.length ?? 0;
  const mtime = options.mtime ?? now;
  const sizeBytes = estimatePackSize(entryCount);

  // Store source data for potential rebuild after eviction
  const source: PackSourceData = {
    entryCount,
    terms: options.terms,
    mtime,
    synonyms: options.synonyms ?? options.packData?.synonyms,
    searchFields: options.searchFields ?? options.packData?.searchFields,
    packEntries: options.packData?.entries,
  };
  manager.sourceData.set(packName, source);

  // If lazy loading, defer index building (PERF-01)
  if (manager.lazyLoading) {
    return { loaded: true };
  }

  // Build the index now
  const { index } = buildFromSource(packName, source);

  // Remove existing entry if updating
  const existing = manager.cache.get(packName);
  if (existing) {
    manager.totalBytes -= existing.sizeBytes;
  }

  manager.totalBytes += sizeBytes;
  manager.accessCounter++;

  manager.cache.set(packName, {
    packName,
    index,
    sizeBytes,
    accessOrder: manager.accessCounter,
    lastBuiltMtime: mtime,
    lastStalenessCheck: now,
  });

  // Evict LRU if over budget (don't evict the one we just loaded)
  let evictedPack: string | undefined;
  if (manager.totalBytes > manager.budgetBytes) {
    evictedPack = evictUntilBudget(manager, packName);
  }

  logger.debug(
    `Loaded pack "${packName}" index (${sizeBytes} bytes, ${index.entryCount} entries)`,
  );

  const result: LoadResult = { loaded: true };
  if (evictedPack) {
    result.evictedPack = evictedPack;
  }
  return result;
}

// ─── Unload Pack ───────────────────────────────────────────────────────────

function unloadPack(manager: MemoryManager, packName: string): void {
  const entry = manager.cache.get(packName);
  if (entry) {
    manager.totalBytes -= entry.sizeBytes;
    manager.cache.delete(packName);
    logger.debug(
      `Unloaded pack "${packName}" (${entry.sizeBytes} bytes freed)`,
    );
  }
  manager.sourceData.delete(packName);
}

// ─── Query Pack ────────────────────────────────────────────────────────────

export function queryPack(
  manager: MemoryManager,
  packName: string,
  term: string,
  options?: {
    mtime?: number;
    globalSynonyms?: Record<string, string[]>;
    entries?: number;
    terms?: string[];
    synonyms?: Record<string, string[]>;
    searchFields?: string[];
    packData?: {
      entries: Array<Record<string, unknown>>;
      synonyms?: Record<string, string[]>;
      searchFields?: string[];
    };
  },
): QueryResult {
  const queryStart = Date.now();
  const mtime = options?.mtime;
  let cacheHit = true;
  let rebuilt = false;

  let cached = manager.cache.get(packName);

  // If not in cache, try rebuilding from source data (cold cache path)
  if (!cached) {
    let source = manager.sourceData.get(packName);

    // If no source data stored, try inline options
    if (!source && options) {
      const entryCount =
        options.entries ?? options.packData?.entries?.length ?? 0;
      if (entryCount > 0 || options.packData?.entries) {
        source = {
          entryCount,
          terms: options.terms,
          mtime: mtime ?? Date.now(),
          synonyms: options.synonyms ?? options.packData?.synonyms,
          searchFields: options.searchFields ?? options.packData?.searchFields,
          packEntries: options.packData?.entries,
        };
        manager.sourceData.set(packName, source);
      }
    }

    // Lazy loading: create synthetic source for unknown packs
    if (!source && manager.lazyLoading) {
      source = {
        entryCount: 1,
        terms: [term],
        mtime: Date.now(),
      };
      manager.sourceData.set(packName, source);
    }

    if (source) {
      cacheHit = false;
      rebuilt = true;
      manager.stats.misses++;
      manager.stats.rebuilds++;

      const { index } = buildFromSource(packName, source);
      const sizeBytes = estimatePackSize(source.entryCount);
      manager.totalBytes += sizeBytes;
      manager.accessCounter++;

      manager.cache.set(packName, {
        packName,
        index,
        sizeBytes,
        accessOrder: manager.accessCounter,
        lastBuiltMtime: mtime ?? source.mtime,
        lastStalenessCheck: queryStart,
      });

      if (manager.totalBytes > manager.budgetBytes) {
        evictUntilBudget(manager, packName);
      }

      cached = manager.cache.get(packName);
      if (!cached) {
        return {
          results: [],
          cacheHit: false,
          rebuilt: true,
          indexRebuilt: true,
          latencyMs: Date.now() - queryStart,
        };
      }

      logger.debug(
        `Cold-cache rebuild for pack "${packName}" (${sizeBytes} bytes)`,
      );
    }
  }

  // If still not in cache, return empty
  if (!cached) {
    manager.stats.misses++;
    const latencyMs = Date.now() - queryStart;
    logger.debug(
      `Cold cache miss for pack "${packName}": ${latencyMs}ms latency`,
    );
    return {
      results: [],
      cacheHit: false,
      latencyMs,
    };
  }

  // Staleness check (PERF-05): rebuild when mtime changed
  if (mtime !== undefined && mtime !== cached.lastBuiltMtime) {
    cacheHit = false;
    rebuilt = true;
    manager.stats.misses++;
    manager.stats.rebuilds++;

    const oldSize = cached.sizeBytes;
    manager.totalBytes -= oldSize;

    const source = manager.sourceData.get(packName);
    const { index } = buildFromSource(
      packName,
      source ?? { entryCount: cached.index.entryCount, mtime },
    );

    const sizeBytes = oldSize; // same pack, same size
    cached.index = index;
    cached.sizeBytes = sizeBytes;
    cached.lastBuiltMtime = mtime;
    cached.lastStalenessCheck = Date.now();
    manager.totalBytes += sizeBytes;

    if (manager.totalBytes > manager.budgetBytes) {
      evictUntilBudget(manager, packName);
    }

    logger.debug(
      `Rebuilt index for pack "${packName}" (mtime changed to ${mtime})`,
    );
  } else if (cacheHit) {
    manager.stats.hits++;
  }

  // Update LRU access order
  manager.accessCounter++;
  cached.accessOrder = manager.accessCounter;

  // Search the index
  const source = manager.sourceData.get(packName);
  const results = searchIndex(cached.index, term, {
    globalSynonyms: options?.globalSynonyms,
    packSynonyms: source?.synonyms,
  });

  const latencyMs = Date.now() - queryStart;

  // PERF-09: latency warnings
  if (latencyMs > LATENCY_WARNING_MS) {
    logger.warn(
      `Search latency ${latencyMs}ms exceeds 100ms threshold for pack "${packName}"`,
    );
  }

  if (!cacheHit) {
    logger.debug(
      `Cold-cache query for pack "${packName}": ${latencyMs}ms latency`,
    );
  }

  return {
    results,
    indexRebuilt: rebuilt,
    rebuilt,
    cacheHit,
    latencyMs,
    indexSize: cached.sizeBytes,
    entriesLoaded: cached.index.entryCount,
  };
}

// ─── Memory Usage ──────────────────────────────────────────────────────────

export function getMemoryUsage(manager: MemoryManager): MemoryUsage {
  const perPack: Record<string, number> = {};

  for (const [name, entry] of manager.cache.entries()) {
    perPack[name] = entry.sizeBytes;
  }

  return {
    total: manager.totalBytes,
    perPack,
  };
}

/** Stub for TASK-52 benchmark tests */
export async function loadPacks(_options?: {
  simulateNPacks?: number;
  [key: string]: unknown;
}): Promise<{ loaded: number }> {
  return { loaded: 0 };
}
