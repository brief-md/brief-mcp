// src/types/tools.ts
// Input/Output type interfaces for all 38 MCP tools.

import type { ContextReadResult } from "./context.js";
import type { Decision, Question } from "./decisions.js";
import type { ExtensionSuggestion } from "./extensions.js";
import type {
  OntologyEntry,
  OntologyPack,
  OntologySearchResult,
} from "./ontology.js";
import type { SuggestedReference } from "./references.js";
import type { TypeGuideLoadResult } from "./type-intelligence.js";
import type { ConflictResult, LintFinding } from "./validation.js";
import type { ProjectFrameworks } from "./visibility.js";

// --- Workspace Tools ---

export interface ListProjectsInput {
  readonly workspace?: string;
}

export interface ListProjectsOutput {
  readonly projects: Array<{
    name: string;
    path: string;
    type?: string;
    lastUpdated?: string;
  }>;
  readonly warnings: string[];
}

export interface SetActiveProjectInput {
  readonly path: string;
}

export interface SetActiveProjectOutput {
  readonly projectName: string;
  readonly filePath: string;
  readonly confirmed: boolean;
}

export interface CreateProjectInput {
  readonly name: string;
  readonly type: string;
  readonly workspace?: string;
  readonly extensions?: string[];
}

export interface CreateProjectOutput {
  readonly projectPath: string;
  readonly filePath: string;
  readonly created: boolean;
}

export interface CreateSubProjectInput {
  readonly name: string;
  readonly type: string;
  readonly parentPath?: string;
}

export interface CreateSubProjectOutput {
  readonly projectPath: string;
  readonly filePath: string;
  readonly parentPath: string;
}

export interface ReenterProjectInput {
  readonly path?: string;
}

export interface ReenterProjectOutput extends ContextReadResult {
  readonly reenterySummary: string;
}

export interface AddWorkspaceInput {
  readonly path: string;
}

export interface AddWorkspaceOutput {
  readonly added: boolean;
  readonly normalizedPath: string;
}

// --- Context Tools ---

export interface GetContextInput {
  readonly scope?: string;
  readonly includeHistory?: boolean;
  readonly sections?: string[];
}

export type GetContextOutput = ContextReadResult;

export interface GetConstraintsInput {
  readonly scope?: string;
}

export interface GetConstraintsOutput {
  readonly constraints: string[];
  readonly filePath: string;
}

export interface GetDecisionsInput {
  readonly scope?: string;
  readonly status?: "active" | "superseded" | "all";
}

export interface GetDecisionsOutput {
  readonly activeDecisions: Decision[];
  readonly decisionHistory?: Decision[];
  readonly filePath: string;
}

export interface GetQuestionsInput {
  readonly scope?: string;
  readonly category?: "to-resolve" | "to-keep-open" | "resolved" | "all";
}

export interface GetQuestionsOutput {
  readonly toResolve: Question[];
  readonly toKeepOpen: Question[];
  readonly resolved?: Question[];
  readonly filePath: string;
}

export interface AddDecisionInput {
  readonly title: string;
  readonly why?: string;
  readonly when?: string;
  readonly alternativesConsidered?: string;
  readonly replaces?: string;
  readonly exceptionTo?: string;
  readonly date?: string;
}

export interface AddDecisionOutput {
  readonly decision: Decision;
  readonly filePath: string;
  readonly changesSummary: string;
}

export interface AddConstraintInput {
  readonly constraint: string;
  readonly section?: string;
}

export interface AddConstraintOutput {
  readonly filePath: string;
  readonly changesSummary: string;
}

export interface AddQuestionInput {
  readonly text: string;
  readonly category?: "to-resolve" | "to-keep-open";
  readonly options?: string[];
  readonly impact?: string;
  readonly priority?: "high" | "medium" | "low";
}

export interface AddQuestionOutput {
  readonly question: Question;
  readonly filePath: string;
  readonly changesSummary: string;
}

export interface ResolveQuestionInput {
  readonly text: string;
  readonly decision?: string;
  readonly section?: string;
}

export interface ResolveQuestionOutput {
  readonly resolved: boolean;
  readonly filePath: string;
  readonly changesSummary: string;
}

export interface CaptureExternalSessionInput {
  readonly toolName: string;
  readonly date?: string;
  readonly summary: string;
  readonly breadcrumb?: string;
  readonly decisions?: AddDecisionInput[];
}

export interface CaptureExternalSessionOutput {
  readonly filePath: string;
  readonly changesSummary: string;
  readonly capturedDecisions: number;
}

export interface UpdateSectionInput {
  readonly section: string;
  readonly content: string;
  readonly extension?: string;
}

export interface UpdateSectionOutput {
  readonly filePath: string;
  readonly changesSummary: string;
  readonly warnings?: string[];
}

// --- Validation Tools ---

export interface LintInput {
  readonly path?: string;
  readonly verifyIntegrity?: boolean;
}

export interface LintOutput {
  readonly findings: LintFinding[];
  readonly isValid: boolean;
  readonly isWellFormed: boolean;
  readonly filePath: string;
}

export interface CheckConflictsInput {
  readonly scope?: string;
}

export interface CheckConflictsOutput {
  readonly conflicts: ConflictResult[];
  readonly checkedDecisions: number;
}

// --- Ontology Tools ---

export interface SearchOntologyInput {
  readonly query: string;
  readonly packs?: string[];
  readonly maxResults?: number;
}

export interface SearchOntologyOutput {
  readonly results: OntologySearchResult[];
  readonly totalSearched: number;
  readonly suggestionsForAi?: string;
}

export interface GetOntologyEntryInput {
  readonly ontology: string;
  readonly entryId: string;
}

export interface GetOntologyEntryOutput {
  readonly entry: OntologyEntry;
}

export interface BrowseOntologyInput {
  readonly ontology: string;
  readonly category?: string;
  readonly maxResults?: number;
}

export interface BrowseOntologyOutput {
  readonly entries: OntologyEntry[];
  readonly categories?: string[];
  readonly total: number;
}

export interface ListOntologiesInput {
  readonly installed?: boolean;
}

export interface ListOntologiesOutput {
  readonly packs: OntologyPack[];
  readonly total: number;
}

export interface InstallOntologyInput {
  readonly source: string;
  readonly name?: string;
}

export interface InstallOntologyOutput {
  readonly installed: boolean;
  readonly pack: OntologyPack;
}

export interface TagEntryInput {
  readonly ontology: string;
  readonly entryId: string;
  readonly section: string;
  readonly paragraph?: string;
  readonly labelOverride?: string;
}

export interface TagEntryOutput {
  readonly tagged: boolean;
  readonly alreadyTagged?: boolean;
  readonly qualifiedId: string;
  readonly filePath: string;
  readonly changesSummary: string;
}

// --- Tag Management Tools ---

export interface ListTagsInput {
  readonly projectPath?: string;
  readonly extensionFilter?: string;
}

export interface ListTagsOutput {
  readonly tags: Array<{
    ontology: string;
    entryId: string;
    label: string;
    section: string;
    paragraph?: string;
    extensionName?: string;
  }>;
  readonly groupedByExtension: Record<string, unknown[]>;
  readonly total: number;
}

export interface RemoveTagInput {
  readonly ontology: string;
  readonly entryId: string;
  readonly section: string;
  readonly paragraph?: string;
  readonly projectPath?: string;
}

export interface RemoveTagOutput {
  readonly removed: boolean;
  readonly qualifiedId: string;
}

// --- Reference Tools ---

export interface GetEntryReferencesInput {
  readonly ontology: string;
  readonly entryId: string;
  readonly typeFilter?: string;
  readonly extensionFilter?: string;
  readonly maxResults?: number;
}

export interface GetEntryReferencesOutput {
  readonly references: import("./references.js").ReverseReferenceIndexEntry[];
  readonly total: number;
}

export interface SuggestReferencesInput {
  readonly context: string;
  readonly existingReferences?: Array<{ ontology: string; entryId: string }>;
}

export interface SuggestReferencesOutput {
  readonly suggestions: SuggestedReference[];
  readonly hasAiKnowledgeTier: boolean;
  readonly hasWebSearchTier: boolean;
  readonly derivedContext?: Record<string, unknown>;
}

export interface LookupReferenceInput {
  readonly creator?: string;
  readonly title?: string;
  readonly typeFilter?: string;
}

export interface LookupReferenceOutput {
  readonly results: import("./references.js").ReverseReferenceIndexEntry[];
  readonly groupedByType?: Record<
    string,
    import("./references.js").ReverseReferenceIndexEntry[]
  >;
  readonly aiKnowledgeSignal?: boolean;
}

export interface AddReferenceInput {
  readonly section: string;
  readonly creator: string;
  readonly title: string;
  readonly notes?: string;
  readonly ontologyLinks?: Array<{ pack: string; entryId: string }>;
}

export interface AddReferenceOutput {
  readonly filePath: string;
  readonly changesSummary: string;
  readonly duplicateWarning?: string;
}

// --- Type Intelligence Tools ---

export interface GetTypeGuideInput {
  readonly type: string;
}

export type GetTypeGuideOutput = TypeGuideLoadResult;

export interface CreateTypeGuideInput {
  readonly type: string;
  readonly typeAliases?: string[];
  readonly suggestedExtensions?: string[];
  readonly suggestedOntologies?: string[];
  readonly commonParentTypes?: string[];
  readonly commonChildTypes?: string[];
  readonly body: string;
  readonly force?: boolean;
}

export interface CreateTypeGuideOutput {
  readonly created: boolean;
  readonly existingGuide?: boolean;
  readonly filePath: string;
  readonly aliasWarnings?: string[];
}

// --- Extension Tools ---

export interface SuggestExtensionsInput {
  readonly projectType: string;
  readonly description?: string;
  readonly activeExtensions?: string[];
}

export interface SuggestExtensionsOutput {
  readonly suggestions: ExtensionSuggestion[];
  readonly bootstrapSuggestions?: string[];
  readonly ontologyAvailability?: Record<string, string>;
}

export interface AddExtensionInput {
  readonly extensionName: string;
  readonly subsections?: string[];
}

export interface AddExtensionOutput {
  readonly added: boolean;
  readonly alreadyExists?: boolean;
  readonly filePath: string;
  readonly changesSummary: string;
}

export type ListExtensionsInput = Record<string, never>;

export interface ListExtensionsOutput {
  readonly extensions: import("./extensions.js").Extension[];
  readonly customExtensions?: string[];
}

export interface RemoveExtensionInput {
  readonly extensionName: string;
  readonly projectPath?: string;
  readonly removeContent?: boolean;
}

export interface RemoveExtensionOutput {
  readonly removed: boolean;
  readonly sectionsRemoved: string[];
  readonly metadataUpdated: boolean;
  readonly filePath: string;
  readonly warnings: string[];
}

// --- Visibility Tools ---

export interface GetProjectFrameworksInput {
  readonly project?: string;
}

export type GetProjectFrameworksOutput = ProjectFrameworks;

export interface RemoveOntologyInput {
  readonly ontology: string;
  readonly removeTags?: boolean;
}

export interface RemoveOntologyOutput {
  readonly removed: boolean;
  readonly wasInherited: boolean;
  readonly tagsRemoved: number;
  readonly filePath: string;
}

// --- Server / Registry Tools ---

export interface SearchRegistryInput {
  readonly query?: string;
  readonly typeFilter?: "ontology" | "type-guide" | "all";
}

export interface SearchRegistryOutput {
  readonly results: import("./cli.js").RegistrySearchResult[];
  readonly total: number;
}

export type StartTutorialInput = Record<string, never>;
export interface StartTutorialOutput {
  readonly started: boolean;
  readonly guideContent: string;
}

export interface SetTutorialDismissedInput {
  readonly dismissed: boolean;
}
export interface SetTutorialDismissedOutput {
  readonly dismissed: boolean;
}

// ---------------------------------------------------------------------------
// Runtime tool schema registry (OQ-255)
// Exports 38+ runtime keys for type packaging and debug-mode validation.
// ---------------------------------------------------------------------------

export interface ToolFieldSchema {
  readonly [field: string]: "required" | "optional";
}

export interface ToolSchema {
  readonly input: ToolFieldSchema;
  readonly output: ToolFieldSchema;
}

const BASE_OUTPUT: ToolFieldSchema = {
  content: "required",
  isError: "optional",
};

export const brief_list_projects: ToolSchema = {
  input: { workspace: "optional" },
  output: { ...BASE_OUTPUT, projects: "required", warnings: "required" },
};

export const brief_set_active_project: ToolSchema = {
  input: { path: "required" },
  output: {
    ...BASE_OUTPUT,
    projectName: "required",
    filePath: "required",
    confirmed: "required",
  },
};

export const brief_create_project: ToolSchema = {
  input: {
    name: "required",
    type: "required",
    workspace: "optional",
    extensions: "optional",
  },
  output: {
    ...BASE_OUTPUT,
    projectPath: "required",
    filePath: "required",
    created: "required",
  },
};

export const brief_create_sub_project: ToolSchema = {
  input: { name: "required", type: "required", parentPath: "optional" },
  output: {
    ...BASE_OUTPUT,
    projectPath: "required",
    filePath: "required",
    parentPath: "required",
  },
};

export const brief_reenter_project: ToolSchema = {
  input: { path: "optional" },
  output: { ...BASE_OUTPUT, reenterySummary: "required" },
};

export const brief_add_workspace: ToolSchema = {
  input: { path: "required" },
  output: {
    ...BASE_OUTPUT,
    added: "required",
    normalizedPath: "required",
  },
};

export const brief_get_context: ToolSchema = {
  input: {
    scope: "optional",
    includeHistory: "optional",
    sections: "optional",
  },
  output: { ...BASE_OUTPUT, filePath: "required", sections: "required" },
};

export const brief_get_constraints: ToolSchema = {
  input: { scope: "optional" },
  output: {
    ...BASE_OUTPUT,
    constraints: "required",
    filePath: "required",
  },
};

export const brief_get_decisions: ToolSchema = {
  input: { scope: "optional", status: "optional" },
  output: {
    ...BASE_OUTPUT,
    activeDecisions: "required",
    filePath: "required",
  },
};

export const brief_get_questions: ToolSchema = {
  input: { scope: "optional", category: "optional" },
  output: {
    ...BASE_OUTPUT,
    toResolve: "required",
    toKeepOpen: "required",
    filePath: "required",
  },
};

export const brief_add_decision: ToolSchema = {
  input: {
    title: "required",
    why: "optional",
    when: "optional",
    alternativesConsidered: "optional",
    replaces: "optional",
    exceptionTo: "optional",
    date: "optional",
  },
  output: {
    ...BASE_OUTPUT,
    decision: "required",
    filePath: "required",
    changesSummary: "required",
  },
};

export const brief_add_constraint: ToolSchema = {
  input: { constraint: "required", section: "optional" },
  output: {
    ...BASE_OUTPUT,
    filePath: "required",
    changesSummary: "required",
  },
};

export const brief_add_question: ToolSchema = {
  input: {
    text: "required",
    category: "optional",
    options: "optional",
    impact: "optional",
    priority: "optional",
  },
  output: {
    ...BASE_OUTPUT,
    question: "required",
    filePath: "required",
    changesSummary: "required",
  },
};

export const brief_resolve_question: ToolSchema = {
  input: { text: "required", decision: "optional", section: "optional" },
  output: {
    ...BASE_OUTPUT,
    resolved: "required",
    filePath: "required",
    changesSummary: "required",
  },
};

export const brief_capture_external_session: ToolSchema = {
  input: {
    toolName: "required",
    date: "optional",
    summary: "required",
    breadcrumb: "optional",
    decisions: "optional",
  },
  output: {
    ...BASE_OUTPUT,
    filePath: "required",
    changesSummary: "required",
    capturedDecisions: "required",
  },
};

export const brief_update_section: ToolSchema = {
  input: { section: "required", content: "required", extension: "optional" },
  output: {
    ...BASE_OUTPUT,
    filePath: "required",
    changesSummary: "required",
  },
};

export const brief_lint: ToolSchema = {
  input: { path: "optional", verifyIntegrity: "optional" },
  output: {
    ...BASE_OUTPUT,
    findings: "required",
    isValid: "required",
    isWellFormed: "required",
    filePath: "required",
  },
};

export const brief_check_conflicts: ToolSchema = {
  input: { scope: "optional" },
  output: {
    ...BASE_OUTPUT,
    conflicts: "required",
    checkedDecisions: "required",
  },
};

export const brief_search_ontology: ToolSchema = {
  input: {
    query: "required",
    packs: "optional",
    maxResults: "optional",
  },
  output: {
    ...BASE_OUTPUT,
    results: "required",
    totalSearched: "required",
  },
};

export const brief_get_ontology_entry: ToolSchema = {
  input: { ontology: "required", entryId: "required" },
  output: { ...BASE_OUTPUT, entry: "required" },
};

export const brief_browse_ontology: ToolSchema = {
  input: {
    ontology: "required",
    category: "optional",
    maxResults: "optional",
  },
  output: {
    ...BASE_OUTPUT,
    entries: "required",
    total: "required",
  },
};

export const brief_list_ontologies: ToolSchema = {
  input: { installed: "optional" },
  output: { ...BASE_OUTPUT, packs: "required", total: "required" },
};

export const brief_install_ontology: ToolSchema = {
  input: { source: "required", name: "optional" },
  output: { ...BASE_OUTPUT, installed: "required", pack: "required" },
};

export const brief_tag_entry: ToolSchema = {
  input: {
    ontology: "required",
    entryId: "required",
    section: "required",
    paragraph: "optional",
    labelOverride: "optional",
  },
  output: {
    ...BASE_OUTPUT,
    tagged: "required",
    qualifiedId: "required",
    filePath: "required",
    changesSummary: "required",
  },
};

export const brief_list_tags: ToolSchema = {
  input: {
    project_path: "optional",
    extension_filter: "optional",
  },
  output: {
    ...BASE_OUTPUT,
    tags: "required",
    groupedByExtension: "required",
    total: "required",
  },
};

export const brief_remove_tag: ToolSchema = {
  input: {
    ontology: "required",
    entry_id: "required",
    section: "required",
    paragraph: "optional",
    project_path: "optional",
  },
  output: {
    ...BASE_OUTPUT,
    removed: "required",
    qualifiedId: "required",
  },
};

export const brief_get_entry_references: ToolSchema = {
  input: {
    ontology: "required",
    entryId: "required",
    typeFilter: "optional",
    extensionFilter: "optional",
    maxResults: "optional",
  },
  output: { ...BASE_OUTPUT, references: "required", total: "required" },
};

export const brief_suggest_references: ToolSchema = {
  input: { context: "required", existingReferences: "optional" },
  output: {
    ...BASE_OUTPUT,
    suggestions: "required",
    hasAiKnowledgeTier: "required",
    hasWebSearchTier: "required",
  },
};

export const brief_lookup_reference: ToolSchema = {
  input: {
    creator: "optional",
    title: "optional",
    typeFilter: "optional",
  },
  output: { ...BASE_OUTPUT, results: "required" },
};

export const brief_add_reference: ToolSchema = {
  input: {
    section: "required",
    creator: "optional",
    title: "required",
    notes: "optional",
    ontologyLinks: "optional",
  },
  output: {
    ...BASE_OUTPUT,
    filePath: "required",
    changesSummary: "required",
  },
};

export const brief_get_type_guide: ToolSchema = {
  input: { type: "required" },
  output: { ...BASE_OUTPUT, guide: "required" },
};

export const brief_create_type_guide: ToolSchema = {
  input: {
    type: "required",
    typeAliases: "optional",
    suggestedExtensions: "optional",
    suggestedOntologies: "optional",
    commonParentTypes: "optional",
    commonChildTypes: "optional",
    body: "required",
    force: "optional",
  },
  output: {
    ...BASE_OUTPUT,
    created: "required",
    filePath: "required",
  },
};

export const brief_suggest_extensions: ToolSchema = {
  input: {
    projectType: "required",
    description: "optional",
    activeExtensions: "optional",
  },
  output: { ...BASE_OUTPUT, suggestions: "required" },
};

export const brief_add_extension: ToolSchema = {
  input: { extensionName: "required", subsections: "optional" },
  output: {
    ...BASE_OUTPUT,
    added: "required",
    filePath: "required",
    changesSummary: "required",
  },
};

export const brief_list_extensions: ToolSchema = {
  input: {},
  output: { ...BASE_OUTPUT, extensions: "required" },
};

export const brief_remove_extension: ToolSchema = {
  input: {
    extension_name: "required",
    project_path: "optional",
    remove_content: "optional",
  },
  output: {
    ...BASE_OUTPUT,
    removed: "required",
    sectionsRemoved: "required",
    metadataUpdated: "required",
    filePath: "required",
    warnings: "required",
  },
};

export const brief_get_project_frameworks: ToolSchema = {
  input: { project: "optional" },
  output: { ...BASE_OUTPUT, frameworks: "required" },
};

export const brief_remove_ontology: ToolSchema = {
  input: { ontology: "required", removeTags: "optional" },
  output: {
    ...BASE_OUTPUT,
    removed: "required",
    wasInherited: "required",
    tagsRemoved: "required",
    filePath: "required",
  },
};

export const brief_search_registry: ToolSchema = {
  input: { query: "optional", typeFilter: "optional" },
  output: { ...BASE_OUTPUT, results: "required", total: "required" },
};

export const brief_start_tutorial: ToolSchema = {
  input: {},
  output: {
    ...BASE_OUTPUT,
    started: "required",
    guideContent: "required",
  },
};

export const brief_set_tutorial_dismissed: ToolSchema = {
  input: { dismissed: "required" },
  output: { ...BASE_OUTPUT, dismissed: "required" },
};

// --- WP1: Create parent project ---

export interface CreateParentProjectInput {
  readonly childPath: string;
  readonly parentDirectory: string;
  readonly projectName: string;
  readonly displayName?: string;
  readonly type: string;
  readonly whatThisIs?: string;
  readonly whatThisIsNot?: string;
  readonly whyThisExists?: string;
}

export interface CreateParentProjectOutput {
  readonly success: boolean;
  readonly parentPath: string;
  readonly briefMdPath: string;
  readonly childLinked: boolean;
  readonly content: string;
  readonly warnings: string[];
}

export const brief_create_parent_project: ToolSchema = {
  input: {
    child_path: "required",
    parent_directory: "required",
    name: "required",
    type: "required",
    what_this_is: "optional",
    what_this_is_not: "optional",
    why_this_exists: "optional",
  },
  output: {
    ...BASE_OUTPUT,
    success: "required",
    parentPath: "required",
    briefMdPath: "required",
    childLinked: "required",
  },
};

// --- WP2: Suggest type guides ---

export interface SuggestTypeGuidesInput {
  readonly query: string;
  readonly description?: string;
  readonly earlyDecisions?: string;
  readonly maxResults?: number;
}

export interface SuggestTypeGuidesOutput {
  readonly candidates: Array<{
    type: string;
    displayName: string;
    source: string;
    matchType: string;
    relevanceScore: number;
    summary: string;
    suggestedExtensions?: Array<{ slug: string; description: string }>;
    suggestedOntologies?: Array<{ name: string; description: string }>;
  }>;
  readonly hasExactMatch: boolean;
  readonly signal: string;
}

export const brief_suggest_type_guides: ToolSchema = {
  input: {
    query: "required",
    description: "optional",
    early_decisions: "optional",
    max_results: "optional",
  },
  output: {
    ...BASE_OUTPUT,
    candidates: "required",
    hasExactMatch: "required",
    signal: "required",
  },
};

// --- WP4: Apply type guide ---

export interface ApplyTypeGuideInput {
  readonly type: string;
  readonly projectPath?: string;
  readonly autoInstallExtensions?: boolean;
  readonly autoInstallOntologies?: boolean;
}

export interface ApplyTypeGuideOutput {
  readonly applied: boolean;
  readonly guideName: string;
  readonly guideSource: string;
  readonly extensionsInstalled: string[];
  readonly extensionsFailed: string[];
  readonly ontologiesSuggested: Array<{ name: string; status: string }>;
  readonly warnings: string[];
  readonly nextSteps: string[];
}

export const brief_apply_type_guide: ToolSchema = {
  input: {
    type: "required",
    project_path: "optional",
    auto_install_extensions: "optional",
    auto_install_ontologies: "optional",
  },
  output: {
    ...BASE_OUTPUT,
    applied: "required",
    guideName: "required",
    extensionsInstalled: "required",
  },
};

// --- WP5: Discover ontologies ---

export interface DiscoverOntologiesInput {
  readonly query: string;
  readonly extensionContext?: string;
  readonly projectType?: string;
  readonly maxResults?: number;
  readonly sources?: Array<"local" | "huggingface">;
}

export interface DiscoverOntologiesOutput {
  readonly localResults: Array<{
    name: string;
    entryCount: number;
    relevanceScore: number;
    description?: string;
  }>;
  readonly externalResults: Array<{
    source: string;
    datasetId: string;
    description: string;
    tags: string[];
    downloads: number;
    relevanceScore: number;
  }>;
  readonly signal: string;
}

export const brief_discover_ontologies: ToolSchema = {
  input: {
    query: "required",
    extension_context: "optional",
    project_type: "optional",
    max_results: "optional",
    sources: "optional",
  },
  output: {
    ...BASE_OUTPUT,
    localResults: "required",
    externalResults: "required",
    signal: "required",
  },
};

// --- WP5: Create ontology ---

export interface CreateOntologyInput {
  readonly name: string;
  readonly description: string;
  readonly extensionContext?: string;
  readonly projectType?: string;
  readonly domainKeywords?: string[];
  readonly entryCount?: number;
}

export interface CreateOntologyOutput {
  readonly created: boolean;
  readonly packName: string;
  readonly entryCount: number;
  readonly trustLevel: string;
  readonly validated: boolean;
  readonly installed: boolean;
  readonly warnings: string[];
  readonly signal?: string;
}

export const brief_create_ontology: ToolSchema = {
  input: {
    name: "required",
    description: "required",
    extension_context: "optional",
    project_type: "optional",
    domain_keywords: "optional",
    entry_count: "optional",
  },
  output: {
    ...BASE_OUTPUT,
    created: "required",
    packName: "required",
    entryCount: "required",
    installed: "required",
  },
};

// --- WP6: Get maturity signals ---

export interface GetMaturitySignalsInput {
  readonly projectPath: string;
}

export interface GetMaturitySignalsOutput {
  readonly maturityLevel: string;
  readonly decisionCount: number;
  readonly minimalFormatCount: number;
  readonly fullFormatCount: number;
  readonly upgradeableDecisions: Array<{
    title: string;
    missingFields: string[];
  }>;
  readonly openQuestionCount: number;
  readonly signals: string[];
  readonly nextSteps: string[];
}

export const brief_get_maturity_signals: ToolSchema = {
  input: { project_path: "required" },
  output: {
    ...BASE_OUTPUT,
    maturityLevel: "required",
    decisionCount: "required",
    signals: "required",
    nextSteps: "required",
  },
};

// --- WP3: Hierarchy Tools ---

export interface WhereAmIInput {
  readonly projectPath: string;
  readonly workspaceRoots?: string[];
}

export interface WhereAmIOutput {
  readonly currentProject: { name: string; type: string; path: string };
  readonly depth: number;
  readonly parent?: { name: string; type: string; path: string };
  readonly siblings: Array<{ name: string; type: string; path: string }>;
  readonly children: Array<{ name: string; type: string; path: string }>;
  readonly signal: string;
}

export const brief_where_am_i: ToolSchema = {
  input: { project_path: "required", workspace_roots: "optional" },
  output: {
    ...BASE_OUTPUT,
    currentProject: "required",
    depth: "required",
    siblings: "required",
    children: "required",
    signal: "required",
  },
};

export interface HierarchyTreeInput {
  readonly rootPath: string;
  readonly depthLimit?: number;
  readonly includeHealthCheck?: boolean;
}

export interface HierarchyTreeOutput {
  readonly tree: unknown;
  readonly ascii: string;
  readonly totalProjects: number;
  readonly maxDepth: number;
  readonly healthIssues?: Array<{ path: string; issue: string }>;
}

export const brief_hierarchy_tree: ToolSchema = {
  input: {
    root_path: "required",
    depth_limit: "optional",
    include_health_check: "optional",
  },
  output: {
    ...BASE_OUTPUT,
    tree: "required",
    ascii: "required",
    totalProjects: "required",
    maxDepth: "required",
  },
};

// WP4/GAP-C: Dataset preview & fetch
export interface PreviewDatasetInput {
  readonly source: string;
  readonly maxRows?: number;
}

export interface PreviewDatasetOutput {
  readonly columns: string[];
  readonly sampleRows: Array<Record<string, unknown>>;
  readonly totalRows?: number;
  readonly format: string;
  readonly signal: string;
}

export const brief_preview_dataset: ToolSchema = {
  input: {
    source: "required",
    max_rows: "optional",
  },
  output: {
    ...BASE_OUTPUT,
    columns: "required",
    sampleRows: "required",
    format: "required",
    signal: "required",
  },
};

export interface FetchDatasetInput {
  readonly source: string;
  readonly name: string;
  readonly idColumn: string;
  readonly labelColumn: string;
  readonly descriptionColumn?: string;
  readonly keywordsColumn?: string;
  readonly maxEntries?: number;
}

export interface FetchDatasetOutput {
  readonly created: boolean;
  readonly packName: string;
  readonly entryCount: number;
  readonly droppedRows: number;
  readonly fitEvaluation?: { score: number; reasoning: string };
  readonly warnings: string[];
}

export const brief_fetch_dataset: ToolSchema = {
  input: {
    source: "required",
    name: "required",
    id_column: "required",
    label_column: "required",
    description_column: "optional",
    keywords_column: "optional",
    max_entries: "optional",
  },
  output: {
    ...BASE_OUTPUT,
    created: "required",
    packName: "required",
    entryCount: "required",
    droppedRows: "required",
    warnings: "required",
  },
};

// WP5/GAP-D: Interactive ontology builder
export interface OntologyDraftInput {
  readonly action: string;
  readonly name?: string;
  readonly description?: string;
  readonly domainKeywords?: string[];
  readonly draftId?: string;
  readonly entries?: Array<{ id: string; label: string; description?: string }>;
  readonly entryIds?: string[];
  readonly column?: { name: string };
  readonly entryId?: string;
  readonly fields?: Record<string, unknown>;
}

export interface OntologyDraftOutput {
  readonly draftId: string;
  readonly draft: Record<string, unknown>;
  readonly signal: string;
  readonly installed?: boolean;
  readonly packName?: string;
}

export const brief_ontology_draft: ToolSchema = {
  input: {
    action: "required",
    name: "optional",
    description: "optional",
    domain_keywords: "optional",
    draft_id: "optional",
    entries: "optional",
    entry_ids: "optional",
    column: "optional",
    entry_id: "optional",
    fields: "optional",
  },
  output: {
    ...BASE_OUTPUT,
    draftId: "required",
    draft: "required",
    signal: "required",
  },
};

// Aggregate of all tool schemas for iteration and packaging
export const toolSchemas: Readonly<Record<string, ToolSchema>> = {
  brief_list_projects,
  brief_set_active_project,
  brief_create_project,
  brief_create_sub_project,
  brief_reenter_project,
  brief_add_workspace,
  brief_get_context,
  brief_get_constraints,
  brief_get_decisions,
  brief_get_questions,
  brief_add_decision,
  brief_add_constraint,
  brief_add_question,
  brief_resolve_question,
  brief_capture_external_session,
  brief_update_section,
  brief_lint,
  brief_check_conflicts,
  brief_search_ontology,
  brief_get_ontology_entry,
  brief_browse_ontology,
  brief_list_ontologies,
  brief_install_ontology,
  brief_tag_entry,
  brief_list_tags,
  brief_remove_tag,
  brief_get_entry_references,
  brief_suggest_references,
  brief_lookup_reference,
  brief_add_reference,
  brief_get_type_guide,
  brief_create_type_guide,
  brief_suggest_extensions,
  brief_add_extension,
  brief_list_extensions,
  brief_remove_extension,
  brief_get_project_frameworks,
  brief_remove_ontology,
  brief_search_registry,
  brief_start_tutorial,
  brief_set_tutorial_dismissed,
  brief_create_parent_project,
  brief_suggest_type_guides,
  brief_apply_type_guide,
  brief_discover_ontologies,
  brief_create_ontology,
  brief_get_maturity_signals,
  brief_where_am_i,
  brief_hierarchy_tree,
  brief_preview_dataset,
  brief_fetch_dataset,
  brief_ontology_draft,
};
