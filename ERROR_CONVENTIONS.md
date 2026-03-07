# ERROR_CONVENTIONS.md — Canonical Error Formats

## ontology/browse
- `new NotFoundError("Pack '{pack}' not found")` — matches `/not found/i` — THROWN
- `new NotFoundError("Entry '{pack}:{id}' not found")` — matches `/not found/i` — THROWN

## ontology/search
- `new Error("Query must be a non-empty string")` — matches `/non-empty/i` — THROWN
- `new Error("Query exceeds maximum length...")` — matches `/maximum length/i` — THROWN

## ontology/tagging
- `new NotFoundError("Pack '{pack}' not found")` — matches `/not found/i` — THROWN (non-existent pack)
- `new NotFoundError("Entry '{pack}:{id}' not found")` — matches `/not found/i` — THROWN (non-existent entry)
- `new InvalidInputError("...double-dash...")` — matches `/double.?dash|--|invalid/i` — THROWN (invalid entry ID with --)
- `new NotFoundError("...paragraph...not found...")` — matches `/paragraph.*not found|not found.*paragraph/i` — THROWN (paragraph not found in section)

## ontology/management
- `new Error("Only secure HTTPS sources are permitted...")` — matches `/https/i` — THROWN
- `new Error("Private/internal IP addresses are not allowed...")` — matches `/private|ssrf/i` — THROWN
- `new Error("Checksum mismatch...")` — matches `/checksum/i` — THROWN

## ontology/schema
- Schema errors use `makeSchemaError(message, fieldStructure?)` — type: `"user_error"` — THROWN
- Pattern: `new Error(message)` with `.type = "user_error"` and optional `.fieldStructure`

## reference/lookup
- `new Error("At least one of creator or title is required")` — matches `/at least one|required/i` — THROWN (both params missing)

## reference/suggestion
- `new NotFoundError("Pack '{pack}' not found")` — matches `/not.?found/i` — THROWN (non-existent pack)
- `new NotFoundError("Entry '{pack}:{id}' not found")` — matches `/not.?found/i` — THROWN (non-existent entry)

## reference/writing
- `new Error("No active project")` — matches `/active.*project|no project/i` — THROWN (noActiveProject guard)
- `duplicateWarning: string` — RETURNED in result (same-section exact duplicate, write NOT blocked)

## type-intelligence/loading
- No errors thrown — module NEVER returns empty or error (COMPAT-07)
- Invalid YAML → `yamlFallback: true` in result, warning logged — NOT THROWN
- Missing/corrupted generic guide → regenerated silently — NOT THROWN
- Circular parent_type → `circularDetected: true` in result — NOT THROWN
- `signal` field matches `/no type guide|generic|adaptive/i` on generic fallback — RETURNED

## type-intelligence/creation
- `new Error("Alias '{x}' conflicts with existing guide '{name}'...")` — matches `/alias|conflict|collision/i` — THROWN (alias collision with higher-precedence guide)
- `new Error("Guide exceeds size limit...")` — matches `/size|limit/i` — THROWN (guide > 100 KB)

## extension/creation
- `new Error("Invalid extension name: {name} — only [A-Z0-9 ] characters allowed")` — matches `/character|invalid|name/i` — THROWN (WRITE-16b: invalid chars in extension name)
- `new Error("Ambiguous subsection '{subsection}' found in multiple extensions: ...")` — matches `/ambiguous|multiple/i` — THROWN (WRITE-17: bare subsection name matches multiple extensions)

## visibility/frameworks
- `new NotFoundError("Pack '{pack}' not found")` — matches `/not found/i` — THROWN (nonexistent pack)
- `new Error("No active project")` — matches `/active.*project|no project/i` — THROWN (noActiveProject guard)

## errors/error-types (base classes)
- `NotFoundError(message)` — extends `BriefError`, type: `"not_found"` — THROWN
- `InvalidInputError(message)` — extends `BriefError`, type: `"invalid_input"` — THROWN
- `SystemError(message)` — extends `BriefError`, type: `"system_error"` — THROWN
