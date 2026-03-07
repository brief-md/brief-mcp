# TASK-31: Ontology — Pack Schema Validation & Loading

## Metadata
- Priority: 33
- Status: pending
- Dependencies: TASK-04, TASK-05b, TASK-06
- Module path: src/ontology/schema.ts
- Type stubs: src/types/ontology.ts
- Also read: none
- Test file: tests/ontology/schema.test.ts
- Estimated context KB: 45

## What To Build

Build the ontology pack schema validation and loading subsystem. This validates ontology pack JSON files against a strict schema (required fields, type checking, size limits, entry ID sanitization), loads packs at startup, handles prototype pollution prevention, detects non-standard fields, supports per-pack `search_fields` configuration, and enforces pack size limits. For large packs (>1MB), use streaming JSON parsing to avoid blocking the event loop. Also establish the sub-file structure for the ontology module.

## Implementation Guide

1. `src/ontology/index.ts` — barrel re-exporting public API from all ontology sub-modules.

2. `src/ontology/schema.ts` — pack validation and loading.

3. Schema validation on load: check required fields exist with correct types (`name` string, `version` string, `entries` array, each entry has `id` string and `label` string). Validate string length limits (labels ≤ 500, descriptions ≤ 5000, keywords ≤ 100 each). Validate array size limits (max 50,000 entries, 100 keywords per entry, 50 synonyms per entry, 500 references per entry). Reject entries with invalid ID characters (only `[a-zA-Z0-9_-]` allowed). Check for duplicate entry IDs within a pack.

4. Prototype pollution prevention: reject keys named `__proto__`, `constructor`, or `prototype` anywhere in the pack JSON. Use safe JSON parsing.

5. Non-standard field detection: log warning listing any fields not in the canonical schema. Surface them in install/list responses. Support per-pack `search_fields` config in `~/.brief/config.json` to control which fields are searched.

6. Pack size limits: reject files > 50MB. Track total installed size, warn at 500MB.

7. Streaming JSON parser: for pack files > 1MB, use the `stream-json` npm package to parse in a streaming fashion, or offload to a `worker_thread` to prevent blocking the event loop during parsing. For packs < 1MB, synchronous `JSON.parse` is acceptable. Add `stream-json` as a production dependency in `package.json`. The streaming parse path must apply the same full validation logic as the synchronous path (SEC-07 checks must run on streamed data). (OQ-245)

8. Zero-packs handling: when no packs are installed, return gracefully (empty arrays, guidance messages). Not an error state.

9a. **Multi-pack loading with partial success (ERR-11):** When loading multiple installed packs at startup or on demand, use `Promise.allSettled()` (not `Promise.all()`) for the batch load operation. A single corrupt or unreadable pack file MUST NOT prevent other packs from loading. Return results from all successfully loaded packs plus a `warnings` array listing any packs that failed to load and the reason. Reference ERR-01 and OQ-244.

9. Schema versioning: in v1, all packs are implicitly `schema_version: 1`. If `schema_version` is absent, treat as version 1 and accept. If present and equals `1`, accept. If present and equals any other value (e.g., `2`), reject with a clear error: `"Pack schema version [N] is not supported by this server version. Update brief-mcp to a version that supports pack schema [N]."` Do not strip the `schema_version` field when outputting pack metadata — preserve it as-is. (OQ-166)

## Exported API

Export from `src/ontology/schema.ts`:
- `validatePackSchema(pack: unknown) → void` — throws on invalid schema. Error includes field structure via `e.fieldStructure`.
- `loadPack(json: string) → { pack: { name: string; version: string; entries: any[] }; warnings: Array<{ fields?: string[] }>; isValid: boolean; errors?: string[] }`
- `loadAllPacks(options?: { simulatePartialFailure?: boolean; failingPack?: string; simulateNoPacks?: boolean }) → { packs: any[]; warnings: any[]; guidance?: string }`
  Zero-packs case returns `guidance` message. Partial failure loads successful packs and reports failures.

## Rules

### ONT-09: Pack Schema Validation and Field Configuration
Ontology packs MUST be validated against the canonical schema on load, not at query time. Required fields: `name` (string), `version` (string), `entries` (array), each entry has `id` (string) and `label` (string).

When a pack has non-standard or unexpected fields, the server MUST NOT silently ignore them. Instead:
1. Log a warning listing the non-standard fields found
2. Surface them to the user via the `brief_install_ontology` or `brief_list_ontologies` response
3. Allow the user to configure which fields to include in search via a per-pack `search_fields` config entry in `~/.brief/config.json`

This enables users to get value from packs with domain-specific structures without requiring the pack to be reformatted.

### ONT-10: On-the-Fly Pack Format Compatibility
Packs found dynamically (via web search, external registry, or community sources) are not guaranteed to be in the brief-mcp canonical schema. `brief_install_ontology` MUST validate the pack structure on install.

**v1 approach:** Strict validation on install — if a pack does not have the required fields (`name`, `version`, `entries[].id`, `entries[].label`), reject it with a clear error describing what's missing or wrong, and provide guidance on the expected format. The AI may assist the user in reformatting the pack before installation. However, packs that have the required fields plus additional non-standard fields are accepted — the per-pack `search_fields` config from ONT-09 controls which fields are searched.

When a downloaded pack fails validation, the error response MUST include the pack's actual field structure (field names and types found) so the AI can assist with reformatting.

### SEC-04: Sanitise Ontology Pack Content
When loading ontology packs (especially user-created or downloaded ones), validate the JSON schema strictly. Do not trust arbitrary keys or execute embedded content. See SEC-07 through SEC-16 for the full ecosystem security model.

### SEC-07: Ontology Pack Schema Validation (Strict)
Ontology packs loaded from any source MUST be validated against a strict JSON schema before indexing. Validation MUST check:
- **Required fields exist** with correct types: `name` (string), `version` (string), `entries` (array), each entry has `id` (string) and `label` (string)
- **No unexpected field types**: e.g., `entries[].keywords` must be string arrays, not objects or executable code
- **String length limits**: entry labels ≤ 500 chars, descriptions ≤ 5000 chars, keywords ≤ 100 chars each
- **Array size limits**: max entries per pack (configurable, default 50,000), max keywords per entry (100), max synonyms per entry (50), max references per entry (500)
- **No embedded HTML/script in string fields** that could be rendered unsafely
- Packs that fail validation are rejected with a clear error describing which validation rule failed

### SEC-08: Ontology Pack Size Limits
Ontology packs MUST be subject to size limits to prevent denial-of-service via oversized payloads:
- **File size limit**: configurable, default 50 MB per pack file
- **Total installed size limit**: configurable, default 500 MB across all packs

### SEC-18: Entry ID Sanitisation
Ontology pack entry IDs MUST be validated on pack load: allowed characters are alphanumeric, hyphens, and underscores only (`[a-zA-Z0-9_-]`). IDs containing path separators, dots, spaces, or other special characters MUST be rejected. Entry IDs MUST be unique within a pack — duplicates are a validation error. Labels used in HTML comment tags MUST have double quotes escaped or stripped to prevent comment parsing breakage.

## Test Specification

### Unit Tests (specific input → expected output)
- Valid pack with required fields → loads successfully
- Pack missing name field → rejected with clear error
- Pack missing entries array → rejected with clear error
- Entry missing id field → rejected with error identifying the entry
- Entry ID with path separator characters → rejected
- Duplicate entry IDs within pack → validation error
- Entry label exceeding 500 chars → rejected
- Pack with 50,001 entries → rejected (exceeds limit)
- Pack with non-standard fields → loads with warning listing unexpected fields
- Pack file exceeding 50MB → rejected before full parse
- Keys named __proto__ or constructor → rejected (prototype pollution)
- Zero packs installed → graceful empty state, not an error
- Schema_version field present → accepted and ignored
- Pack with correct required fields plus extras → accepted
- Failed validation → response includes actual field structure for AI assistance

### Property Tests (invariants that hold for ALL inputs)
- forAll(valid pack JSON): loading never throws, returns structured result
- forAll(entry ID): only [a-zA-Z0-9_-] characters accepted
- forAll(pack file): size checked before full parse
- forAll(pack): duplicate entry IDs always detected

## Tier 4 Criteria

Tier 4 criteria: none
