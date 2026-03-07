# TASK-35: Ontology — Pack Management

## Metadata
- Priority: 38
- Status: pending
- Dependencies: TASK-31, TASK-06, TASK-08
- Module path: src/ontology/management.ts
- Type stubs: src/types/ontology.ts
- Also read: src/types/config.ts
- Test file: tests/ontology/management.test.ts
- Estimated context KB: 45

## What To Build

Implement `brief_list_ontologies` and `brief_install_ontology` MCP tools. The list tool returns metadata about installed packs. The install tool downloads a pack from a URL, validates it against the strict schema, and installs it to the local filesystem. Enforces HTTPS-only downloads, DNS rebinding/SSRF protection, download timeout, content-length pre-check, quarantine pattern (temp → validate → final), checksum verification for registry packs, trust level communication, and index rebuild after install.

## Implementation Guide

1. `src/ontology/management.ts` — pack management operations.

2. `brief_list_ontologies` handler: return list of installed packs with metadata: name, description, entry count, version, reference coverage, vector availability flag, trust level (bundled/registry/URL), and non-standard fields if any.

3. `brief_install_ontology` handler: accept `url` (required), optional `checksum` (sha256 for registry packs). Validate URL is HTTPS — reject http://. Download with 30s timeout. Check Content-Length against size limits before full download. Follow redirects only to HTTPS destinations.

4. DNS rebinding / SSRF protection: block requests to private IP ranges (10.x, 172.16-31.x, 192.168.x, 127.x, ::1, fd00::/8). Disable `file://` protocol. Enforce Content-Type is application/json or text/*. Pin DNS resolution — resolve the hostname once, then use the resolved IP address for the actual TCP connection; do not re-resolve, to prevent DNS rebinding attacks that bypass the initial IP check. Reject responses with any Content-Type other than `application/json` or `text/*`. (OQ-239)

5. Quarantine pattern: download to a temp file first. Run full schema validation (T31's SEC-07). If valid, move to `~/.brief/ontologies/`. If invalid, delete temp file and return error with the pack's actual field structure.

6. Checksum verification: when `checksum` parameter provided (registry packs), compute sha256 of downloaded file and compare. Reject on mismatch.

7. Trust level: include in response — "bundled" (shipped with package), "registry" (from community registry), "url" (from arbitrary URL, user takes responsibility).

8. After successful install: trigger index rebuild (T32a). Update config to record the installed pack. No auto-update of installed packs — all updates require explicit user action.

9. Pack update integrity: when re-installing a pack that already exists (same `name` field), compare the incoming pack's `version` against the installed pack and log the version change at `info` level. For registry packs where a `checksum` parameter is provided, compute the sha256 of the newly downloaded file and verify it matches before overwriting the existing installation. Preserve the old pack file as `{name}.json.bak` before overwriting. If checksum verification fails on an update, restore the `.bak` and return an error. (OQ-101)

## Exported API

Export from `src/ontology/management.ts`:
- `listOntologies(options?: { emptyState?: boolean }) → { packs: Array<{ name: string; version: string; entryCount: number; trustLevel: string; description: string; referenceCoverage: number; vectorAvailability: boolean }> }`
- `installOntology(params: { url: string; checksum?: string; simulateContentType?: string; simulateExistingVersion?: string; simulateNewVersion?: string; simulateChecksumMismatch?: boolean; simulateDnsPinning?: boolean }) → { installed: boolean; packName: string; indexRebuilt?: boolean; trustLevel: string; trustWarning?: string; validated?: boolean; backupCreated?: boolean; backupPath?: string; versionComparison?: { previous: string; incoming: string }; success?: boolean; backupRestored?: boolean; restoredFilePath?: string; dnsResolvedOnce?: boolean; dnsPinned?: boolean }`
- `getAutoUpdateStatus(params: { packName: string; version: string }) → { autoUpdateEnabled: boolean; requiresUserAction: boolean }`

## Rules

### ONT-07: Pack Loading and Indexing
Ontology packs MUST be loaded and indexed at server startup. The index includes:
- Forward index: term → [(entry_id, field, score)]
- Reverse reference index: {creator, title} → [(pack, entry_id)]
Indexes are rebuilt when packs are installed or updated.

### ONT-10: On-the-Fly Pack Format Compatibility
Packs found dynamically (via web search, external registry, or community sources) are not guaranteed to be in the brief-mcp canonical schema. `brief_install_ontology` MUST validate the pack structure on install.

**v1 approach:** Strict validation on install — if a pack does not have the required fields (`name`, `version`, `entries[].id`, `entries[].label`), reject it with a clear error describing what's missing or wrong, and provide guidance on the expected format.

When a downloaded pack fails validation, the error response MUST include the pack's actual field structure (field names and types found) so the AI can assist with reformatting.

### ONT-19: Zero Packs Graceful Handling
When no packs installed: `brief_search_ontology` returns empty with guidance message, `brief_tag_entry` returns `user_error` for missing pack, `brief_list_ontologies` returns empty array. Not an error state. (OQ-165)

### SEC-03: No Network in v1
The v1 server MUST NOT make any outbound network requests. All data is local. The `brief_install_ontology` tool from a URL is the one exception — and it only downloads a JSON file to the local filesystem.

### SEC-04: Sanitise Ontology Pack Content
When loading ontology packs (especially user-created or downloaded ones), validate the JSON schema strictly. Do not trust arbitrary keys or execute embedded content.

### SEC-11: Download Security for `brief_install_ontology`
When `brief_install_ontology` downloads from a URL:
- **HTTPS only**: reject `http://` URLs. Only allow `https://` sources.
- **No redirects to non-HTTPS**: if the URL redirects, only follow redirects to other `https://` URLs
- **Timeout**: set a download timeout (default 30 seconds) to prevent hanging on slow/malicious servers
- **Size check before full download**: check `Content-Length` header against SEC-08 limits
- **Validate after download**: apply full SEC-07 schema validation before saving to `~/.brief/ontologies/`
- **Quarantine pattern**: download to a temp file, validate, then move to final location. Never save an unvalidated file to the ontologies directory.
- **No executable content**: the downloaded file must be valid JSON. If JSON parsing fails, reject the file.

### SEC-15: Community Pack Trust Model
When users install community ontology packs or type guides, the server should communicate the trust level:
- **Bundled**: shipped with the package, reviewed by maintainers — highest trust
- **Registry**: listed in the community registry, basic validation applied — medium trust
- **URL**: installed from an arbitrary URL — lowest trust, user takes responsibility

`brief_install_ontology` response SHOULD include the trust level and a note: "This pack was downloaded from [URL]. It has not been reviewed by the brief-mcp maintainers. Pack content is passed to your AI tool."

### SEC-16: No Auto-Update of Installed Packs
Installed ontology packs and type guides MUST NOT auto-update from remote sources. All updates must be explicitly triggered by the user. This prevents supply-chain attacks where a pack is updated to include malicious content after initial review and installation.

## Test Specification

### Unit Tests (specific input → expected output)
- List installed packs → returns metadata for each (name, version, entry count, trust level)
- No packs installed → empty array, not an error
- Install from HTTPS URL → pack downloaded, validated, installed
- Install from HTTP URL → rejected (HTTPS only)
- Redirect to HTTP → rejected
- Download exceeding size limit (Content-Length check) → rejected before full download
- Download timeout → error after 30 seconds
- Downloaded pack fails schema validation → rejected with field structure in error
- Valid pack installed → index rebuilt, config updated
- Checksum provided and matches → install succeeds
- Checksum provided and mismatches → rejected
- Trust level in response → correctly indicates bundled/registry/url
- Install from URL → response includes trust warning
- Private IP address in URL → rejected (SSRF protection)
- File:// protocol URL → rejected

### Property Tests (invariants that hold for ALL inputs)
- forAll(install URL): only HTTPS URLs accepted
- forAll(installed pack): always validated before saving to ontologies directory
- forAll(install): index always rebuilt after successful install
- forAll(pack): never auto-updates without explicit user action

## Tier 4 Criteria

Tier 4 criteria: JC-02, JC-07, JC-09, JC-10
