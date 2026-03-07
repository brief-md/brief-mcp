# TASK-05a: Security — Path Validation & Resource Limits

## Metadata
- Priority: 5
- Status: pending
- Dependencies: TASK-02, TASK-03, TASK-04
- Module path: src/security/path-validation.ts
- Type stubs: src/types/security.ts
- Also read: src/types/config.ts, src/types/responses.ts
- Test file: tests/security/path-validation.test.ts
- Estimated context KB: 40

## What To Build

Centralized path validation, workspace boundary enforcement, resource limit checking, and filesystem safety utilities. Includes a path validator using `fs.realpath()` to defeat symlinks and Windows 8.3 bypasses, a resource limit checker (file size 10MB, section count 500, chain depth 100), a slugification utility, filesystem permission helpers, and an async semaphore capping concurrent file reads to 50.

## Implementation Guide

1. **`validatePath(inputPath, allowedRoots)`:** Resolve to absolute via `path.resolve()`, then `fs.realpath()` to follow symlinks/junctions/8.3 names. For non-existent write targets, realpath the parent and join filename. Normalize both resolved path and roots to native separators. Prefix-match against allowed roots. Throw `security_error` if path escapes all roots. Log at `debug`.

2. **`checkSecurityLimits(options)`:** Accept `{fileSize?, sectionCount?, chainDepth?}`. Compare against limits (10,485,760 / 500 / 100). Throw `security_limit_exceeded` naming the breached limit and actual value.

3. **`slugify(name)`:** NFKD normalize, strip combining marks (`/[\u0300-\u036f]/g`), lowercase, replace whitespace/underscores with hyphens, collapse consecutive hyphens, trim edges. Append `-project` to Windows reserved names (CON, PRN, AUX, NUL, COM1-9, LPT1-9). Return `unnamed-project` for empty results.

4. **`setFilePermissions(filePath, type)`:** Unix: `0o700` for dirs, `0o600` for files via `fs.chmod()`. Windows: no-op.

5. **File descriptor semaphore:** Async semaphore, capacity 50. `acquire()` returns a release function. On EMFILE, wait 100ms and retry up to 3 times.

6. **Path normalization:** `toStoragePath(p)` (always forward slashes) and `toNativePath(p)` (platform separators).

## Exported API

Export from `src/security/path-validation.ts`:
- `validatePath(inputPath: string, allowedRoots: string[]) → Promise<string>` — resolves to canonical path, throws on escape
- `checkSecurityLimits(options: { fileSize?: number; sectionCount?: number; chainDepth?: number }) → void` — throws on violation
- `slugify(name: string) → string` — lowercase-hyphenated, handles Windows reserved names, returns `'unnamed-project'` for empty
- `setFilePermissions(filePath: string, type: 'file' | 'dir') → Promise<void>` — Unix: 0o600/0o700, Windows: no-op
- `createFdSemaphore(capacity: number) → { acquire: () => Promise<() => void> }` — file descriptor semaphore
- `toStoragePath(p: string) → string` — always forward slashes
- `toNativePath(p: string) → string` — platform-specific separators
- `withEmfileRetry<T>(fn: () => Promise<T>, options: { maxRetries: number; delay: number }) → Promise<T>` — retries on EMFILE

## Rules

### SEC-01: No Path Traversal
All file paths MUST be validated to ensure they're within workspace roots or `~/.brief/`. Reject paths containing `..` that would escape these boundaries. On Windows, use `fs.realpath()` to resolve all paths before boundary validation. This resolves NTFS junctions (which `fs.lstat()` reports as directories, not symlinks) and 8.3 short filenames. Without `fs.realpath()`, junctions bypass path validation entirely.

### SEC-02: No Code Execution
The server MUST NOT execute any code from BRIEF.md files, ontology packs, or type guides. These are data files only.

### SEC-03: No Network in v1
The v1 server MUST NOT make any outbound network requests. All data is local. The `brief_install_ontology` tool from a URL is the one exception — and it only downloads a JSON file to the local filesystem.

### SEC-04: Sanitise Ontology Pack Content
When loading ontology packs (especially user-created or downloaded ones), validate the JSON schema strictly. Do not trust arbitrary keys or execute embedded content. See SEC-07 through SEC-16 for the full ecosystem security model.

### SEC-05: Config File Permissions
On Unix systems, `~/.brief/config.json` should be created with user-only permissions (600/700). It may contain workspace paths that reveal directory structure.

### SEC-06: Sensitive Content Awareness
BRIEF.md files may contain sensitive information (unreleased project details, strategic decisions, proprietary choices). The server should NOT expose BRIEF.md content outside the MCP protocol. If export features are ever added, they MUST require explicit user approval and allow field-level selection of what to share, per the IMPLEMENTATION_GUIDE.md security guidance.

### FS-06: Cross-Platform Path Handling
The server MUST handle both forward slashes and backslashes in paths. Internally, normalise to the platform's native separator. Store paths in config using forward slashes for portability.

### SEC-17: Parser Resource Limits
The parser MUST enforce resource limits to prevent denial-of-service from maliciously crafted BRIEF.md files: Maximum file size: 10 MB — files larger than this are rejected with a clear error before parsing. Maximum section count: 500 sections per file — prevents memory exhaustion from files with thousands of headings. Maximum decision chain depth: 100 links for supersession chain traversal — prevents infinite loops from circular SUPERSEDED BY / REPLACES references. These limits are safety nets — legitimate files should never approach them. Use a state-machine parser (not regex) for HTML comment extraction. Regex-based comment parsers are vulnerable to ReDoS (catastrophic backtracking) on crafted inputs like unclosed comments followed by thousands of characters. A character-by-character state machine has O(n) time complexity regardless of input.

## Test Specification

### Unit Tests (specific input -> expected output)
- Path traversal `../../../etc/passwd` from workspace root -> rejected with security error
- Path with `..` that stays inside workspace (e.g., `subdir/../file.md`) -> accepted after resolution
- Windows 8.3 short filename resolving outside workspace -> rejected after realpath
- Symlink pointing outside workspace root -> rejected after realpath
- Path within `~/.brief/` -> accepted regardless of workspace roots
- Path outside all allowed roots -> rejected with error naming the path
- Forward slashes on Windows / backslashes on Unix -> normalized correctly
- File size exactly at limit (10,485,760 bytes) -> accepted; one byte over -> rejected naming the limit
- Section count 500 -> accepted; 501 -> rejected naming the limit
- Chain depth 100 -> accepted; 101 -> rejected naming the limit
- Slugify "My Cool Project!" -> `my-cool-project`; accented text -> ASCII hyphens
- Slugify Windows reserved "CON" -> safe variant; empty input -> fallback name
- Unix file permissions -> 600 for files, 700 for dirs; Windows -> no-op
- Semaphore at capacity 50 -> all proceed; 51st -> waits for release
- EMFILE during read -> retried with delay before failing

### Property Tests (invariants that hold for ALL inputs)
- forAll(path within allowed root): validation succeeds
- forAll(path resolved outside all roots): validation rejects
- forAll(name string): slugify output matches `[a-z0-9-]+` and is never empty
- forAll(values at or below limits): limits check passes; above any limit -> fails

## Tier 4 Criteria

Tier 4 criteria: none
