# TASK-42: Extension — Suggestion

## Metadata
- Priority: 45
- Status: pending
- Dependencies: TASK-40, TASK-08
- Module path: src/extension/
- Type stubs: src/types/extension.ts
- Also read: src/types/type-intelligence.ts
- Test file: tests/extension/suggestion.test.ts
- Estimated context KB: 35

## What To Build

Implement the `brief_suggest_extensions` MCP tool — a three-tier algorithm that suggests relevant extensions for a project. Tier 1 uses the type guide's `suggested_extensions` from YAML frontmatter. Tier 2 matches the project description against abstract capability descriptors (sensory qualities, meaning/intent, language-level, visual, business, technical) to find relevant extensions. Tier 3 proposes custom extension names mapped from Universal Project Dimensions as bootstrap suggestions. The tool knows about all six spec-defined extensions with domain and abstract descriptions. It always returns actionable output — never empty with no guidance. Suggested ontologies include availability checking (marking unavailable packs). Extension definitions are loaded from a bundled JSON file.

## Implementation Guide

1. `src/extension/suggestion.ts` — extension suggestion tool.

2. Register `brief_suggest_extensions` tool handler. Accept parameters: `project_type` (required), `description` (optional — project description for Tier 2 matching), `active_extensions` (optional array — already added extensions to exclude from suggestions).

3. Bundled extension registry: load extension definitions from a bundled JSON file containing all six spec-defined extensions (SONIC ARTS, NARRATIVE CREATIVE, LYRICAL CRAFT, VISUAL STORYTELLING, STRATEGIC PLANNING, SYSTEM DESIGN) with domain descriptions, abstract capability descriptors, typical subsections, and commonly associated ontologies.

4. Tier 1 — Type guide driven: call T40 to load the type guide for the project type. Extract `suggested_extensions` from the YAML frontmatter. Return these as primary suggestions with source indicator.

5. Tier 2 — Description-to-extension matching: analyse the project description against the abstract capability descriptors (sensory qualities, meaning/intent, language-level, visual, business, technical). Match extensions whose capability descriptors align with the project description. Return as secondary suggestions.

6. Tier 3 — Bootstrap suggestions: when Tiers 1 and 2 produce no results, return `bootstrap_suggestions` with proposed custom extension names mapped from Universal Project Dimensions. This ensures the tool always returns actionable output.

7. Suggested ontology availability: for each suggestion that includes associated ontologies, check if the pack exists in the registry or is installed. Mark unavailable packs with "(not found in registry)". Never auto-install. If registry is unreachable, note "Registry unavailable".

8. When no suggestions are found at any tier, include a structured signal indicating what's missing and what the AI can do about it (suggest manual extension creation or custom extension names).

## Exported API

Export from `src/extension/suggestion.ts`:
- `suggestExtensions(params: { projectType: string; description?: string; activeExtensions?: string[]; installedOntologies?: string[]; simulateRegistryDown?: boolean }) → ExtensionSuggestionResult & { registryNote?: string; signal?: string }`

  **Return type extends `ExtensionSuggestionResult` from `src/types/extensions.ts`:**
  ```
  {
    tier1Suggestions?: ExtensionSuggestion[];   // type-guide-driven suggestions
    tier2Suggestions?: ExtensionSuggestion[];   // description-matching suggestions
    tier3BootstrapSuggestions?: string[];        // bootstrap custom extension names
    availabilityChecks?: Record<string,          // per-ontology availability status
      "available" | "not-found" | "registry-unavailable">;
    // Additional fields beyond ExtensionSuggestionResult:
    registryNote?: string;                       // "Registry unavailable" when down
    signal?: string;                             // structured signal for AI
  }
  ```
  Each `ExtensionSuggestion` has `{ name, reason, confidence, sourceTier, extension?,
  suggestedOntologies? }`. Results are grouped by tier (NOT a flat `suggestions` array).
  Six known extensions: `sonic_arts`, `narrative_creative`, `lyrical_craft`,
  `visual_storytelling`, `strategic_planning`, `system_design`.
  Registry-down → `registryNote` set, `availabilityChecks` values = `"registry-unavailable"`.

## Rules

### COMPAT-05: Full Extension List with Abstract Capabilities
The server MUST know about all six spec-defined extensions: SONIC ARTS, NARRATIVE CREATIVE, LYRICAL CRAFT, VISUAL STORYTELLING, STRATEGIC PLANNING, SYSTEM DESIGN. The bundled extension registry must include all six with descriptions, **abstract capability descriptors** (for cross-domain matching), typical subsections, and commonly associated ontologies. The abstract capability descriptors enable the three-tier `brief_suggest_extensions` algorithm to match extensions across domains (e.g., SONIC ARTS matching "sensory qualities" for a food project).

### COMPAT-11: Extension Suggestion Three-Tier Algorithm
`brief_suggest_extensions` MUST implement all three tiers of the suggestion algorithm: (1) type guide driven, (2) description-to-extension matching via abstract capabilities, (3) bootstrap suggestions mapped from Universal Project Dimensions. The tool MUST always return actionable output — when Tiers 1-2 produce no results, Tier 3 MUST return `bootstrap_suggestions` with proposed custom extension names.
- Suggested ontologies are advisory. When presenting suggestions, check if each pack exists in the registry or is installed. Mark unavailable packs: `"(not found in registry)"`. Never auto-install. If registry unreachable, note: `"Registry unavailable"`. (OQ-218)

### RESP-02: Signal on Insufficient Data
When a tool has insufficient local data to fully answer, it MUST include a structured "Suggestions for AI" block indicating what's missing and what the AI can do about it.

## Test Specification

### Unit Tests (specific input → expected output)
- Type with guide containing suggested_extensions → Tier 1 suggestions returned
- Type with no guide (generic fallback) → Tier 2 or Tier 3 suggestions returned
- Project description matching sensory capabilities → SONIC ARTS suggested via Tier 2
- Project description matching business capabilities → STRATEGIC PLANNING suggested via Tier 2
- No matches from Tier 1 or Tier 2 → bootstrap suggestions returned from Tier 3
- Already-active extensions → excluded from suggestions
- Suggestion with installed ontology pack → pack marked as available
- Suggestion with uninstalled ontology pack → pack marked "(not found in registry)"
- Registry unreachable → "Registry unavailable" note included
- Empty project description with no type guide → Tier 3 bootstrap suggestions still returned
- All six spec-defined extensions → known and available for suggestion
- Response always includes actionable output → never empty with no guidance

### Property Tests (invariants that hold for ALL inputs)
- forAll(project type): at least one tier always produces suggestions
- forAll(suggestion): source tier always indicated
- forAll(active extension): never included in suggestions
- forAll(suggested ontology): availability always checked and indicated

## Tier 4 Criteria

Tier 4 criteria: JC-01, JC-02, JC-07, JC-09
