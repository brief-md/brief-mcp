# TASK-05b: Security — Input Sanitisation & Parameter Validation

## Metadata
- Priority: 6
- Status: pending
- Dependencies: TASK-05a
- Module path: src/security/input-sanitisation.ts
- Type stubs: src/types/security.ts
- Also read: src/types/config.ts, src/types/responses.ts
- Test file: tests/security/input-sanitisation.test.ts
- Estimated context KB: 40

## What To Build

Unicode normalization, parameter validation, input sanitization, prototype pollution prevention, and entry ID validation. The key export `normalizeForMatching()` is the single choke point for all text matching across the codebase. Also provides validators for required strings, parameter lengths, mutual exclusion, bidi stripping, entry IDs, homoglyphs, and ontology pack schema.

## Implementation Guide

1. **`normalizeForMatching(input)`:** Strip zero-width chars (U+200B/C/D, U+FEFF, U+2060 WORD JOINER, U+180E MONGOLIAN VOWEL SEPARATOR), bidi overrides (U+200E/F, U+202A-202E, U+2066-2069), apply NFC. Do NOT lowercase. Export from `src/security/input-sanitisation.ts` for use in all matching operations across the codebase (section lookup, decision title matching, ontology search, reference lookup, question matching). Reference SEC-20 and OQ-236/237/238.
2. **`validateRequiredString(value, paramName)`:** Reject undefined/null/empty/whitespace with `user_error`.
3. **`validateParameterLimits(value, paramName, type)`:** title/name 500, content 102400, query 1000, label 200, path 4096. Config-overridable.
4. **`validateMutualExclusion(params, pairs)`:** Reject conflicting pairs. Support "A requires B".
5. **`sanitizeObject(obj)`:** Recursive; reject `__proto__`/`constructor`/`prototype` keys. The rejection MUST be applied at every nesting level of the object tree, not just top-level keys — a deeply nested `__proto__` key is equally dangerous. Use `Object.create(null)` for containers holding processed pack data (prevents prototype chain access). Use `Object.hasOwn(obj, key)` instead of `key in obj` in all bracket-notation property assignment code that processes pack entries — `in` traverses the prototype chain. (OQ-235; Pattern 4)
6. **`stripBidiCharacters(input)`:** Standalone bidi removal. Called by normalizeForMatching too.
7. **`validateEntryId(id)`:** Match `^[a-zA-Z0-9_-]+$`. Reject separators/dots/spaces.
8. **`detectHomoglyphs(name)`:** NFKD-normalize, compare, advisory warning if different.
9. **`validateOntologyPackSchema(data)`:** Required fields, size limits, reject script tags.

## Exported API

Export from `src/security/input-sanitisation.ts`:
- `normalizeForMatching(input: string) → string` — strips zero-width chars, NFC normalizes
- `validateRequiredString(value: string | null, paramName: string) → void` — throws if empty/null
- `validateParameterLimits(value: string, paramName: string, type: ParameterType) → void` — limits: title 500, content 102400, query 1000, label 200, path 4096
- `validateMutualExclusion(params: object, exclusions: string[][], dependencies?: Array<{ if: string; requires: string }>) → void`
- `sanitizeObject(obj: object) → void` — throws on `__proto__`/`constructor`/`prototype` keys
- `stripBidiCharacters(text: string) → string` — removes U+202A, U+202E, etc.
- `validateEntryId(id: string) → void` — rejects `/`, `.`, spaces; pattern: `^[a-zA-Z0-9_-]+$`
- `detectHomoglyphs(text1: string, text2: string) → { hasHomoglyphs: boolean }`
- `validateOntologyPackSchema(pack: object) → void` — limits: 50000 entries, 100 keywords, 50 synonyms, 500 references

## Rules

### SEC-07: Ontology Pack Schema Validation (Strict)
Ontology packs loaded from any source MUST be validated against a strict JSON schema before indexing. Validation MUST check: Required fields exist with correct types: `name` (string), `version` (string), `entries` (array), each entry has `id` (string) and `label` (string). No unexpected field types: e.g., `entries[].keywords` must be string arrays, not objects or executable code. String length limits: entry labels <= 500 chars, descriptions <= 5000 chars, keywords <= 100 chars each. Array size limits: max entries per pack (configurable, default 50,000), max keywords per entry (100), max synonyms per entry (50), max references per entry (500). No embedded HTML/script in string fields that could be rendered unsafely. Packs that fail validation are rejected with a clear error describing which validation rule failed.

### SEC-08: Ontology Pack Size Limits
Ontology packs MUST be subject to size limits to prevent denial-of-service via oversized payloads: File size limit: configurable, default 50 MB per pack file. Total installed size limit: configurable, default 500 MB across all packs. Entry count limit: configurable, default 50,000 entries per pack. `brief_install_ontology` MUST check file size BEFORE parsing. If downloading from a URL, check `Content-Length` header and abort if over limit. Stream the download to avoid holding oversized payloads in memory.

### SEC-09: YAML Deserialization Safety in Type Guides
Type guides use YAML frontmatter. YAML parsers are a known attack vector. The YAML parser MUST: Use a safe/restricted parsing mode that only deserializes scalar values, arrays, and plain objects (no custom tags, no `!!python/object`, no `!!js/function`). In Node.js: use `yaml` package with its default safe schema, or `js-yaml` with `safeLoad` / `SAFE_SCHEMA`. NEVER use an unrestricted YAML parser that could instantiate arbitrary objects. Validate the parsed YAML output against the expected type guide schema. Disable JavaScript engine if using `gray-matter`: `gray-matter(content, { engines: {} })`. Set `maxAliasCount: 100` to prevent YAML "billion laughs" DoS. Use YAML 1.2 parsing. After YAML parsing, reject objects containing `__proto__`, `constructor`, or `prototype` keys at any nesting level. Use `Object.create(null)` for parsed data containers.

### SEC-10: AI Prompt Injection via Pack Content
Ontology pack content and type guide content are passed to the AI as tool output. A malicious pack could contain prompt injection attempts. Mitigations: The server MUST NOT strip or modify pack content. Tool responses that include pack content SHOULD include a structural frame that helps the AI distinguish pack data from instructions. The MCP tool descriptions SHOULD include guidance that pack content is user-contributed data, not system instructions.

### SEC-18: Entry ID Sanitisation
Ontology pack entry IDs MUST be validated on pack load: allowed characters are alphanumeric, hyphens, and underscores only (`[a-zA-Z0-9_-]`). IDs containing path separators, dots, spaces, or other special characters MUST be rejected. Entry IDs MUST be unique within a pack — duplicates are a validation error. Labels used in HTML comment tags MUST have double quotes escaped or stripped to prevent comment parsing breakage.

### SEC-19: Parameter length limits
Enforce per-parameter-type length limits: titles/names 500 chars, section content 100KB, search queries 1000 chars, labels 200 chars, paths 4096 chars (POSIX PATH_MAX). Return `user_error` on exceeding limits. Configurable via config.json.

### SEC-20: Strip Unicode bidirectional override characters
Strip bidi control characters (U+200E, U+200F, U+202A-202E, U+2066-2069) from all user-facing strings: project names, decision titles, section headings, ontology labels, constraint text. These characters (CVE-2021-42574 "Trojan Source") can make text display differently than stored, causing human-AI disagreement on decisions. `brief_lint` warns when bidi characters are detected.

### SEC-21: Temp File Creation Security
Use `O_EXCL` flag (`{ flag: 'wx' }` in Node.js) when creating atomic write temp files. This prevents symlink attacks where an attacker pre-creates a symlink at the predicted temp path. Combined with cryptographically random suffix.

## Test Specification

### Unit Tests (specific input -> expected output)
- Zero-width spaces in string -> stripped, letters adjacent
- Bidi override U+202E in string -> removed, visible text preserved
- Decomposed e-acute -> NFC precomposed after normalization
- Empty/whitespace required param -> `user_error` naming the parameter
- Title at 500 chars -> accepted; 501 -> rejected with limit details
- Both `replaces` and `exception_to` -> `user_error` listing conflict
- `__proto__` key nested in object -> `security_error`
- Entry ID `valid-entry_123` -> accepted; ID with `/` or `.` -> rejected
- Homoglyph Cyrillic "a" vs Latin "a" -> advisory warning
- Pack with valid schema -> passes; missing `name` -> error naming field
- Pack entry label over 500 chars -> error; `<script>` in description -> rejected

### Property Tests (invariants that hold for ALL inputs)
- forAll(string): normalized output has no zero-width or bidi chars
- forAll(string): normalizing a string twice produces the same result as normalizing once
- forAll(ID matching `[a-zA-Z0-9_-]+`): entry ID validation passes
- forAll(object without proto/constructor keys): sanitizeObject passes

## Tier 4 Criteria

Tier 4 criteria: none
