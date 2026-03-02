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
  readonly creator?: string;
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
