# TASK-01: Root — Project Scaffold & Architecture

## Metadata
- Priority: 1
- Status: pending
- Dependencies: none
- Module path: src/ (root)
- Type stubs: none
- Also read: none
- Test file: tests/scaffold/scaffold.test.ts
- Estimated context KB: 35

## What To Build

Enhance the bootstrap scaffold created during planning. Config files (package.json, tsconfig.json, tsup.config.ts, vitest.config.ts, biome.json) already exist — this task verifies/adds project-specific fields. It also ensures all 19 ARCH-04 src/ module folders exist, creates entry stubs (src/index.ts, src/cli.ts), and adds a Node.js version check utility.

## Implementation Guide

1. Verify/add to `package.json`: `engines` (node >=20), `main` (./dist/index.cjs), `module` (./dist/index.js), `types`, `bin` (brief-mcp → ./dist/cli.js), `files` (["dist/"]), `exports` (dual import/require), scripts (build:ts, build:assets, build, dev, test, lint, typecheck), MCP SDK dependency (^1.26.0), devDependencies (typescript, tsup, vitest, @vitest/coverage-v8, @biomejs/biome, husky, fast-check, copyfiles).

2. Verify `tsconfig.json`: target ES2022, module NodeNext, strict true, outDir dist, rootDir src, declaration true.

3. Verify `tsup.config.ts`: entry ['src/index.ts', 'src/cli.ts'], format ['cjs', 'esm'], dts true.

4. Verify `vitest.config.ts`: include tests/**/*.test.ts, globals true.

5. Verify `biome.json`: linter enabled, formatter spaces width 2, ignore dist/node_modules/.loop-logs/.

6. Ensure all 19 src/ module directories exist: types, parser, writer, hierarchy, workspace, context, validation, ontology, reference, type-intelligence, extension, visibility, server, cli, observability, errors, security, config, io.

7. Verify `.husky/pre-commit` runs Tiers 1+2.

8. Create `src/index.ts` stub (placeholder export + version check call) and `src/cli.ts` stub.

9. Create `src/check-node-version.ts`: `checkNodeVersion(minimum: number): void` — parse `process.versions.node`, warn to stderr and exit(1) if major < minimum.

## Rules

### ARCH-01: No External Services
The server MUST NOT depend on any external service, database, or API for core functionality. All data lives on the local filesystem. The only external dependency allowed is optional v2 vector search (which is explicitly opt-in and degrades gracefully).

### ARCH-02: No AI Model Calls
The server MUST NOT call any AI/LLM API. The server provides data and tools. The AI client provides the intelligence. Semantic ranking, conversational presentation, and decision-making are the AI's job, not the server's.

### ARCH-03: Stateless Between Requests (Mostly)
Each tool call reads from disk. There is no in-memory cache of BRIEF.md content between calls. However, the following MAY be cached in memory for performance: Ontology pack indexes (keyword index, reverse reference index), Type guide metadata (YAML frontmatter), The active project/scope pointer, Config file contents.

### ARCH-04: Module Boundaries
The server MUST be organised into these distinct modules (as shown in the architecture diagram): Workspace Manager — project listing, switching, creation; Context Read/Write — BRIEF.md reading and writing; Ontology Engine — keyword search, synonym expansion, pack management; Hierarchy Walker — filesystem traversal, context accumulation; Extension Scaffolder — extension suggestion and creation; Reference Engine — reference lookup, suggestion, reverse mapping; Type Intelligence — type guide loading, creation, cross-type awareness; Lenient Parser — BRIEF.md parsing (lenient read, canonical write); Decision System — decision recording, supersession, exception handling, amendment; Conflict Detector — cross-section heuristic conflict detection and surfacing; Validation Engine — lint, validation, two-tier (valid vs well-formed) checks. No module should directly depend on another's internal state. Modules communicate through well-defined interfaces.

### ARCH-05: Transport Agnostic
All tool implementations MUST be transport-agnostic. The same tool handler works over stdio (v1) and HTTP (v2). Transport is a configuration concern, not a code concern.

### ARCH-06: Single Active Project (Explicit Switching)
The server maintains exactly one active project (and optionally one active scope within it) at a time. All context reads/writes target the active project/scope unless overridden by a `scope` parameter. Switching policy: The active project only changes via an explicit `brief_set_active_project` call. If the user navigates to a different project directory, the AI SHOULD ask whether they want to switch — but MUST also warn that switching mid-session triggers a full context gather, which contributes to context rot in long conversations. Persistence: The active project is held in-memory only. It does not survive server restart. On session start, the AI calls `brief_set_active_project` (or `brief_reenter_project`, which implicitly sets it).

### CODE-03: Pure Functions Where Possible
Parsing, scoring, synonym expansion, and formatting should be pure functions (same input → same output, no side effects). Side effects (file I/O, config changes) are isolated at module boundaries.

### CODE-04: Error Boundaries
Each tool handler has its own error boundary. A failure in one tool MUST NOT crash the server or affect other tools.

### CODE-05: Logging
The server MUST log: tool calls received, file operations performed, ontology index stats, and errors. Log level must be configurable (`trace`, `debug`, `info`, `warn`, `error`, `fatal`).

### CODE-06: Consistent Naming
- Tool names: `brief_{verb}_{noun}` (e.g., `brief_add_decision`, `brief_get_context`)
- File names: kebab-case (e.g., `ontology-engine.ts`, `hierarchy-walker.ts`)
- Module names: PascalCase for classes, camelCase for functions
- Config keys: snake_case

### CODE-07: No God Objects
No single class or module should handle more than one major concern. If a module grows beyond ~500 lines, it should be split.

## Test Specification

### Unit Tests (specific input → expected output)
- package.json after scaffold → engines requires Node 20+, bin maps CLI entry, main/module/exports present for dual format, files includes dist, all required scripts present, MCP SDK in dependencies
- tsconfig.json after scaffold → strict mode enabled, ESM module target
- tsup config after scaffold → two entry points (server + CLI), both CJS and ESM formats
- src/ directory → all 19 module folders exist
- src/index.ts and src/cli.ts → both exist and are importable
- Version check with current runtime (>=20) → passes silently
- Version check with simulated old version (16) → warning to stderr and non-zero exit
- TypeScript compiler on scaffold → no type errors
- Linter on scaffold → no violations
- All TypeScript source files in src/ → filenames are kebab-case (no camelCase, PascalCase, or underscores)
- No source file in src/ → exceeds 500 lines at scaffold time

### Property Tests (invariants that hold for ALL inputs)
- forAll(version "X.Y.Z" where X >= 20): version check passes
- forAll(version "X.Y.Z" where X < 20): version check rejects

## Tier 4 Criteria

Tier 4 criteria: none
