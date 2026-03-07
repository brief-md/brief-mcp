# TASK-02: Types — Shared Types & Interfaces

## Metadata
- Priority: 2
- Status: pending
- Dependencies: TASK-01
- Module path: src/types/
- Type stubs: none
- Also read: none
- Test file: tests/types/types.test.ts
- Estimated context KB: 40

## What To Build

Define all TypeScript interfaces for inter-module communication. Every module depends on these shared types but never on another module's internals. Covers parsed BRIEF.md documents, decisions, questions, ontology data, type guides, extensions, references, hierarchy levels, accumulated context, lint findings, conflict results, tool responses, error responses, signals, and configuration. Also defines input/output types for all 38 MCP tools.

## Implementation Guide

1. Create `src/types/index.ts` — barrel file re-exporting all type modules.

2. `src/types/parser.ts`: `ParsedBriefMd` (metadata, sections[], decisions[], questions[], extensions[], comments[], warnings[]); `BriefMetadata` (key-value record with index signature for unknown fields); `Section` (heading, level, body, classification: core|extension|project-specific, optional tool name); `ParseWarning` (optional line number, message, severity: warning|info).

3. `src/types/decisions.ts`: `Decision` (id, heading, rationale, status: active|superseded|exception, format: minimal|full, optional full-format fields, source line); `Question` (text, checked, category: to-resolve|to-keep-open|resolved, options[], impact?, priority?); `IntentionalTension` (description, related decisions); `ExternalToolSession` (tool name, date, summary, breadcrumb).

4. `src/types/ontology.ts`: `OntologyPack` (id, name, version, description, entries count, file path); `OntologyEntry` (id, name, aliases[], description, related IDs[], tags[], pack ID); `OntologySearchResult` (entry, score, matched field, pack ID); `ReverseIndexEntry` (entry ID, referencing paths[], count).

5. `src/types/type-intelligence.ts`: `TypeGuide` (slug, display name, metadata, content, path); `TypeGuideMetadata` (bootstrapping flag, recommended sections/extensions/ontologies).

6. `src/types/extensions.ts`: `Extension` (name, display name, description, heading); `ExtensionSuggestion` (name, reason, confidence: high|medium|low).

7. `src/types/references.ts`: `Reference` (from ID, to ID, relationship type, context?); `ReferenceLink` (source pack, source entry, target pack, target entry, relationship).

8. `src/types/hierarchy.ts`: `HierarchyLevel` (depth, dir path, parsed content or null, file path); `AccumulatedContext` (levels[] root-to-leaf, merged metadata, merged sections, all decisions, all questions, signals[]).

9. `src/types/validation.ts`: `LintFinding` (rule ID, severity: error|warning|info, message, line?, section?, suggestion?); `ConflictResult` (conflicting pairs[], type, severity, description, suggestion).

10. `src/types/responses.ts`: `ToolResponse` (content text[], signals[], warnings[], optional metadata); `ErrorResponse` (type from taxonomy, message, suggestion?, code?); `Signal` (type string, payload record, description).

11. `src/types/config.ts`: `BriefConfig` (workspace roots[], active project path?, log level, ontology settings, type guide settings, config version); `PackConfig` (pack ID, path, enabled, excludes[]).

12. `src/types/tools.ts` — Input/Output type interfaces for all 38 tools grouped by module. For each tool, define both an `Input` interface (parameters) and an `Output` interface (response shape). The output interfaces are the formal contract between server and AI client. Use shared types as building blocks. In debug mode (when `log_level === 'debug'`), validate actual tool responses against their output interface at runtime using a type guard; log a warning if the response does not match the declared output type. Export the full type set as a named export block to support future `@brief-mcp/types` packaging. (OQ-255)

13. Use `readonly` on fields that should not be mutated post-creation. Use discriminated unions for status/classification/severity fields.

## Exported API

The types test expects runtime validation/factory functions exported alongside the type definitions:

Export from `src/types/parser.ts`:
- `validateParsedBrief(doc: unknown) → ParsedBriefMd` — runtime validator that checks structure
- `parseSections(inputs: Section[]) → Section[]` — preserves insertion order

Export from `src/types/decisions.ts`:
- `parseDecision(input: { text: string; status: DecisionStatus; rationale?: string }) → Decision`

Export from `src/types/responses.ts`:
- `createErrorResponse(type: ErrorType, message: string) → ErrorResponse`

Notes:
- `src/types/extension.ts` must re-export from `./extensions.js` (test imports singular name)
- `src/types/reference.ts` must re-export from `./references.js` (test imports singular name)
- `PackConfig` is imported from `src/types/ontology` in some tests
- The barrel export `src/types/index.ts` must have runtime exports (not type-only) — `Object.keys(types).length > 0`
- `src/types/tools.ts` must export at least 38 runtime keys

## Rules

### CODE-01: Separation of Concerns
Each module handles one responsibility. The parser doesn't know about ontologies. The ontology engine doesn't know about the filesystem layout. The hierarchy walker doesn't know about search.

### CODE-02: Interface-First Design
Define TypeScript interfaces for all inter-module communication before implementing. Modules depend on interfaces, not concrete implementations.

### ARCH-04: Module Boundaries
The server MUST be organised into these distinct modules (as shown in the architecture diagram): Workspace Manager — project listing, switching, creation; Context Read/Write — BRIEF.md reading and writing; Ontology Engine — keyword search, synonym expansion, pack management; Hierarchy Walker — filesystem traversal, context accumulation; Extension Scaffolder — extension suggestion and creation; Reference Engine — reference lookup, suggestion, reverse mapping; Type Intelligence — type guide loading, creation, cross-type awareness; Lenient Parser — BRIEF.md parsing (lenient read, canonical write); Decision System — decision recording, supersession, exception handling, amendment; Conflict Detector — cross-section heuristic conflict detection and surfacing; Validation Engine — lint, validation, two-tier (valid vs well-formed) checks. No module should directly depend on another's internal state. Modules communicate through well-defined interfaces.

## Test Specification

### Unit Tests (specific input → expected output)
- Importing the types barrel → all type modules are re-exported
- Constructing a valid parsed document → all required fields present and accessible
- Constructing a minimal decision (heading + rationale) → valid with active status and minimal format
- Constructing a full-format decision with all optional fields → valid with full format
- Constructing a question with options and category → all fields accessible
- Constructing an ontology search result → entry, score, and match field accessible
- Constructing a type guide → bootstrapping flag accessible from metadata
- Constructing a hierarchy level at depth 0 → valid root level
- Constructing accumulated context from multiple levels → levels ordered root-to-leaf
- Constructing error responses for each of the five taxonomy types → each produces valid error response
- Constructing a tool response with signals and warnings → both arrays accessible
- Constructing a config with workspace roots → roots accessible as string array
- Decision status union → only accepts active, superseded, or exception
- Section classification union → only accepts core, extension, or project-specific
- Error type union → only accepts the five taxonomy values
- Lint finding severity union → only accepts error, warning, or info

### Property Tests (invariants that hold for ALL inputs)
- forAll(valid parsed document): sections array preserves insertion order
- forAll(valid decision): always has non-empty heading and a status
- forAll(valid error response): type is always one of five taxonomy values

## Tier 4 Criteria

Tier 4 criteria: none
