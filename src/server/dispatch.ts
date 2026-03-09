// src/server/dispatch.ts — Tool dispatch layer (composition root)
// Maps MCP tool names to their implementation functions.
// Cross-module imports are intentional: this is the server's composition root.

import type { Server } from "@modelcontextprotocol/sdk/server/index.js"; // check-rules-ignore
import { searchRegistry } from "../cli/registry-tools.js"; // check-rules-ignore
import {
  getConstraints,
  getContext,
  getDecisions,
  getQuestions,
} from "../context/read.js"; // check-rules-ignore
import { addDecision } from "../context/write-decisions.js"; // check-rules-ignore
import {
  handleAddConstraint,
  handleAddQuestion,
  handleResolveQuestion,
} from "../context/write-questions.js"; // check-rules-ignore
import {
  handleCaptureExternalSession,
  handleUpdateSection,
} from "../context/write-sections.js"; // check-rules-ignore
import { addExtension, listExtensions } from "../extension/creation.js"; // check-rules-ignore
import { suggestExtensions } from "../extension/suggestion.js"; // check-rules-ignore
import { browseOntology, getOntologyEntry } from "../ontology/browse.js"; // check-rules-ignore
import { installOntology, listOntologies } from "../ontology/management.js"; // check-rules-ignore
import { searchOntology } from "../ontology/search.js"; // check-rules-ignore
import { tagEntry } from "../ontology/tagging.js"; // check-rules-ignore
import { lookupReference } from "../reference/lookup.js"; // check-rules-ignore
import {
  getEntryReferences,
  suggestReferences,
} from "../reference/suggestion.js"; // check-rules-ignore
import { addReference } from "../reference/writing.js"; // check-rules-ignore
import { extractConflictPatterns } from "../type-intelligence/conflict-patterns.js"; // check-rules-ignore
import { createTypeGuide } from "../type-intelligence/creation.js"; // check-rules-ignore
import { getTypeGuide } from "../type-intelligence/loading.js"; // check-rules-ignore
import type { CheckConflictsParams } from "../validation/conflicts.js"; // check-rules-ignore
import { lintBrief } from "../validation/lint.js"; // check-rules-ignore
import {
  checkConflictsWithSemantic,
  type SamplingFn,
} from "../validation/semantic-conflicts.js"; // check-rules-ignore
import {
  getProjectFrameworks,
  removeOntology,
} from "../visibility/frameworks.js"; // check-rules-ignore
import {
  addWorkspace,
  getActiveProject,
  setActiveProject,
} from "../workspace/active.js"; // check-rules-ignore
import { createProject, createSubProject } from "../workspace/creation.js"; // check-rules-ignore
import { listProjects } from "../workspace/listing.js"; // check-rules-ignore
import {
  generateReentrySummary,
  setTutorialDismissed,
  startTutorial,
} from "../workspace/reentry.js"; // check-rules-ignore

// ---------------------------------------------------------------------------
// Server reference for sampling access
// ---------------------------------------------------------------------------

let _server: Server | undefined;

export function setServer(server: Server): void {
  _server = server;
}

type Args = Record<string, unknown>;

type ToolHandler = (args: Args) => Promise<unknown> | unknown;

/** Cast args to a typed param object. Safe because MCP param validation runs first. */
function typed<T>(args: Args): T {
  return args as unknown as T;
}

/** Inject active project path when project_path is not explicitly provided. */
function withProjectPath(args: Args): Args {
  if (!args.project_path && !args.projectPath) {
    const active = getActiveProject();
    if (active?.path) {
      return { ...args, project_path: active.path };
    }
  }
  return args;
}

/** Remap MCP snake_case param names to function camelCase param names. */
function remap(args: Args, mapping: Record<string, string>): Args {
  const result: Args = { ...args };
  for (const [from, to] of Object.entries(mapping)) {
    if (from in result && !(to in result)) {
      result[to] = result[from];
      delete result[from];
    }
  }
  return result;
}

/**
 * Dispatch map: MCP tool name → handler function.
 *
 * Most handlers accept a typed params object; we pass `args` (Record<string, unknown>)
 * directly since the MCP layer already validates required params.
 *
 * Special cases:
 * - lintBrief: takes (content: string, options?) — wrapped inline
 * - checkConflicts: synchronous — works as-is since ToolHandler allows sync returns
 */
export const TOOL_HANDLERS: Record<string, ToolHandler> = {
  // Workspace
  brief_list_projects: (args) => listProjects(args),
  brief_set_active_project: (args) =>
    setActiveProject(
      typed<Parameters<typeof setActiveProject>[0]>(
        remap(args, { path: "identifier", workspace_roots: "workspaceRoots" }),
      ),
    ),
  brief_create_project: (args) =>
    createProject(
      typed<Parameters<typeof createProject>[0]>(
        remap(args, { name: "projectName", workspace: "workspaceRoot" }), // check-rules-ignore
      ),
    ),
  brief_create_sub_project: (args) =>
    createSubProject(
      typed<Parameters<typeof createSubProject>[0]>(
        remap(args, { parent_path: "parentPath" }),
      ),
    ),
  brief_reenter_project: (args) =>
    generateReentrySummary(
      typed<Parameters<typeof generateReentrySummary>[0]>(
        remap(args, { path: "projectPath" }),
      ),
    ),
  brief_start_tutorial: () => startTutorial(),
  brief_set_tutorial_dismissed: (args) =>
    setTutorialDismissed(
      typed<Parameters<typeof setTutorialDismissed>[0]>(args),
    ),
  brief_add_workspace: (args) =>
    addWorkspace(typed<Parameters<typeof addWorkspace>[0]>(args)),

  // Context read
  brief_get_context: (args) =>
    getContext(
      typed<Parameters<typeof getContext>[0]>(
        remap(withProjectPath(args), { project_path: "projectPath" }),
      ),
    ),
  brief_get_constraints: (args) =>
    getConstraints(
      typed<Parameters<typeof getConstraints>[0]>(
        remap(withProjectPath(args), { project_path: "projectPath" }),
      ),
    ),
  brief_get_decisions: (args) =>
    getDecisions(
      typed<Parameters<typeof getDecisions>[0]>(
        remap(withProjectPath(args), { project_path: "projectPath" }),
      ),
    ),
  brief_get_questions: (args) =>
    getQuestions(
      typed<Parameters<typeof getQuestions>[0]>(
        remap(withProjectPath(args), { project_path: "projectPath" }),
      ),
    ),

  // Context write
  brief_add_decision: (args) =>
    addDecision(remap(withProjectPath(args), { project_path: "projectPath" })),
  brief_add_constraint: (args) =>
    handleAddConstraint(
      typed<Parameters<typeof handleAddConstraint>[0]>(
        remap(withProjectPath(args), { project_path: "projectPath" }),
      ),
    ),
  brief_add_question: (args) =>
    handleAddQuestion(
      typed<Parameters<typeof handleAddQuestion>[0]>(
        remap(withProjectPath(args), { project_path: "projectPath" }),
      ),
    ),
  brief_resolve_question: (args) =>
    handleResolveQuestion(
      typed<Parameters<typeof handleResolveQuestion>[0]>(
        remap(withProjectPath(args), { project_path: "projectPath" }),
      ),
    ),
  brief_capture_external_session: (args) =>
    handleCaptureExternalSession(
      typed<Parameters<typeof handleCaptureExternalSession>[0]>(
        remap(withProjectPath(args), { project_path: "projectPath" }),
      ),
    ),
  brief_update_section: (args) =>
    handleUpdateSection(
      typed<Parameters<typeof handleUpdateSection>[0]>(
        remap(withProjectPath(args), { project_path: "projectPath" }),
      ),
    ),

  // Validation
  brief_lint: (args) => lintBrief(String(args.content ?? "")),
  brief_check_conflicts: async (args) => {
    const server = _server;
    const samplingFn: SamplingFn | undefined = server
      ? (params) =>
          server.createMessage(
            params as Parameters<typeof server.createMessage>[0],
          )
      : undefined;
    const isSamplingAvailable = server
      ? () => !!server.getClientCapabilities()?.sampling
      : undefined;

    // Resolve domain conflict patterns from type guide (best-effort)
    let domainPairs: ReadonlyArray<readonly [string, string]> | undefined;
    let tensionProse: string | undefined;
    if (args.project_type) {
      try {
        const result = await getTypeGuide({ type: String(args.project_type) });
        if (result.guide && !result.isGeneric) {
          const patterns = extractConflictPatterns(result.guide);
          domainPairs = patterns.pairs.length > 0 ? patterns.pairs : undefined;
          tensionProse = patterns.tensionProse;
        }
      } catch {
        /* type guide lookup is best-effort */
      }
    }

    return checkConflictsWithSemantic(
      {
        ...typed<CheckConflictsParams>(args),
        domainPatterns: domainPairs,
        semantic: !!args.semantic,
      },
      samplingFn,
      isSamplingAvailable,
      tensionProse ? { tensionProse } : undefined,
    );
  },

  // Ontology
  brief_search_ontology: (args) =>
    searchOntology(
      typed<Parameters<typeof searchOntology>[0]>(
        remap(args, { max_results: "maxResults" }),
      ),
    ),
  brief_get_ontology_entry: (args) =>
    getOntologyEntry(
      typed<Parameters<typeof getOntologyEntry>[0]>(
        remap(args, { entry_id: "entryId", detail_level: "detailLevel" }),
      ),
    ),
  brief_browse_ontology: (args) =>
    browseOntology(
      typed<Parameters<typeof browseOntology>[0]>(
        remap(args, { entry_id: "entryId", detail_level: "detailLevel" }),
      ),
    ),
  brief_list_ontologies: (args) => listOntologies(args),
  brief_install_ontology: (args) =>
    installOntology(typed<Parameters<typeof installOntology>[0]>(args)),
  brief_tag_entry: (args) =>
    tagEntry(
      typed<Parameters<typeof tagEntry>[0]>(
        remap(args, { entry_id: "entryId", label_override: "labelOverride" }),
      ),
    ),

  // Reference
  brief_get_entry_references: (args) =>
    getEntryReferences(
      typed<Parameters<typeof getEntryReferences>[0]>(
        remap(args, {
          entry_id: "entryId",
          type_filter: "typeFilter",
          extension_filter: "extensionFilter",
          max_results: "maxResults",
        }),
      ),
    ),
  brief_suggest_references: (args) =>
    suggestReferences({
      context: {
        section: String(args.context ?? ""),
        activeExtensions: Array.isArray(args.active_extensions)
          ? (args.active_extensions as string[])
          : [],
      },
      existingReferences: args.existing_references as
        | Array<{ ontology: string; entryId: string }>
        | undefined,
    }),
  brief_lookup_reference: (args) =>
    lookupReference(typed<Parameters<typeof lookupReference>[0]>(args)),
  brief_add_reference: (args) =>
    addReference(typed<Parameters<typeof addReference>[0]>(args)),

  // Type intelligence
  brief_get_type_guide: (args) => getTypeGuide(args),
  brief_create_type_guide: (args) => createTypeGuide(args),

  // Extension
  brief_suggest_extensions: (args) =>
    suggestExtensions(
      typed<Parameters<typeof suggestExtensions>[0]>(
        remap(args, {
          project_type: "projectType",
          active_extensions: "activeExtensions",
        }),
      ),
    ),
  brief_add_extension: (args) =>
    addExtension(
      typed<Parameters<typeof addExtension>[0]>(
        remap(withProjectPath(args), {
          extension_name: "extensionName", // check-rules-ignore
          project_path: "projectPath",
        }),
      ),
    ),
  brief_list_extensions: (args) => listExtensions(args),

  // Visibility
  brief_get_project_frameworks: (args) =>
    getProjectFrameworks(
      typed<Parameters<typeof getProjectFrameworks>[0]>(
        remap(args, { project_path: "projectPath" }),
      ),
    ),
  brief_remove_ontology: (args) =>
    removeOntology(
      typed<Parameters<typeof removeOntology>[0]>(
        remap(args, { remove_tags: "removeTags" }),
      ),
    ),

  // Registry
  brief_search_registry: (args) =>
    searchRegistry(typed<Parameters<typeof searchRegistry>[0]>(args)),
};
