# TASK-52: Cross-Cutting — Performance Verification & Benchmarks

## Metadata
- Priority: 54
- Status: pending
- Dependencies: TASK-13, TASK-19, TASK-32a, TASK-32b, TASK-33
- Module path: tests/benchmarks/
- Type stubs: none
- Also read: src/types/parser.ts, src/types/ontology.ts
- Test file: tests/benchmarks/performance.test.ts
- Estimated context KB: 35

## What To Build

This is a verification and benchmarking task, not a primary implementation task. Most PERF rules are already implemented in their natural module tasks. This task builds benchmark suites to verify those implementations meet their targets, profiles memory usage, and adds optimisations where targets are missed. Build benchmark suites for: the parser (files at 1KB, 100KB, 1MB, 10MB), ontology search (<50ms warm cache target), workspace scanning (5000+ directories), memory profiling with 5+ packs (1000-3000 entries each against 100MB budget), startup time measurement (<2s target with 1, 5, 10, 20 packs), and response size verification across all tools.

## Implementation Guide

1. `tests/benchmarks/parser-bench.ts` — parser performance benchmarks.

2. Parser benchmarks: create test fixtures at 1KB, 100KB, 1MB, and 10MB. Measure parse time for each. Verify streaming approach activates for files >100KB. Verify metadata-only fast path is used when only metadata is needed.

3. `tests/benchmarks/ontology-bench.ts` — ontology search benchmarks.

4. Ontology search benchmarks: measure query latency across loaded packs. Target: <50ms for warm-cache queries. Cold-cache queries may take up to 500ms. Log any search exceeding 100ms as a warning. Test with multi-term queries, synonym-expanded matches, and cross-pack searches.

5. `tests/benchmarks/workspace-bench.ts` — workspace scan benchmarks.

6. Workspace scan benchmarks: create a test fixture with 5000+ directories. Measure scan time. Verify hidden directories are skipped. Verify only metadata is read from each discovered BRIEF.md. Verify depth limit is respected.

7. `tests/benchmarks/memory-bench.ts` — memory profiling.

8. Memory profiling: load 5+ packs with 1000-3000 entries each. Measure total index memory usage against 100MB budget. Verify LRU eviction activates when budget exceeded.

9. `tests/benchmarks/startup-bench.ts` — startup time benchmarks.

10. Startup time: measure with 1, 5, 10, and 20 packs. Target: <2s. If lazy loading is enabled, measure first-query latency.

11. Response size verification: spot-check response sizes across all tools to ensure they stay within the 32KB default limit or properly emit truncation signals.

12. Any optimisations needed to meet targets are implemented in this task.

## Exported API

No new module exports. This task creates benchmark tests that import and measure existing modules. The test file (`tests/benchmarks/performance.test.ts`) validates timing constraints on parser, writer, and indexer operations.

## Rules

### PERF-01: Lazy Index Building
Ontology pack indexes MAY be built lazily (on first query) rather than at startup, if startup time exceeds the target (<2 seconds). The first query to a lazily-loaded pack will be slower; subsequent queries use the cached index.

### PERF-03: Streaming Large File Reads
When reading BRIEF.md files larger than 100 KB, the parser SHOULD use a streaming approach (line-by-line) rather than loading the entire file into memory at once. This prevents memory spikes from extremely large files.

### PERF-06: Avoid Synchronous I/O in Tool Handlers
All file I/O in tool handlers MUST use asynchronous APIs (`fs.promises.*`). Synchronous I/O (`fs.readFileSync`, `fs.writeFileSync`) blocks the Node.js event loop and prevents concurrent processing of MCP messages.

### PERF-07: Search Result Pagination
`brief_search_ontology` MUST support a `max_results` parameter (default: 20) to limit the number of entries returned to the AI. The internal search may evaluate more candidates (50-100) but only the top N are serialised and returned. This controls response size and AI token consumption.

### PERF-08: No Unnecessary Disk Reads
When a tool call only needs metadata (e.g., project name and type for listing), the server MUST NOT parse the full BRIEF.md. Implement a `parseMetadataOnly` fast path that reads only until the first section heading.

### PERF-09: Ontology Search Latency Target
`brief_search_ontology` MUST return results within 50ms for any single query, across all loaded packs. This is achieved by the pre-built inverted index (ONT-07). If search latency exceeds 50ms, this indicates the index is too large for memory or the search algorithm needs optimisation. Log a warning if any search exceeds 100ms.
- The 50ms target applies to warm-cache queries. Cold-cache queries (after LRU eviction or first access) may take up to 500ms for large packs. Log cold-cache queries at debug level with actual latency. (OQ-250)

### PERF-10: Rate limiting for tool calls.
Implement a token-bucket rate limiter: max 50 tool calls per second (burst 100). Write operations have a stricter limit (10/second). When exceeded, return `system_error`: "Rate limit exceeded." Rate limit is per-connection and configurable in config.json. (OQ-254)

### PERF-11: Response Size Limits
Configurable per-tool response size limit (default 32KB text). If exceeded, truncate with signal: "Response truncated. [N] additional items not shown." Limit configurable via config.json. (OQ-187)

## Test Specification

### Unit Tests (specific input → expected output)
- Parse 1KB file → completes within target latency
- Parse 100KB file → streaming approach used
- Parse 1MB file → no memory spike, streaming active
- Parse 10MB file → completes without out-of-memory
- Ontology search (warm cache) → <50ms latency
- Ontology search (cold cache) → <500ms latency
- Ontology search exceeding 100ms → warning logged
- Workspace scan with 5000+ directories → completes within target time
- Workspace scan → hidden directories skipped, only metadata read
- Memory with 5 packs (1000 entries each) → within 100MB budget
- Memory budget exceeded → LRU eviction activates
- Startup with 1 pack → <2s
- Startup with 20 packs → <2s (or lazy loading activated)
- Response size exceeding 32KB → truncation signal emitted
- All file I/O → async APIs used, no synchronous calls

### Property Tests (invariants that hold for ALL inputs)
- forAll(warm-cache search): latency always <50ms
- forAll(loaded packs): total index memory within configured budget
- forAll(tool response): size within configured limit or truncation signal present
- forAll(file I/O): always asynchronous

## Tier 4 Criteria

Tier 4 criteria: none
