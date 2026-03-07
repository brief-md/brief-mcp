# TASK-55: Packaging — npm Package Configuration

## Metadata
- Priority: 57
- Status: pending
- Dependencies: TASK-01
- Module path: package.json, LICENSE, CHANGELOG.md, SECURITY.md, README.md
- Type stubs: none
- Also read: none
- Test file: tests/packaging/npm-package.test.ts
- Estimated context KB: 30

## What To Build

Configure the npm package for publishing. Set up `package.json` fields: `files` (include only necessary files), `bin` for CLI entry points, `engines.node` set to `>=20.0.0`, `main`/`types`/`module` fields for dual CJS/ESM support. Create the LICENSE file (MIT or Apache 2.0 per pre-build decision). Exclude test files, source maps, `.env`, dev configs, and CI configs from the published package. Start semantic versioning at 0.1.0. Initialize CHANGELOG.md following Keep a Changelog format. Enable npm provenance support. Register the npm name defensively to prevent typosquatting. Create SECURITY.md with a vulnerability disclosure process.

## Implementation Guide

1. Update `package.json` with publishing configuration.

2. `files` field: list only the files that should be included in the npm package — `dist/`, `assets/`, `LICENSE`, `README.md`, `CHANGELOG.md`. Exclude everything else.

3. `bin` field: set CLI entry points for `brief-mcp` command pointing to the compiled CLI entry file.

4. `engines` field: set `engines.node` to `>=20.0.0` (Node.js LTS).

5. Module fields: set `main` (CJS entry), `types` (TypeScript declarations), and `module` (ESM entry) for dual module format support.

6. Version: start at `0.1.0` following semantic versioning. The `package.json` `version` field is the source of truth.

7. LICENSE: create the license file with the chosen license (MIT or Apache 2.0).

8. CHANGELOG.md: initialize following Keep a Changelog format. Every release will have an entry. Breaking changes prominently marked.

9. SECURITY.md: document how to report vulnerabilities, supported versions, and security update policy.

10. npm provenance: enable `--provenance` flag support for build attestation. Packages should be published from CI, not local machines.

11. Defensive name registration: register the npm package name early to prevent typosquatting.

12. Dependency hygiene: minimise runtime dependencies. All dependencies pinned via `package-lock.json`. Ensure no critical/high CVEs in production dependencies.

13. Package size target: the published npm package MUST be under 10 MB total. Add a CI check after the build step that runs `npm pack --dry-run` and measures the packed size. Fail the build if it exceeds 10 MB. Document the size limit in CONTRIBUTING.md so future contributors understand the constraint when adding bundled content. (OQ-125)

14. Document both usage modes in README.md: (1) `npx --yes brief-mcp@latest` for one-off or fresh-environment use (always gets the latest version, no global install needed), and (2) `npm install -g brief-mcp` followed by `brief-mcp` for daily use (faster startup, no npx cold-start overhead). Verify both modes produce identical behaviour. Always include the `--yes` flag in the `npx` example to prevent interactive prompts. Note in the README that `npx` may serve a locally cached stale version — always use `npx --yes brief-mcp@latest` (with `@latest`) to ensure the current published version is used. Add a non-blocking startup version hint: at server startup, compare the running version against the latest npm version in the background (2s timeout); if a newer version is available, log an `info`-level message: `"A newer version of brief-mcp is available ([version]). Run npm install -g brief-mcp@latest to update."` (OQ-059; OQ-199)

15. Multi-session documentation: add a section in README.md explaining the multi-session model: "Each AI client session runs its own brief-mcp process. Multiple sessions can work on different projects simultaneously. Working on the same project from two sessions simultaneously risks conflicting edits — the CONC-09 mtime check provides data-loss protection by warning before overwriting external changes." (OQ-191)

## Rules

### OSS-01: Semantic Versioning
The project MUST follow Semantic Versioning (semver). Given the 0.x\1.x nature of the spec:
- **0.x.y**: initial development — breaking changes may occur in minor versions
- **1.0.0**: first stable release — breaking changes require major version bump
- The `package.json` `version` field is the source of truth. `--version` outputs this.

### OSS-02: Dependency Hygiene
- Minimise runtime dependencies — every dependency is attack surface and maintenance burden
- All dependencies MUST be pinned to exact versions in `package-lock.json` (npm default)
- Run `npm audit` in CI — fail the build on critical/high severity vulnerabilities
- No dependencies with known CVEs in production dependencies
- Dev dependencies are less constrained but still audited

### OSS-04: Changelog Management
The project MUST maintain a `CHANGELOG.md` following the Keep a Changelog format. Every release has an entry. Every user-facing change is documented. Breaking changes are prominently marked.

### OSS-05: npm Package Hygiene
The published npm package MUST:
- Include only necessary files (use `files` field in `package.json` or `.npmignore`)
- NOT include: test files, source maps, `.env` files, development configs, CI configs
- Have correct `bin`, `main`, `types`, and `engines` fields in `package.json`
- Specify `engines.node` with the minimum supported Node.js version

### OSS-06: Reproducible Builds
The build output MUST be reproducible — same source + same dependencies = same output. This means:
- Lock files (`package-lock.json`) are committed and used in CI (`npm ci`, not `npm install`)
- Build scripts are deterministic (no timestamps embedded, no random values)
- The build environment is documented (Node.js version, OS)

### OSS-07: Supply Chain Security
- Enable npm provenance (`--provenance` flag) for published packages to establish build attestation
- Consider using a `SECURITY.md` file documenting: how to report vulnerabilities, supported versions, security update policy
- The `compatible-mcps.json` registry is maintained by project maintainers only — community submissions go through a review PR process
- Published packages should be published from CI (not local machines) to prevent compromised dev environments from tainting releases

## Test Specification

### Unit Tests (specific input → expected output)
- package.json files field → includes only dist/, assets/, LICENSE, README, CHANGELOG
- package.json bin field → points to compiled CLI entry
- package.json engines → node >=20.0.0
- package.json main, types, module → all set correctly
- package.json version → follows semver, starts at 0.1.0
- LICENSE file → exists and contains valid license text
- CHANGELOG.md → exists and follows Keep a Changelog format
- SECURITY.md → exists with disclosure process documented
- Published package → does not contain test files, source maps, .env, or dev configs
- npm audit → no critical/high severity vulnerabilities in production deps

### Property Tests (invariants that hold for ALL inputs)
- forAll(published package): only files in `files` field are included
- forAll(build): output is reproducible (deterministic)
- forAll(dependency): pinned in package-lock.json

## Tier 4 Criteria

Tier 4 criteria: none
