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
import { designExtension } from "../extension/design.js"; // check-rules-ignore
import { removeExtension } from "../extension/removal.js"; // check-rules-ignore
import { suggestExtensions } from "../extension/suggestion.js"; // check-rules-ignore
import { getHierarchyPosition } from "../hierarchy/position.js"; // check-rules-ignore
import { buildHierarchyTree } from "../hierarchy/tree.js"; // check-rules-ignore
import {
  linkSectionDataset,
  parseSectionDatasets,
  readBrief,
} from "../io/project-state.js"; // check-rules-ignore
import {
  browseOntology,
  getOntologyEntry,
  listOntologyColumns,
} from "../ontology/browse.js"; // check-rules-ignore
import { convertToStructured } from "../ontology/conversion.js"; // check-rules-ignore
import { createOntology } from "../ontology/creation.js"; // check-rules-ignore
import { fetchAndConvert, previewDataset } from "../ontology/dataset.js"; // check-rules-ignore
import { discoverOntologies } from "../ontology/discovery.js"; // check-rules-ignore
import { ontologyDraft } from "../ontology/draft.js"; // check-rules-ignore
import { installOntology, listOntologies } from "../ontology/management.js"; // check-rules-ignore
import { searchOntology } from "../ontology/search.js"; // check-rules-ignore
import { listTags, removeTag, tagEntry } from "../ontology/tagging.js"; // check-rules-ignore
import { discoverReferences } from "../reference/discovery.js"; // check-rules-ignore
import { lookupReference } from "../reference/lookup.js"; // check-rules-ignore
import {
  getEntryReferences,
  suggestReferences,
} from "../reference/suggestion.js"; // check-rules-ignore
import { addReference } from "../reference/writing.js"; // check-rules-ignore
import { applyTypeGuide } from "../type-intelligence/apply.js"; // check-rules-ignore
import { extractConflictPatterns } from "../type-intelligence/conflict-patterns.js"; // check-rules-ignore
import { createTypeGuide } from "../type-intelligence/creation.js"; // check-rules-ignore
import { getTypeGuide } from "../type-intelligence/loading.js"; // check-rules-ignore
import { suggestTypeGuides } from "../type-intelligence/search.js"; // check-rules-ignore
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
  markSessionStarted,
  setActiveProject,
} from "../workspace/active.js"; // check-rules-ignore
import { createProject, createSubProject } from "../workspace/creation.js"; // check-rules-ignore
import { listProjects } from "../workspace/listing.js"; // check-rules-ignore
import { getMaturitySignals } from "../workspace/maturity.js"; // check-rules-ignore
import { createParentProject } from "../workspace/parent-creation.js"; // check-rules-ignore
import {
  generateReentrySummary,
  setTutorialDismissed,
  startTutorial,
} from "../workspace/reentry.js"; // check-rules-ignore
import { buildGuideContent } from "./guide.js"; // check-rules-ignore

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
    return { ...args, _noActiveProject: true };
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
  brief_create_project: async (args) => {
    const result = await createProject(
      typed<Parameters<typeof createProject>[0]>(
        remap(args, { name: "projectName", workspace: "workspaceRoot" }), // check-rules-ignore
      ),
    );
    // Set the newly created project as active so subsequent tool calls
    // (e.g. brief_update_section) target the correct path
    const projectPath = (result as Record<string, unknown>).path as
      | string
      | undefined;
    if (projectPath) {
      await setActiveProject({
        identifier: projectPath,
        workspaceRoots: [],
      });
      markSessionStarted();
    }
    // Surface nextSteps as a prominent directive block so the LLM doesn't skip them
    const steps = (result as Record<string, unknown>).nextSteps as
      | string[]
      | undefined;
    if (steps && steps.length > 0) {
      (result as Record<string, unknown>).__REQUIRED_NEXT_STEPS__ =
        `STOP and follow these steps IN ORDER before doing anything else:\n${steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}`;
    }
    // Embed the interaction guide so the AI sees all patterns and rules
    (result as Record<string, unknown>).__GUIDE__ = buildGuideContent();
    return result;
  },
  brief_create_sub_project: (args) =>
    createSubProject(
      typed<Parameters<typeof createSubProject>[0]>(
        remap(args, { parent_path: "parentPath" }),
      ),
    ),
  brief_reenter_project: async (args) => {
    const result = await generateReentrySummary(
      typed<Parameters<typeof generateReentrySummary>[0]>(
        remap(args, { path: "projectPath" }),
      ),
    );
    // Surface nextSteps as a prominent directive block (same as brief_create_project)
    const steps = (result as Record<string, unknown>).nextSteps as
      | string[]
      | undefined;
    if (steps && steps.length > 0) {
      (result as Record<string, unknown>).__REQUIRED_NEXT_STEPS__ =
        `STOP and follow these steps IN ORDER before doing anything else:\n${steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}`;
    }
    // Embed the interaction guide so the AI sees all patterns and rules
    (result as Record<string, unknown>).__GUIDE__ = buildGuideContent();
    return result;
  },
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
        remap(withProjectPath(args), {
          project_path: "projectPath",
          constraint: "text",
        }), // check-rules-ignore
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
    installOntology(
      typed<Parameters<typeof installOntology>[0]>(
        remap(args, { source: "url" }),
      ),
    ),
  brief_tag_entry: async (args) => {
    const remapped = remap(withProjectPath(args), {
      entry_id: "entryId",
      label_override: "labelOverride",
      project_path: "projectPath",
    });
    // Auto-detect structured section: check for section-dataset marker with columns
    const pp = (remapped as Record<string, unknown>).projectPath as
      | string
      | undefined;
    if (pp) {
      try {
        const content = await readBrief(pp);
        const datasets = parseSectionDatasets(content);
        const section = (remapped as Record<string, unknown>).section as string;
        const match = datasets.find((d) => d.section === section);
        if (match?.columns) {
          (remapped as Record<string, unknown>).structuredColumns =
            match.columns;
        }
      } catch {
        /* best-effort */
      }
    }
    return tagEntry(typed<Parameters<typeof tagEntry>[0]>(remapped));
  },
  brief_list_tags: (args) =>
    listTags(
      typed<Parameters<typeof listTags>[0]>(
        remap(withProjectPath(args), {
          project_path: "projectPath",
          extension_filter: "extensionFilter",
        }),
      ),
    ),
  brief_remove_tag: (args) =>
    removeTag(
      typed<Parameters<typeof removeTag>[0]>(
        remap(withProjectPath(args), {
          entry_id: "entryId",
          project_path: "projectPath",
        }),
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
  brief_discover_references: (args) =>
    discoverReferences(
      typed<Parameters<typeof discoverReferences>[0]>(
        remap(args, {
          extension_name: "extensionName", // check-rules-ignore
          extension_description: "extensionDescription",
          entry_labels: "entryLabels",
          entry_descriptions: "entryDescriptions",
          entry_tags: "entryTags",
          project_type: "projectType",
          existing_references: "existingReferences",
          max_results: "maxResults",
        }),
      ),
    ),

  // Type intelligence
  brief_get_type_guide: (args) => getTypeGuide(args),
  brief_create_type_guide: (args) =>
    createTypeGuide(
      remap(args, {
        type_aliases: "typeAliases", // check-rules-ignore
        suggested_extensions: "suggestedExtensions",
        suggested_ontologies: "suggestedOntologies",
        common_parent_types: "commonParentTypes",
        common_child_types: "commonChildTypes",
        reference_sources: "referenceSources",
      }),
    ),

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
  brief_design_extension: (args) =>
    designExtension(
      typed<Parameters<typeof designExtension>[0]>(
        remap(args, {
          extension_name: "extensionName", // check-rules-ignore
          project_type: "projectType",
        }),
      ),
    ),
  brief_add_extension: (args) =>
    addExtension(
      typed<Parameters<typeof addExtension>[0]>(
        remap(withProjectPath(args), {
          extension_name: "extensionName", // check-rules-ignore
          section_modes: "sectionModes",
          project_path: "projectPath",
        }),
      ),
    ),
  brief_list_extensions: (args) => listExtensions(args),
  brief_remove_extension: (args) =>
    removeExtension(
      typed<Parameters<typeof removeExtension>[0]>(
        remap(withProjectPath(args), {
          extension_name: "extensionName", // check-rules-ignore
          project_path: "projectPath",
          remove_content: "removeContent",
        }),
      ),
    ),

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

  // Structured sections
  brief_list_ontology_columns: (args) =>
    listOntologyColumns(typed<Parameters<typeof listOntologyColumns>[0]>(args)),
  brief_link_section_dataset: async (args) => {
    const a = remap(withProjectPath(args), {
      project_path: "projectPath",
    }) as Record<string, unknown>;
    const projectPath = a.projectPath as string;
    const section = a.section as string;
    const ontology = a.ontology as string;
    const columns = a.columns as string[];
    await linkSectionDataset(projectPath, section, ontology, columns);
    return { linked: true, section, ontology, columns };
  },
  brief_convert_to_structured: async (args) => {
    const a = remap(withProjectPath(args), {
      project_path: "projectPath",
      match_threshold: "matchThreshold",
    }) as Record<string, unknown>;
    return convertToStructured({
      projectPath: a.projectPath as string,
      section: a.section as string,
      ontology: a.ontology as string,
      columns: a.columns as string[],
      matchThreshold: a.matchThreshold as number | undefined,
    });
  },

  // Registry
  brief_search_registry: (args) =>
    searchRegistry(typed<Parameters<typeof searchRegistry>[0]>(args)),

  // WP1: Create parent project
  brief_create_parent_project: (args) =>
    createParentProject(
      typed<Parameters<typeof createParentProject>[0]>(
        remap(args, {
          child_path: "childPath",
          parent_directory: "parentDirectory",
          name: "projectName", // check-rules-ignore
          display_name: "displayName", // check-rules-ignore
          what_this_is: "whatThisIs",
          what_this_is_not: "whatThisIsNot",
          why_this_exists: "whyThisExists",
        }),
      ),
    ),

  // WP2: Suggest type guides
  brief_suggest_type_guides: (args) =>
    suggestTypeGuides(
      typed<Parameters<typeof suggestTypeGuides>[0]>(
        remap(args, {
          early_decisions: "earlyDecisions",
          max_results: "maxResults",
        }),
      ),
    ),

  // WP4: Apply type guide
  brief_apply_type_guide: (args) =>
    applyTypeGuide(
      typed<Parameters<typeof applyTypeGuide>[0]>(
        remap(withProjectPath(args), {
          project_path: "projectPath",
          auto_install_extensions: "autoInstallExtensions",
          auto_install_ontologies: "autoInstallOntologies",
        }),
      ),
    ),

  // WP5: Discover ontologies
  brief_discover_ontologies: (args) =>
    discoverOntologies(
      typed<Parameters<typeof discoverOntologies>[0]>(
        remap(args, {
          extension_context: "extensionContext",
          project_type: "projectType",
          max_results: "maxResults",
        }),
      ),
    ),

  // WP5: Create ontology (needs sampling access)
  brief_create_ontology: async (args) => {
    const server = _server;
    const samplingFn: SamplingFn | undefined = server
      ? (params) =>
          server.createMessage(
            params as Parameters<typeof server.createMessage>[0],
          )
      : undefined;
    return createOntology(
      typed<Parameters<typeof createOntology>[0]>(
        remap(args, {
          extension_context: "extensionContext",
          project_type: "projectType",
          domain_keywords: "domainKeywords",
          entry_count: "entryCount",
        }),
      ),
      samplingFn,
    );
  },

  // WP6: Get maturity signals
  brief_get_maturity_signals: (args) =>
    getMaturitySignals(
      typed<Parameters<typeof getMaturitySignals>[0]>(
        remap(withProjectPath(args), { project_path: "projectPath" }),
      ),
    ),

  // WP3/GAP-B+H: Hierarchy awareness
  brief_where_am_i: (args) =>
    getHierarchyPosition(
      typed<Parameters<typeof getHierarchyPosition>[0]>(
        remap(withProjectPath(args), {
          project_path: "projectPath",
          workspace_roots: "workspaceRoots",
        }),
      ),
    ),
  brief_hierarchy_tree: (args) =>
    buildHierarchyTree(
      typed<Parameters<typeof buildHierarchyTree>[0]>(
        remap(withProjectPath(args), {
          root_path: "rootPath",
          depth_limit: "depthLimit",
          include_health_check: "includeHealthCheck",
        }),
      ),
    ),

  // WP4/GAP-C: Dataset preview & fetch
  brief_preview_dataset: (args) =>
    previewDataset(
      typed<Parameters<typeof previewDataset>[0]>(
        remap(args, {
          max_rows: "maxRows",
        }),
      ),
    ),
  brief_fetch_dataset: async (args) => {
    const server = _server;
    const samplingFn: SamplingFn | undefined = server
      ? (params) =>
          server.createMessage(
            params as Parameters<typeof server.createMessage>[0],
          )
      : undefined;
    return fetchAndConvert(
      typed<Parameters<typeof fetchAndConvert>[0]>(
        remap(args, {
          id_column: "idColumn",
          label_column: "labelColumn",
          description_column: "descriptionColumn",
          keywords_column: "keywordsColumn",
          max_entries: "maxEntries",
        }),
      ),
      samplingFn,
    );
  },

  // WP5/GAP-D: Interactive ontology builder
  brief_ontology_draft: async (args) => {
    const server = _server;
    const samplingFn: SamplingFn | undefined = server
      ? (params) =>
          server.createMessage(
            params as Parameters<typeof server.createMessage>[0],
          )
      : undefined;
    return ontologyDraft(
      typed<Parameters<typeof ontologyDraft>[0]>(
        remap(args, {
          domain_keywords: "domainKeywords",
          initial_entry_count: "initialEntryCount",
          draft_id: "draftId",
          entry_ids: "entryIds",
          entry_id: "entryId",
        }),
      ),
      samplingFn,
    );
  },
};
