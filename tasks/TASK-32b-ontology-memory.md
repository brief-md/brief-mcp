# TASK-32b: Ontology — Memory Management & Cache

## Metadata
- Priority: 35
- Status: pending
- Dependencies: TASK-32a
- Module path: src/ontology/memory.ts
- Type stubs: src/types/ontology.ts
- Also read: none
- Test file: tests/ontology/memory.test.ts
- Estimated context KB: 40

## What To Build

Build the memory management layer for ontology indexes. This enforces a configurable memory budget (default 100MB) with LRU eviction of least-recently-used pack indexes, supports lazy index building as an option when startup time is slow, implements mtime-based staleness checking (default 60s period), manages pack index load/unload lifecycle, and provides memory usage tracking and reporting. Cold-cache queries (after eviction or first access) are acknowledged with logging.

## Implementation Guide

1. `src/ontology/memory.ts` — memory-bounded cache manager.

2. Memory budget enforcement: track the approximate memory size of each pack's index. When total exceeds the configured budget (default 100MB), evict the least-recently-used pack index. Evicted indexes are rebuilt from disk on next query.

3. LRU tracking: maintain access timestamps per pack index. On each query, update the accessed pack's timestamp. On budget overflow, evict the pack with the oldest access timestamp.

4. Lazy index building: provide an option to defer index building to first query time rather than startup. This is useful when many packs are installed but startup time target (<2s) would be exceeded.

5. Staleness checking: on each query, check if the pack file's mtime has changed since the last index build. Use a configurable staleness period (default 60s) — don't check on every query, only when the period has elapsed. If stale, rebuild the index.

6. Load/unload lifecycle: clean loading (build index, add to cache, track size), clean unloading (remove from cache, free memory, update tracking).

7. Memory reporting: provide a method to query current memory usage, per-pack breakdown, and cache hit/miss statistics.

8. Cold-cache acknowledgment: log cold-cache queries at debug level with actual latency. Warm queries target <50ms; cold queries may take up to 500ms.

## Exported API

Export from `src/ontology/memory.ts`:
- `createMemoryManager(options: { budgetBytes: number; lazyLoading?: boolean }) → object`
  Returns manager object with `unload(packName: string)` method.
- `loadPackIndex(manager: object, packName: string, options: { entries: number; terms?: string[]; mtime?: number }) → { loaded: boolean; evictedPack?: string }`
  LRU eviction when over budget.
- `queryPack(manager: object, packName: string, term: string, options?: { mtime?: number }) → { results: any[]; indexRebuilt?: boolean; rebuilt?: boolean; cacheHit?: boolean; latencyMs?: number; indexSize?: number; entriesLoaded?: number }`
  If `mtime` changed since last load, rebuilds index.
- `getMemoryUsage(manager: object) → { total: number; perPack: Record<string, number> }`

Note: cold-cache queries logged at debug level. Import logger from `src/logger` (re-export from `src/observability/logger`).

## Rules

### ONT-14: Synonym Group Overlap
If a term appears in multiple synonym groups (within a single pack or across the global dataset), all groups are used for expansion. The term is expanded to the union of all synonyms from all groups it belongs to. Duplicate expansions are deduplicated before scoring.

### ONT-16: Cross-Pack Search Merge
When `brief_search_ontology` is called with `ontology: "all"`, the server MUST search each loaded pack independently, merge all results into a single list, sort by score descending, and return the top N results (per `max_results` / PERF-07). Each result MUST include the source pack name. Results from different packs are ranked on the same scale — no per-pack normalisation.

### PERF-01: Lazy Index Building
Ontology pack indexes MAY be built lazily (on first query) rather than at startup, if startup time exceeds the target (<2 seconds). The first query to a lazily-loaded pack will be slower; subsequent queries use the cached index.

### PERF-02: Memory Budget for Indexes
The total memory used by ontology indexes MUST be bounded by a configurable memory budget (default: 100 MB). When the budget is exceeded, least-recently-used pack indexes are evicted and rebuilt from disk on next query.

### PERF-05: Index Invalidation Strategy
Ontology indexes MUST be invalidated and rebuilt when:
- A pack file is installed or updated via `brief_install_ontology`
- The server detects a pack file's mtime has changed since last index build (check on first query after a configurable staleness period, default 60 seconds)
Indexes MUST NOT be rebuilt on every query — check file mtime as a cache validation strategy.

### PERF-09: Ontology Search Latency Target
`brief_search_ontology` MUST return results within 50ms for any single query, across all loaded packs. This is achieved by the pre-built inverted index (ONT-07). If search latency exceeds 50ms, this indicates the index is too large for memory or the search algorithm needs optimisation. Log a warning if any search exceeds 100ms.
- The 50ms target applies to warm-cache queries. Cold-cache queries (after LRU eviction or first access) may take up to 500ms for large packs. Log cold-cache queries at debug level with actual latency. (OQ-250)

## Test Specification

### Unit Tests (specific input → expected output)
- Load pack index within budget → index available, memory tracked
- Exceed memory budget → LRU pack evicted, most recently used retained
- Query evicted pack → index rebuilt from disk (cold cache), results returned
- Lazy loading enabled → index not built at startup, built on first query
- Pack file mtime changed → index rebuilt on next query after staleness period
- Pack file mtime unchanged → cached index reused, no rebuild
- Memory usage query → returns per-pack breakdown and total
- Cold-cache query → logged at debug level with latency
- Warm-cache query → completes within target latency
- Unload pack → memory freed, tracking updated
- Multiple packs, budget tight → only most recently used packs retained

### Property Tests (invariants that hold for ALL inputs)
- forAll(cache state): total memory never exceeds configured budget
- forAll(eviction): least-recently-used pack is always the one evicted
- forAll(stale pack): index always rebuilt when mtime changes
- forAll(query): result is always returned (from cache or rebuilt)

## Tier 4 Criteria

Tier 4 criteria: none
