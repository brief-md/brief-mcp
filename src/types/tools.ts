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

// Aggregate of all 38 tool schemas for iteration and packaging
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
  brief_get_entry_references,
  brief_suggest_references,
  brief_lookup_reference,
  brief_add_reference,
  brief_get_type_guide,
  brief_create_type_guide,
  brief_suggest_extensions,
  brief_add_extension,
  brief_list_extensions,
  brief_get_project_frameworks,
  brief_remove_ontology,
  brief_search_registry,
  brief_start_tutorial,
  brief_set_tutorial_dismissed,
};
