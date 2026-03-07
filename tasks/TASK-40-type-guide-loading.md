# TASK-40: Type Intelligence — Type Guide Loading & Resolution

## Metadata
- Priority: 43
- Status: pending
- Dependencies: TASK-06, TASK-08
- Module path: src/type-intelligence/
- Type stubs: src/types/type-intelligence.ts
- Also read: src/types/config.ts
- Test file: tests/type-intelligence/loading.test.ts
- Estimated context KB: 40

## What To Build

Implement the `brief_get_type_guide` MCP tool — load type guides from `~/.brief/type-guides/`, parse YAML frontmatter with markdown body, and resolve by a strict order: exact type name → alias match across all installed guides → generic guide fallback. The tool never returns empty — the generic guide is always available. Responses include provenance metadata (bundled, ai_generated, community, user_edited), alias match indicators, and generic guide signals. Handles invalid YAML gracefully (fallback to markdown-only), detects circular parent_type chains, and treats missing parent_type as a soft reference.

## Implementation Guide

1. `src/type-intelligence/loading.ts` — type guide loading and resolution.

2. Register `brief_get_type_guide` tool handler. Accept parameter: `type` (required — the project type to look up).

3. Type guide file loading: read `.md` files from `~/.brief/type-guides/`. Each file contains YAML frontmatter (parsed in safe mode) and a markdown body. The frontmatter includes fields: `type`, `type_aliases`, `source`, `version`, `suggested_extensions`, `suggested_ontologies`, `common_parent_types`, `common_child_types`, `bootstrapping`.

4. Resolution order: (1) exact match on `type` field (case-insensitive, normalised to lowercase), (2) alias match via `type_aliases` across ALL installed guides, (3) generic guide fallback (`_generic.md`). The server MUST never return an empty or error response.

5. Alias match response: when resolved via alias, include `matched_via_alias: true` and `alias_used` in the response.

6. Generic guide response: when the generic guide is returned, include `is_generic: true` and `mode: "adaptive"`.

7. Generic guide safety: the bundled generic guide (`_generic.md`) with `bootstrapping: true` MUST always be available. If missing or corrupted, regenerate from embedded/bundled defaults on startup.

8. Provenance: every response includes `source` field from the guide's YAML frontmatter (bundled, ai_generated, community, user_edited).

9. Type guide precedence: when both a user-created/AI-generated guide and a bundled guide exist for the same type, the user-created guide takes precedence. Bundled guides serve as fallbacks.

10. Invalid YAML fallback: if YAML frontmatter parsing fails, treat the entire file as markdown body with no structured metadata. Log a warning. Guide content is still usable for conversational guidance.

11. Parent type handling: if a guide specifies `parent_type`, resolve the parent guide. If the parent is missing, use the child guide only (soft reference) — lint can warn later. Detect circular parent_type chains (max depth 10, break on cycle).

12. Type name normalisation: convert input to lowercase before matching.

13. Generic guide signal block: when returning the generic guide (fallback path), include a structured `Suggestions for AI` signal block in the response: `"No type guide found for type [X]. Returning the generic adaptive guide. Once you complete a project setup conversation for this type, call brief_create_type_guide to create a domain-specific guide that will be used for future projects of this type."` This is the standard RESP-02 signal for the "no type guide" scenario documented in TASK-46. (Design Pattern 5)

14. This task implements Design Pattern 37 (Domain Bootstrapping). The full adaptive flow is: (1) `brief_get_type_guide` returns the generic guide with `is_generic: true`, (2) the AI uses the 10 Universal Dimensions for the setup conversation, (3) within the first session `brief_create_type_guide` is called to produce a domain-specific guide, (4) future lookups for this type return the specific guide (the generic guide is self-replacing for that domain).

16. **Manual edit detection for `source` field update (COMPAT-10):** To detect when a user has manually edited a type guide file: maintain a persistent mtime index at `~/.brief/type-guide-mtimes.json`. On each guide load, compare the file's current mtime against the stored value. If the mtime has changed and the current `source` field is `ai_generated` or `community`, update the `source` field in the YAML frontmatter to `user_edited` and write the file back, then update the stored mtime. If the mtime index is absent (first run), populate it from current files without triggering source updates. This is a SHOULD requirement — if v1 defers this detection, log a debug note. Reference COMPAT-10.

15. **YAML security for type guide frontmatter (SEC-09):** When parsing YAML frontmatter from type guide files, enforce all four security requirements: (a) Disable the JavaScript engine in `gray-matter`: `gray-matter(content, { engines: { js: false } })` — prevents execution of embedded JS in frontmatter. (b) Set `maxAliasCount: 100` to prevent YAML "billion laughs" DoS via deeply nested aliases. (c) Use YAML 1.2 parsing mode to avoid type coercion surprises (e.g., `no` being parsed as boolean `false`). (d) After parsing, call `sanitizeObject()` (from TASK-05b) to reject any keys named `__proto__`, `constructor`, or `prototype` at any nesting depth — use `Object.create(null)` for the parsed output container. Type guides may be user-created or community-sourced (SEC-13), making these requirements non-optional. Reference SEC-09.

## Exported API

Export from `src/type-intelligence/loading.ts`:
- `getTypeGuide(params: { type: string; simulateMissing?: boolean; simulateCorrupt?: boolean; simulateMtimeChange?: boolean; simulateFirstRun?: boolean; simulateYamlContent?: string }) → TypeGuideLoadResult & { signal?: string; yamlFallback?: boolean; parentGuide?: TypeGuide; circularDetected?: boolean; reloaded?: boolean; fromCache?: boolean; mtimeIndexPopulated?: boolean; sourceModified?: boolean; jsExecutionPrevented?: boolean; aliasExpansionLimited?: boolean; expansionCount?: number }`

  **Return type extends `TypeGuideLoadResult` from `src/types/type-intelligence.ts`:**
  ```
  {
    guide: TypeGuide;           // MUST be full TypeGuide shape:
                                //   { slug, displayName, metadata: TypeGuideMetadata,
                                //     content, path, body? }
                                // metadata contains: type, typeAliases?, source,
                                //   version, suggestedExtensions?, suggestedOntologies?,
                                //   commonParentTypes?, commonChildTypes?, bootstrapping?,
                                //   createdByProject?, parentType?
    matchedViaAlias?: boolean;  // true when resolved via alias
    aliasUsed?: string;         // which alias matched
    isGeneric?: boolean;        // true when returning generic fallback
    mode?: 'adaptive';          // set when isGeneric is true
    // Additional fields beyond TypeGuideLoadResult:
    signal?: string;            // matches /no type guide|generic|adaptive/i on fallback
    yamlFallback?: boolean;     // true when YAML parsing failed
    parentGuide?: TypeGuide;    // resolved parent if parent_type specified
    circularDetected?: boolean; // true if circular parent_type chain found
    // ... plus test-seam fields (reloaded, fromCache, etc.)
  }
  ```
  Missing type → `signal` matches `/no type guide|generic|adaptive/i`. `guide.body` is the guide content. `guide.metadata.source` is the provenance. Alias chain limit prevents infinite expansion. JS in YAML content is not executed (`jsExecutionPrevented`). `simulate*` params are test hooks.

## Rules

### COMPAT-07: Type Alias Resolution
`brief_get_type_guide` MUST resolve types in this order: (1) exact match on `type` field, (2) alias match via `type_aliases` across all installed guides, (3) generic guide fallback. The server MUST never return an empty or error response — the generic guide is always available.

### COMPAT-08: Generic Guide Always Available
The bundled generic guide (`_generic.md`) with `bootstrapping: true` MUST always be installed and available. If it is missing or corrupted, the server MUST regenerate it from bundled defaults on startup. When returning the generic guide, the response MUST include `"is_generic": true` and `"mode": "adaptive"`.

### COMPAT-09: Type Alias Uniqueness
Type aliases declared in `type_aliases` MUST be globally unique across all installed type guides. When installing or creating a type guide, the server MUST validate that no alias collision exists. If a collision is detected, the operation MUST fail with a descriptive error.
- When creating/installing a guide, check for alias collisions. If found, warn: "Alias '[x]' conflicts with existing guide '[name]'. Newer guide takes precedence." Precedence: user_edited > ai_generated > community > bundled. `brief_lint` reports collisions. (OQ-252)

### COMPAT-10: Type Guide Provenance
Type guides MUST include a `source` field in YAML frontmatter with one of: `bundled`, `ai_generated`, `community`, `user_edited`. `brief_create_type_guide` MUST set `source: ai_generated` automatically. When a user manually edits a guide file, the server SHOULD detect this and update `source` to `user_edited` on next read.

### COMPAT-13: Type Guide Precedence
When both a user-created/AI-generated type guide and a bundled type guide exist for the same type, the user-created guide takes precedence. Bundled guides serve as fallbacks. `brief_lint` MAY surface an info-level note when a newer bundled guide is available for a type that has a user-created guide.

### COMPAT-15: Type Guide YAML Fallback
If YAML frontmatter parsing fails for a type guide, treat entire file as markdown body with no structured metadata. Log warning, guide content still usable for conversational guidance. `brief_lint` reports as warning. (OQ-171)

## Test Fixtures

The implementation must provide these fixture type guides (loaded as in-memory defaults when `~/.brief/type-guides/` is not available, or as simulate-param-driven test data):

| Fixture File | `type` | `type_aliases` | `source` | `parent_type` | Notes |
|---|---|---|---|---|---|
| `album.md` | `album` | — | `bundled` | — | Exact match target; parent for music-release |
| `fiction.md` | `fiction` | `["novel"]` | `community` | — | Alias match target for "novel" |
| `music-release.md` | `music-release` | `["ep", "lp", "single"]` | `ai_generated` | `album` | Alias + parent_type test target |
| `film.md` | `film` | — | `bundled` | — | Used in property test source check |
| `_generic.md` | `_generic` | — | `bundled` | — | `bootstrapping: true`; always-available fallback |
| `bad-yaml-guide.md` | (invalid) | — | — | — | Contains broken YAML frontmatter |
| `dual-guide-type-user.md` | `dual-guide-type` | — | `user_edited` | — | Higher precedence for same-type test |
| `dual-guide-type-bundled.md` | `dual-guide-type` | — | `bundled` | — | Lower precedence for same-type test |
| `orphan-child.md` | `orphan-child` | — | `ai_generated` | `nonexistent-parent` | Missing parent_type (soft ref) |
| `circular-a.md` | `circular-parent` | — | `bundled` | `circular-child` | Circular chain with circular-b |
| `circular-b.md` | `circular-child` | — | `bundled` | `circular-parent` | Circular chain with circular-a |
| `edited-guide.md` | `edited-guide` | — | `ai_generated` | — | Mtime-change test target |
| `unchanged-guide.md` | `unchanged-guide` | — | `ai_generated` | — | Mtime-unchanged test target |
| `first-run-guide.md` | `first-run-guide` | — | `community` | — | First-run mtime index test |

Property test aliases (all must resolve via alias, NOT exact match):
- `"novel"` → fiction guide
- `"ep"`, `"lp"`, `"single"` → music-release guide

## Test Specification

### Unit Tests (specific input → expected output)
- Exact type match → correct guide returned with source metadata
- Alias match ("novel" aliased in "fiction" guide) → guide returned with indication that an alias was used for matching
- No match, generic guide exists → generic guide returned with is_generic and adaptive mode flags
- Generic guide missing on startup → regenerated from defaults, then returned
- Generic guide corrupted → regenerated from defaults, then returned
- Invalid YAML frontmatter → file treated as markdown body only, no structured metadata
- Two guides exist for same type (bundled + ai_generated) → user-created guide takes precedence
- Type name with mixed case → normalised to lowercase before matching
- Guide with parent_type → parent guide resolved and included
- Guide with missing parent_type → child guide used alone without error
- Circular parent_type chain → detected and broken at max depth
- Guide response always includes source field → provenance always present
- Guide file mtime changed since last load, source is ai_generated → source field updated to user_edited in file
- Guide file mtime unchanged → source field not modified
- First run with no mtime index → mtime index populated, no source field updates triggered

### Property Tests (invariants that hold for ALL inputs)
- forAll(type query): response is never empty — always returns a guide or generic fallback
- forAll(guide file): source field always present in response
- forAll(alias match): alias-match indication always set in response
- forAll(generic fallback): is_generic and mode always included

## Tier 4 Criteria

Tier 4 criteria: JC-02, JC-07, JC-09
