# TASK-33: Ontology — Search Tool

## Metadata
- Priority: 36
- Status: pending
- Dependencies: TASK-32a, TASK-08
- Module path: src/ontology/search.ts
- Type stubs: src/types/ontology.ts
- Also read: none
- Test file: tests/ontology/search.test.ts
- Estimated context KB: 40

## What To Build

Implement the `brief_search_ontology` MCP tool — keyword search across ontology packs with synonym expansion, field-priority scoring, match context, result pagination, detail level filtering, cross-pack merge, and empty result handling with structured guidance signals. The tool must meet a <50ms warm-cache latency target.

## Implementation Guide

1. `src/ontology/search.ts` — search tool implementation.

2. Register `brief_search_ontology` tool handler. Accept parameters: `query` (required), `ontology` (optional pack name or "all"), `max_results` (default 20), `detail_level` ("minimal", "standard", "full"). Validate `query`: reject empty or whitespace-only strings with `invalid_input`. Maximum query length: 1000 characters (enforced by the TASK-08 middleware; documented here for implementation clarity). Reference SEC-19.

3. **Test data setup:** Tests call `installPack()` from `management.ts` in `beforeEach` to populate pack indexes before searching. Your `searchOntology` function retrieves these via `getPackIndex(name)` / `getAllIndexes()` from `management.ts`. Do NOT import `_moduleInstanceId` or any private/diagnostic exports — only use the public API: `getPackIndex`, `getAllIndexes`, `searchIndex`. Tests also expect input validation errors to be **returned** (as `{ error: string, type: "invalid_input" }` objects), NOT thrown.

4. Query processing: tokenize the query using the **same `Intl.Segmenter`-based tokenizer as TASK-32a's indexer** — import the shared tokenizer function from the indexer module; do not instantiate a separate `Intl.Segmenter` in the search handler. Tokenizer consistency between index-build time and query time is a critical invariant: if the tokenizers differ, CJK and Thai queries will fail to match index entries. Expand tokens with synonym groups (bidirectional). Look up expanded terms in the inverted index (from T32a). Reference ONT-17 and OQ-205.

5. Scoring: apply field priority multipliers (label 4x, aliases 3x, keywords 2x, description 1x) and direct/synonym multiplier (direct 1.5x). Aggregate scores per entry.

6. Match context: for each result, include which query terms matched, in which fields, and whether via direct or synonym match.

7. Detail level: filter response fields based on `detail_level` — minimal (id, label), standard (+ description, parents), full (all fields).

8. Cross-pack search: when `ontology: "all"`, search each loaded pack independently, merge results into one list sorted by score descending. Each result includes source pack name.

9. Pagination: internal search may evaluate 50-100 candidates. Only return top N per `max_results`. Track total matches for transparency.

10. Empty results: return empty `results` array (never null, never error) plus structured signal suggesting alternative terms, checking installed packs, or AI supplementing from its own knowledge. When the AI presents search results and the user rejects all matches, the recovery flow is: (1) search again with different terms, (2) browse the pack directly via `brief_list_ontology_entries`, (3) skip tagging entirely, (4) manual free-text note. The AI MUST NOT re-present the same rejected matches. The signal block for empty or rejected results SHOULD include these four recovery paths. Reference Pattern 4 "When the User Rejects All Matches".

## Exported API

Export from `src/ontology/search.ts`:
- `searchOntology(params: { query: string; ontology: string; detail?: string; maxResults?: number; max_results?: number; detail_level?: string; allRejected?: boolean; rejectedIds?: string[] }) → { results: Array<{ id?: string; entryId?: string; label: string; score: number; matchType: string; matchContext: { matchedTerms: string[]; matchedFields: string[] }; pack?: string; source?: string }>; signal?: string; recoveryPaths?: string[] }`
  Accept both camelCase and snake_case parameter names (`maxResults`/`max_results`, `detail`/`detail_level`). No-match signal: matches `/no.*match|not found|zero result/i`. `recoveryPaths` has exactly 4 items. `allRejected: true` returns signal. `rejectedIds` excludes those entry IDs.

## Rules

### ONT-03: Field Priority Scoring
Search scoring MUST respect field priority with the following multipliers (GAP-S18):
- `label`: 4× multiplier
- `aliases`: 3× multiplier
- `keywords`: 2× multiplier
- `description`: 1× multiplier (baseline)

A match on `label` scores higher than a match on `keywords` for the same entry.

### ONT-04: Direct Match > Synonym Match
A direct term match MUST score higher than a synonym-expanded match. Direct matches receive a 1.5× multiplier over synonym-expanded matches.

### ONT-05: Return Match Context
Search results MUST include which terms matched, in which fields, and whether via direct or synonym match. This helps the AI explain matches to the user.

### ONT-06: Detail Level Filtering
All ontology read tools MUST respect the `detail_level` parameter:
- `minimal`: id and label only
- `standard`: id, label, description, parents
- `full`: all fields including keywords, aliases, synonyms, references

### ONT-13: Empty Search Result Handling
When `brief_search_ontology` finds zero matches, it MUST return an empty `results` array (never null, never an error) plus the structured signal block per RESP-02. The signal MUST suggest: (1) trying different search terms, (2) checking if relevant ontology packs are installed, (3) the AI supplementing from its own knowledge (Tier 2) or web search (Tier 3) per REF-06.

### ONT-16: Cross-Pack Search Merge
When `brief_search_ontology` is called with `ontology: "all"`, the server MUST search each loaded pack independently, merge all results into a single list, sort by score descending, and return the top N results (per `max_results` / PERF-07). Each result MUST include the source pack name. Results from different packs are ranked on the same scale — no per-pack normalisation.

### PERF-07: Search Result Pagination
`brief_search_ontology` MUST support a `max_results` parameter (default: 20) to limit the number of entries returned to the AI. The internal search may evaluate more candidates (50-100) but only the top N are serialised and returned. This controls response size and AI token consumption.

### PERF-09: Ontology Search Latency Target
`brief_search_ontology` MUST return results within 50ms for any single query, across all loaded packs. This is achieved by the pre-built inverted index (ONT-07). If search latency exceeds 50ms, this indicates the index is too large for memory or the search algorithm needs optimisation. Log a warning if any search exceeds 100ms.
- The 50ms target applies to warm-cache queries. Cold-cache queries (after LRU eviction or first access) may take up to 500ms for large packs. Log cold-cache queries at debug level with actual latency. (OQ-250)

## Test Specification

### Unit Tests (specific input → expected output)
- Search term matching entries → results returned sorted by score
- Label match scores higher than keyword match for same term
- Direct match scores higher than synonym match
- Each result → includes match context (terms, fields, direct/synonym flag)
- Detail level minimal → only id and label in results
- Detail level full → all fields in results
- Cross-pack search (ontology: "all") → results from all packs merged and sorted
- Each cross-pack result → includes source pack name
- max_results = 5 → at most 5 results returned even if more match
- Zero matches → empty results array with structured signal (not null, not error)
- CJK query string → tokenized using the shared indexer tokenizer, correctly matches CJK index entries
- Empty query string → invalid_input error
- Query string of 1001 characters → invalid_input error (exceeds 1000 char limit)
- Search latency on warm cache → within target
- User rejects all matches → signal block includes four recovery paths (re-search, browse, skip, manual note)
- Previously rejected matches → not re-presented in subsequent search results

### Property Tests (invariants that hold for ALL inputs)
- forAll(query): search never throws, always returns structured response
- forAll(results): sorted by score descending
- forAll(result): match context always present
- forAll(results count): never exceeds max_results

## Tier 4 Criteria

Tier 4 criteria: JC-01, JC-02, JC-07, JC-09
