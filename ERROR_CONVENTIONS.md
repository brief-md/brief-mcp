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

## errors/error-types (base classes)
- `NotFoundError(message)` — extends `BriefError`, type: `"not_found"` — THROWN
- `InvalidInputError(message)` — extends `BriefError`, type: `"invalid_input"` — THROWN
- `SystemError(message)` — extends `BriefError`, type: `"system_error"` — THROWN
