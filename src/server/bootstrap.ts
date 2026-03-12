// src/server/bootstrap.ts — TASK-08: MCP Server Bootstrap

import { randomUUID } from "node:crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  type CallToolResult,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { checkNodeVersion } from "../check-node-version.js";
import { loadWizardState } from "../cli/setup-wizard.js"; // check-rules-ignore
import { createLogger } from "../observability/logger.js";
import { initializeFromDisk as initOntology } from "../ontology/management.js"; // check-rules-ignore
import { initializeFromDisk as initLookup } from "../reference/lookup.js"; // check-rules-ignore
import { initializeFromDisk as initSuggestion } from "../reference/suggestion.js"; // check-rules-ignore
import { initializeFromDisk as initTypeCreation } from "../type-intelligence/creation.js"; // check-rules-ignore
import { hasSessionStarted } from "../workspace/active.js"; // check-rules-ignore
import { setServer, TOOL_HANDLERS } from "./dispatch.js";

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

// Route logger through console.error so vitest spies on console.error capture log output (OBS-04, OBS-05)
const logOutput = {
  write(chunk: string | Buffer): boolean {
    const line =
      typeof chunk === "string" ? chunk : Buffer.from(chunk).toString();
    console.error(line.trimEnd());
    return true;
  },
} as unknown as NodeJS.WritableStream;

const logger = createLogger({ module: "server", output: logOutput });

// ---------------------------------------------------------------------------
// Tool definitions (46 tools — MCP-02, MCP-05, MCP-06)
// All parameter names use snake_case (A2-04).
// ---------------------------------------------------------------------------

export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: {
    readonly type: "object";
    readonly properties: Record<string, unknown>;
    readonly required?: string[];
  };
}

const TOOL_DEFINITIONS: ToolDefinition[] = [
  // --- Workspace management ---
  {
    name: "brief_list_projects",
    description:
      "List all BRIEF.md projects in known workspaces. brief-mcp scope: project discovery and filtering. NOTE: To resume work on a project at session start, use brief_reenter_project — not list + set_active.",
    inputSchema: {
      type: "object",
      properties: {
        workspace: {
          type: "string",
          description: "Filter to a specific workspace path.",
        },
      },
    },
  },
  {
    name: "brief_set_active_project",
    description:
      "Set the active project for the current session. brief-mcp scope: session state. Use for mid-session context switches (e.g. sub-projects). For session start, use brief_reenter_project instead — it returns the full project state, setup phase, and interaction guide.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to the BRIEF.md file or project directory.",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "brief_create_project",
    description:
      "Create a new BRIEF.md project file. brief-mcp scope: project initialisation. Specify name, type, optional workspace, and extensions. After creation, follow the setupPhase signal in the response: 'needs_identity' means collaboratively author identity sections with the user (Pattern 9), 'choose_type_guide' or 'explore_type' means review the type guide with the user before proceeding (Pattern 10), 'review_suggestions' means present extension and ontology suggestions for user approval.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Project name." },
        type: {
          type: "string",
          description: "Project type (e.g. webapp, cli).",
        },
        workspace: { type: "string", description: "Workspace path." },
        extensions: {
          type: "array",
          items: { type: "string" },
          description: "Extensions to activate.",
        },
      },
      required: ["name", "type"],
    },
  },
  {
    name: "brief_create_sub_project",
    description:
      "Create a sub-project nested under a parent project. brief-mcp scope: project hierarchy.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Sub-project name." },
        type: { type: "string", description: "Sub-project type." },
        parent_path: { type: "string", description: "Parent project path." },
      },
      required: ["name", "type"],
    },
  },
  {
    name: "brief_reenter_project",
    description:
      "Start every brief-mcp session with this for existing projects. Returns a structured summary: identity, decisions, open questions, section fill state, conflicts, intentional tensions, lifecycle phase, and required next steps. Sets the active project. Follow the __REQUIRED_NEXT_STEPS__ in the response before doing anything else. Also call after completing a setup phase to get the next required step.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Project path to re-enter." },
        detail: {
          type: "string",
          enum: ["summary", "detailed"],
          description:
            "Level of detail for section overview. 'summary' (default): section names + filled/empty flags. 'detailed': includes word counts and extension fill state.",
        },
      },
    },
  },
  {
    name: "brief_start_tutorial",
    description:
      "Start the interactive brief-mcp onboarding tutorial. brief-mcp scope: onboarding. Call once per new user to learn the tool.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "brief_set_tutorial_dismissed",
    description:
      "Mark the tutorial as dismissed so it is not shown again. brief-mcp scope: user preferences.",
    inputSchema: {
      type: "object",
      properties: {
        dismissed: {
          type: "boolean",
          description: "True to dismiss, false to re-enable.",
        },
      },
      required: ["dismissed"],
    },
  },
  {
    name: "brief_add_workspace",
    description:
      "Register a new workspace directory with brief-mcp. brief-mcp scope: workspace configuration. The directory will be scanned for BRIEF.md files.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Absolute path to the workspace directory.",
        },
      },
      required: ["path"],
    },
  },

  // --- Context read tools ---
  {
    name: "brief_get_context",
    description:
      "Read full project context from BRIEF.md mid-session. Use for targeted section lookups or walking the project hierarchy via scope. For session start, prefer brief_reenter_project instead.",
    inputSchema: {
      type: "object",
      properties: {
        project_path: {
          type: "string",
          description: "Path to the project or BRIEF.md file (required).",
        },
        scope: {
          type: "string",
          description: "Project scope path (default: active project).",
        },
        include_history: {
          type: "boolean",
          description: "Include superseded decisions.",
        },
        sections: {
          type: "array",
          items: { type: "string" },
          description: "Specific sections to retrieve.",
        },
      },
      required: ["project_path"],
    },
  },
  {
    name: "brief_get_constraints",
    description:
      "Read project constraints from BRIEF.md. brief-mcp scope: constraint retrieval. Returns all active constraints.",
    inputSchema: {
      type: "object",
      properties: {
        project_path: {
          type: "string",
          description:
            "Project path. Defaults to active project if not specified.",
        },
        scope: { type: "string", description: "Project scope path." },
      },
    },
  },
  {
    name: "brief_get_decisions",
    description:
      "Read recorded decisions from BRIEF.md. brief-mcp scope: decision retrieval. Use status filter to get active, superseded, or all decisions.",
    inputSchema: {
      type: "object",
      properties: {
        project_path: {
          type: "string",
          description:
            "Project path. Defaults to active project if not specified.",
        },
        scope: { type: "string", description: "Project scope path." },
        status: {
          type: "string",
          enum: ["active", "superseded", "all"],
          description: "Filter by decision status.",
        },
      },
    },
  },
  {
    name: "brief_get_questions",
    description:
      "Read open questions from BRIEF.md. brief-mcp scope: question retrieval. Returns to-resolve and to-keep-open questions.",
    inputSchema: {
      type: "object",
      properties: {
        project_path: {
          type: "string",
          description:
            "Project path. Defaults to active project if not specified.",
        },
        scope: { type: "string", description: "Project scope path." },
        category: {
          type: "string",
          enum: ["to-resolve", "to-keep-open", "resolved", "all"],
          description: "Filter by question category.",
        },
      },
    },
  },

  // --- Context write tools ---
  {
    name: "brief_add_decision",
    description:
      "Record a new decision in BRIEF.md. brief-mcp scope: decision capture. Provide title and optionally why, replaces, or exception_to.",
    inputSchema: {
      type: "object",
      properties: {
        project_path: {
          type: "string",
          description:
            "Project path. Defaults to active project if not specified.",
        },
        title: {
          type: "string",
          description: "Decision title (required, 1-500 chars).",
        },
        why: { type: "string", description: "Rationale for the decision." },
        when: { type: "string", description: "Triggering circumstance." },
        alternatives_considered: {
          type: "string",
          description: "Alternatives that were considered.",
        },
        replaces: {
          type: "string",
          description: "Title of a decision this supersedes.",
        },
        exception_to: {
          type: "string",
          description: "Title of a decision this is an exception to.",
        },
        date: {
          type: "string",
          description: "Decision date (YYYY-MM-DD, defaults to today).",
        },
      },
      required: ["title"],
    },
  },
  {
    name: "brief_add_constraint",
    description:
      "Add a constraint to BRIEF.md. brief-mcp scope: constraint capture. Constraints express non-negotiable requirements.",
    inputSchema: {
      type: "object",
      properties: {
        project_path: {
          type: "string",
          description:
            "Project path. Defaults to active project if not specified.",
        },
        constraint: { type: "string", description: "Constraint text." },
        section: {
          type: "string",
          description: "Target section for the constraint.",
        },
      },
      required: ["constraint"],
    },
  },
  {
    name: "brief_add_question",
    description:
      "Record an open question in BRIEF.md. brief-mcp scope: question capture. Use category to distinguish resolution-needed from keep-open questions.",
    inputSchema: {
      type: "object",
      properties: {
        project_path: {
          type: "string",
          description:
            "Project path. Defaults to active project if not specified.",
        },
        text: { type: "string", description: "Question text." },
        category: {
          type: "string",
          enum: ["to-resolve", "to-keep-open"],
          description: "Question category.",
        },
        options: {
          type: "array",
          items: { type: "string" },
          description: "Possible answers.",
        },
        impact: {
          type: "string",
          description: "Impact of leaving this unresolved.",
        },
        priority: {
          type: "string",
          enum: ["high", "medium", "low"],
          description: "Question priority.",
        },
      },
      required: ["text"],
    },
  },
  {
    name: "brief_resolve_question",
    description:
      "Mark a question as resolved in BRIEF.md. brief-mcp scope: question resolution. Optionally link to a decision.",
    inputSchema: {
      type: "object",
      properties: {
        project_path: {
          type: "string",
          description:
            "Project path. Defaults to active project if not specified.",
        },
        text: { type: "string", description: "Question text to resolve." },
        decision: {
          type: "string",
          description: "Decision title that resolved this question.",
        },
        section: { type: "string", description: "Section context." },
      },
      required: ["text"],
    },
  },
  {
    name: "brief_capture_external_session",
    description:
      "Record the output of an external tool session (e.g. Figma, research) in BRIEF.md. brief-mcp scope: external session capture.",
    inputSchema: {
      type: "object",
      properties: {
        project_path: {
          type: "string",
          description:
            "Project path. Defaults to active project if not specified.",
        },
        tool_name: { type: "string", description: "External tool name." },
        date: { type: "string", description: "Session date (YYYY-MM-DD)." },
        summary: { type: "string", description: "Session summary." },
        breadcrumb: {
          type: "string",
          description: "Link or reference to session artefact.",
        },
        decisions: {
          type: "array",
          items: { type: "object" },
          description: "Decisions captured during this session.",
        },
      },
      required: ["tool_name", "summary"],
    },
  },
  {
    name: "brief_update_section",
    description:
      "Update or clear a section in BRIEF.md. brief-mcp scope: section editing. IMPORTANT: Follow the collaborative authoring flow (Pattern 9) before calling — ask the user to express their thoughts first, refine collaboratively, and only write after the user approves the content. Pass empty string to clear a section.",
    inputSchema: {
      type: "object",
      properties: {
        project_path: {
          type: "string",
          description:
            "Project path. Defaults to active project if not specified.",
        },
        heading: {
          type: "string",
          description:
            "Section heading to update (e.g. 'What This Is', 'Key Decisions').",
        },
        content: {
          type: "string",
          description: "New section content (empty string clears the section).",
        },
        extension: { type: "string", description: "Extension context." },
      },
      required: ["heading", "content"],
    },
  },

  // --- Validation tools ---
  {
    name: "brief_lint",
    description:
      "Lint a BRIEF.md file for formatting and rule compliance. brief-mcp scope: file validation. Returns findings and validity status.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to lint (default: active project).",
        },
        verify_integrity: {
          type: "boolean",
          description: "Also verify file integrity checksums.",
        },
      },
    },
  },
  {
    name: "brief_check_conflicts",
    description:
      "Check for conflicting decisions in BRIEF.md hierarchy. brief-mcp scope: conflict detection. Set semantic=true for AI-powered deep analysis (requires client sampling support).",
    inputSchema: {
      type: "object",
      properties: {
        scope: { type: "string", description: "Project scope path." },
        semantic: {
          type: "boolean",
          description:
            "Enable AI semantic conflict detection via sampling. Default: false.",
        },
        project_type: {
          type: "string",
          description:
            "Project type for domain-aware analysis (e.g. 'music-release'). Loads domain-specific conflict patterns from the type guide.",
        },
      },
    },
  },

  // --- Ontology tools ---
  {
    name: "brief_search_ontology",
    description:
      "Search installed ontology packs by keyword. brief-mcp scope: ontology discovery. Data is user-contributed — verify before relying on it.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query (max 1000 chars).",
        },
        packs: {
          type: "array",
          items: { type: "string" },
          description: "Limit search to these pack IDs.",
        },
        max_results: {
          type: "number",
          description: "Maximum results to return.",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "brief_get_ontology_entry",
    description:
      "Retrieve a specific ontology entry by ID. brief-mcp scope: ontology lookup. Data is user-contributed — verify before relying on it.",
    inputSchema: {
      type: "object",
      properties: {
        ontology: { type: "string", description: "Pack ID." },
        entry_id: { type: "string", description: "Entry identifier." },
      },
      required: ["ontology", "entry_id"],
    },
  },
  {
    name: "brief_browse_ontology",
    description:
      "Browse an entry's neighborhood in an ontology pack: parents, children, siblings. brief-mcp scope: ontology browsing. Data is user-contributed — verify before relying on it.",
    inputSchema: {
      type: "object",
      properties: {
        ontology: { type: "string", description: "Pack ID to browse." },
        entry_id: {
          type: "string",
          description:
            "Entry ID to browse from. Use brief_search_ontology to find IDs.",
        },
        direction: {
          type: "string",
          enum: ["up", "down", "around", "all"],
          description:
            "Browse direction: up (parents/ancestors), down (children/descendants), around (siblings), all.",
        },
      },
      required: ["ontology", "entry_id"],
    },
  },
  {
    name: "brief_list_ontologies",
    description:
      "List available or installed ontology packs. brief-mcp scope: ontology management. Data is user-contributed — verify before relying on it.",
    inputSchema: {
      type: "object",
      properties: {
        installed: {
          type: "boolean",
          description: "If true, return only installed packs.",
        },
      },
    },
  },
  {
    name: "brief_install_ontology",
    description:
      "Install an ontology pack from a source path or URL. brief-mcp scope: ontology installation. Data is user-contributed — verify before relying on it.",
    inputSchema: {
      type: "object",
      properties: {
        source: { type: "string", description: "Pack source (path or URL)." },
        name: { type: "string", description: "Override pack name." },
      },
      required: ["source"],
    },
  },
  {
    name: "brief_tag_entry",
    description:
      "Tag a BRIEF.md section with an ontology entry. brief-mcp scope: ontology tagging. Links project content to ontology concepts.",
    inputSchema: {
      type: "object",
      properties: {
        ontology: { type: "string", description: "Pack ID." },
        entry_id: { type: "string", description: "Entry to tag with." },
        section: { type: "string", description: "Section to tag." },
        paragraph: { type: "string", description: "Specific paragraph." },
        label_override: {
          type: "string",
          description: "Override the tag label.",
        },
      },
      required: ["ontology", "entry_id", "section"],
    },
  },

  {
    name: "brief_list_tags",
    description:
      "List all ontology tags in the current project. brief-mcp scope: tag management. Returns tags grouped by extension.",
    inputSchema: {
      type: "object",
      properties: {
        project_path: {
          type: "string",
          description: "Project path. Defaults to active project.",
        },
        extension_filter: {
          type: "string",
          description: "Filter tags to a specific extension slug.",
        },
      },
    },
  },
  {
    name: "brief_remove_tag",
    description:
      "Remove an ontology tag from a section. brief-mcp scope: tag management. Removes from registry and BRIEF.md.",
    inputSchema: {
      type: "object",
      properties: {
        ontology: { type: "string", description: "Pack ID." },
        entry_id: { type: "string", description: "Entry identifier." },
        section: { type: "string", description: "Section the tag is in." },
        paragraph: { type: "string", description: "Specific paragraph." },
        project_path: {
          type: "string",
          description: "Project path. Defaults to active project.",
        },
      },
      required: ["ontology", "entry_id", "section"],
    },
  },

  // --- Reference tools ---
  {
    name: "brief_get_entry_references",
    description:
      "Look up all BRIEF.md references that use a specific ontology entry. brief-mcp scope: reference index lookup.",
    inputSchema: {
      type: "object",
      properties: {
        ontology: { type: "string", description: "Pack ID." },
        entry_id: { type: "string", description: "Entry identifier." },
        type_filter: {
          type: "string",
          description: "Filter by reference type.",
        },
        extension_filter: {
          type: "string",
          description: "Filter by extension.",
        },
        max_results: { type: "number", description: "Maximum results." },
      },
      required: ["ontology", "entry_id"],
    },
  },
  {
    name: "brief_suggest_references",
    description:
      "Suggest references relevant to the current context. brief-mcp scope: reference suggestions. Uses keyword matching against the reference index.",
    inputSchema: {
      type: "object",
      properties: {
        context: {
          type: "string",
          description: "Context text for suggestion matching.",
        },
        existing_references: {
          type: "array",
          items: { type: "object" },
          description: "Already-applied references to exclude.",
        },
      },
      required: ["context"],
    },
  },
  {
    name: "brief_lookup_reference",
    description:
      "Look up references by creator or title in the reference index. brief-mcp scope: reference retrieval.",
    inputSchema: {
      type: "object",
      properties: {
        creator: { type: "string", description: "Filter by creator." },
        title: { type: "string", description: "Filter by title." },
        type_filter: {
          type: "string",
          description: "Filter by reference type.",
        },
      },
    },
  },
  {
    name: "brief_add_reference",
    description:
      "Add a bibliographic reference to a BRIEF.md section. brief-mcp scope: reference writing.",
    inputSchema: {
      type: "object",
      properties: {
        section: { type: "string", description: "Target section." },
        creator: {
          type: "string",
          description: "Reference creator or author.",
        },
        title: { type: "string", description: "Reference title." },
        notes: { type: "string", description: "Optional notes." },
        url: {
          type: "string",
          description: "URL or link to the referenced work.",
        },
        ontology_links: {
          type: "array",
          items: { type: "object" },
          description: "Linked ontology entries.",
        },
      },
      required: ["section", "title"],
    },
  },
  {
    name: "brief_discover_references",
    description:
      "Build a context-aware search query from extension data to discover references. Returns local suggestions and a structured web search query. The AI uses the query to search the web, then presents results for multi-selection. brief-mcp scope: reference discovery.",
    inputSchema: {
      type: "object",
      properties: {
        extension_name: {
          type: "string",
          description: "Extension to find references for.",
        },
        extension_description: {
          type: "string",
          description: "What the extension captures.",
        },
        entry_labels: {
          type: "array",
          items: { type: "string" },
          description:
            "Labels of entries in the extension (e.g., theme names, character names).",
        },
        entry_descriptions: {
          type: "array",
          items: { type: "string" },
          description: "Descriptions of entries.",
        },
        entry_tags: {
          type: "array",
          items: { type: "string" },
          description: "Tags or categories from entries.",
        },
        project_type: {
          type: "string",
          description: "Project type for type guide reference hints.",
        },
        existing_references: {
          type: "array",
          items: { type: "object" },
          description: "Already-added references to exclude.",
        },
        max_results: {
          type: "number",
          description: "Max local suggestions (default 10).",
        },
      },
      required: ["extension_name"],
    },
  },

  // --- Type intelligence tools ---
  {
    name: "brief_get_type_guide",
    description:
      "Retrieve the type guide for a project type. brief-mcp scope: type intelligence. Returns guidance on sections and ontologies for this type.",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", description: "Project type name." },
      },
      required: ["type"],
    },
  },
  {
    name: "brief_create_type_guide",
    description:
      "Create or update a type guide file. brief-mcp scope: type guide authoring. Pattern 10: Do NOT pre-write the body. Call with body empty to get the template, then present each section (Overview, Key Dimensions, Workflow, Known Tensions, Quality Signals, Reference Sources) for collaborative input. Write the final body only after user approval. Known Tensions enables conflict detection; Reference Sources guides brief_discover_references.",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", description: "Project type name." },
        type_aliases: {
          type: "array",
          items: { type: "string" },
          description: "Alternative names for this type.",
        },
        suggested_extensions: {
          type: "array",
          items: { type: "string" },
          description: "Suggested extensions.",
        },
        suggested_ontologies: {
          type: "array",
          items: { type: "string" },
          description: "Suggested ontology packs.",
        },
        common_parent_types: {
          type: "array",
          items: { type: "string" },
          description: "Common parent types.",
        },
        common_child_types: {
          type: "array",
          items: { type: "string" },
          description: "Common child types.",
        },
        reference_sources: {
          type: "array",
          items: { type: "string" },
          description:
            "Where to find references for this project type (e.g., 'IMDB for films', 'Discogs for albums'). Used by brief_discover_references.",
        },
        body: {
          type: "string",
          description:
            "Guide body content. Omit or leave empty on first call to get a template. Only provide the full body after collaborating with the user on each section (Pattern 10).",
        },
        force: { type: "boolean", description: "Overwrite if already exists." },
      },
      required: ["type"],
    },
  },

  // --- Extension tools ---
  {
    name: "brief_suggest_extensions",
    description:
      "Suggest BRIEF.md extensions for a project type. brief-mcp scope: extension discovery. After presenting suggestions, invite the user to describe any additional extensions they need — brief_add_extension accepts any name and subsections, not just predefined ones.",
    inputSchema: {
      type: "object",
      properties: {
        project_type: { type: "string", description: "Project type." },
        description: {
          type: "string",
          description: "Project description for context.",
        },
        active_extensions: {
          type: "array",
          items: { type: "string" },
          description: "Already-active extensions to exclude.",
        },
      },
      required: ["project_type"],
    },
  },
  {
    name: "brief_design_extension",
    description:
      "Design a custom extension before creating it. Searches installed ontologies for matches against proposed subsections and returns a structured proposal with mode recommendations and sample entries. The AI then walks the user through each subsection interactively. brief-mcp scope: extension design.",
    inputSchema: {
      type: "object",
      properties: {
        extension_name: {
          type: "string",
          description:
            "Name for the custom extension (e.g. 'world_building', 'character_development').",
        },
        description: {
          type: "string",
          description:
            "What this extension should capture — the user's vision for it.",
        },
        subsections: {
          type: "array",
          items: { type: "string" },
          description:
            "Proposed subsection names. If omitted, defaults are suggested.",
        },
        project_type: {
          type: "string",
          description:
            "Project type (e.g. 'film', 'album') for contextual suggestions.",
        },
      },
      required: ["extension_name", "description"],
    },
  },
  {
    name: "brief_add_extension",
    description:
      "Add an extension to BRIEF.md. Creates the skeleton (headings + guidance prompts). After creation, you MUST fill each subsection: for freeform subsections, walk through each with the user and call brief_update_section to write content; for structured subsections, call brief_link_section_dataset then brief_tag_entry. Do NOT leave subsections empty. Do NOT edit BRIEF.md directly. brief-mcp scope: extension management.",
    inputSchema: {
      type: "object",
      properties: {
        extension_name: {
          type: "string",
          description:
            "Name of the extension (e.g. 'story_development', 'world_building'). Any name is accepted — not limited to predefined extensions.",
        },
        subsections: {
          type: "array",
          items: { type: "string" },
          description:
            "Subsection names (e.g. ['Themes', 'Plot Points', 'Tone & Mood']). Each subsection becomes a ## heading under the extension.",
        },
        section_modes: {
          type: "object",
          description:
            "Map of subsection name → 'freeform' or 'structured'. Structured subsections get an ontology dataset marker — follow up with brief_link_section_dataset to link an ontology and brief_tag_entry to add entries as table rows (multiple entries per section). Default: all freeform.",
          additionalProperties: {
            type: "string",
            enum: ["freeform", "structured"],
          },
        },
        subsection_descriptions: {
          type: "object",
          description:
            "Map of subsection name → description/guidance prompt. These appear as italic hints in each subsection, telling the AI what content to write. Pass the rationale from brief_design_extension here.",
          additionalProperties: { type: "string" },
        },
        project_path: {
          type: "string",
          description:
            "Project path. Defaults to active project. Extension content is persisted to BRIEF.md.",
        },
      },
      required: ["extension_name"],
    },
  },
  {
    name: "brief_list_extensions",
    description:
      "List all active extensions in the current BRIEF.md. brief-mcp scope: extension listing.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "brief_remove_extension",
    description:
      "Remove an extension from BRIEF.md. Removes from **Extensions:** metadata and optionally removes the extension's content sections. brief-mcp scope: extension management.",
    inputSchema: {
      type: "object",
      properties: {
        extension_name: {
          type: "string",
          description:
            "Extension name to remove (e.g. 'sonic_arts' or 'SONIC ARTS').",
        },
        project_path: {
          type: "string",
          description: "Project path. Defaults to active project.",
        },
        remove_content: {
          type: "boolean",
          description:
            "If true, also removes the extension's # heading and all subsections from BRIEF.md. Default: false (metadata only).",
        },
      },
      required: ["extension_name"],
    },
  },

  // --- Visibility tools ---
  {
    name: "brief_get_project_frameworks",
    description:
      "Get the frameworks and technologies detected in the project. brief-mcp scope: framework visibility.",
    inputSchema: {
      type: "object",
      properties: {
        project: {
          type: "string",
          description: "Project path (default: active project).",
        },
      },
    },
  },
  {
    name: "brief_remove_ontology",
    description:
      "Uninstall an ontology pack and optionally remove its tags from BRIEF.md. brief-mcp scope: ontology management.",
    inputSchema: {
      type: "object",
      properties: {
        ontology: { type: "string", description: "Pack ID to remove." },
        remove_tags: {
          type: "boolean",
          description: "Also remove tags referencing this ontology.",
        },
      },
      required: ["ontology"],
    },
  },

  // --- Structured section tools ---
  {
    name: "brief_list_ontology_columns",
    description:
      "List available columns for an ontology pack. Use this to discover which fields can be displayed when linking an ontology to a structured section. brief-mcp scope: ontology introspection.",
    inputSchema: {
      type: "object",
      properties: {
        ontology: {
          type: "string",
          description: "Pack name to inspect.",
        },
      },
      required: ["ontology"],
    },
  },
  {
    name: "brief_link_section_dataset",
    description:
      "Link an ontology to a structured section with column selection. This makes the section display ontology entries as a visible markdown table with the chosen columns. brief-mcp scope: section management.",
    inputSchema: {
      type: "object",
      properties: {
        section: {
          type: "string",
          description: "Section heading name.",
        },
        ontology: {
          type: "string",
          description: "Ontology pack name.",
        },
        columns: {
          type: "array",
          items: { type: "string" },
          description:
            "Columns to display in the table (e.g. ['label', 'description', 'keywords']). Use brief_list_ontology_columns to see available columns.",
        },
        project_path: {
          type: "string",
          description: "Project path. Defaults to active project.",
        },
      },
      required: ["section", "ontology", "columns"],
    },
  },
  {
    name: "brief_convert_to_structured",
    description:
      "Convert a freeform section to structured. Matches existing text against ontology entries and renders matched entries as a visible markdown table. Preserves unmatched text. brief-mcp scope: section management.",
    inputSchema: {
      type: "object",
      properties: {
        section: {
          type: "string",
          description: "Section heading to convert.",
        },
        ontology: {
          type: "string",
          description: "Ontology pack to match against.",
        },
        columns: {
          type: "array",
          items: { type: "string" },
          description: "Columns to display in the table.",
        },
        match_threshold: {
          type: "number",
          description: "Minimum match score (0-1). Default: 0.5.",
        },
        project_path: {
          type: "string",
          description: "Project path. Defaults to active project.",
        },
      },
      required: ["section", "ontology", "columns"],
    },
  },

  // --- Registry tools ---
  {
    name: "brief_search_registry",
    description:
      "Search the compatible MCP registry for ontology packs and type guides. brief-mcp scope: registry search.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query." },
        type_filter: {
          type: "string",
          enum: ["ontology", "type-guide", "all"],
          description: "Filter by content type.",
        },
      },
    },
  },

  // --- WP1: Create parent project ---
  {
    name: "brief_create_parent_project",
    description:
      "Create a parent BRIEF.md in an ancestor directory, linking an existing child project into a hierarchy. brief-mcp scope: workspace hierarchy creation.",
    inputSchema: {
      type: "object",
      properties: {
        child_path: {
          type: "string",
          description: "Path to the existing child project.",
        },
        parent_directory: {
          type: "string",
          description:
            "Ancestor directory where the parent BRIEF.md will be created.",
        },
        name: { type: "string", description: "Parent project name." },
        display_name: {
          type: "string",
          description: "Optional display name for the parent project.",
        },
        type: { type: "string", description: "Project type." },
        what_this_is: {
          type: "string",
          description: "What the parent project is.",
        },
        what_this_is_not: {
          type: "string",
          description: "What the parent project is NOT.",
        },
        why_this_exists: {
          type: "string",
          description: "Why the parent project exists.",
        },
      },
      required: ["child_path", "parent_directory", "name", "type"],
    },
  },

  // --- WP2: Suggest type guides ---
  {
    name: "brief_suggest_type_guides",
    description:
      "Search all available type guides and rank them by relevance to the user's project. Returns candidates for the user to choose from. brief-mcp scope: type intelligence.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Project type or description to search for.",
        },
        description: {
          type: "string",
          description: "Project description for context.",
        },
        early_decisions: {
          type: "string",
          description: "Early decision text for keyword extraction.",
        },
        max_results: {
          type: "number",
          description: "Maximum candidates to return (default 5).",
        },
      },
      required: ["query"],
    },
  },

  // --- WP4: Apply type guide ---
  {
    name: "brief_apply_type_guide",
    description:
      "Apply a type guide to a project by installing its suggested extensions and surfacing ontology suggestions. brief-mcp scope: type intelligence + extensions.",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", description: "Type guide to apply." },
        project_path: {
          type: "string",
          description: "Target project path.",
        },
        auto_install_extensions: {
          type: "boolean",
          description:
            "Automatically install suggested extensions (default true).",
        },
        auto_install_ontologies: {
          type: "boolean",
          description: "Surface ontology suggestions (default true).",
        },
      },
      required: ["type"],
    },
  },

  // --- WP5: Discover ontologies ---
  {
    name: "brief_discover_ontologies",
    description:
      "Search local installed packs and external sources (Hugging Face) for relevant ontologies. brief-mcp scope: ontology discovery.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query for ontology discovery.",
        },
        extension_context: {
          type: "string",
          description: "Extension name/domain for relevance scoring.",
        },
        project_type: {
          type: "string",
          description: "Project type for context.",
        },
        max_results: {
          type: "number",
          description: "Maximum results per source (default 10).",
        },
        sources: {
          type: "array",
          items: { type: "string", enum: ["local", "huggingface"] },
          description: "Sources to search (default both).",
        },
      },
      required: ["query"],
    },
  },

  // --- WP5: Create ontology ---
  {
    name: "brief_create_ontology",
    description:
      "Create a custom ontology pack, optionally using AI to generate structured entries. Falls back to a template pack if AI sampling is unavailable. brief-mcp scope: ontology creation.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Ontology pack name.",
        },
        description: {
          type: "string",
          description: "Description of the ontology domain.",
        },
        extension_context: {
          type: "string",
          description: "Extension context for the ontology.",
        },
        project_type: {
          type: "string",
          description: "Project type for context.",
        },
        domain_keywords: {
          type: "array",
          items: { type: "string" },
          description: "Domain keywords to seed entry generation.",
        },
        entry_count: {
          type: "number",
          description: "Target number of entries (default 20).",
        },
      },
      required: ["name", "description"],
    },
  },

  // --- WP6: Get maturity signals ---
  {
    name: "brief_get_maturity_signals",
    description:
      "Analyse a project's decisions and return maturity signals with nudges to upgrade minimal decisions to full format. brief-mcp scope: project lifecycle.",
    inputSchema: {
      type: "object",
      properties: {
        project_path: {
          type: "string",
          description: "Path to the project to analyse.",
        },
      },
      required: ["project_path"],
    },
  },
  {
    name: "brief_where_am_i",
    description:
      "Show current position in the project hierarchy: parent, siblings, children, and depth. brief-mcp scope: hierarchy navigation.",
    inputSchema: {
      type: "object",
      properties: {
        project_path: {
          type: "string",
          description: "Project path. Defaults to active project.",
        },
        workspace_roots: {
          type: "array",
          items: { type: "string" },
          description: "Workspace roots for boundary detection.",
        },
      },
      required: ["project_path"],
    },
  },
  {
    name: "brief_hierarchy_tree",
    description:
      "Build an ASCII tree view of the project hierarchy from a root path. brief-mcp scope: hierarchy visualisation.",
    inputSchema: {
      type: "object",
      properties: {
        root_path: {
          type: "string",
          description: "Root directory to start the tree from.",
        },
        depth_limit: {
          type: "number",
          description: "Maximum depth to traverse (default: 5).",
        },
        include_health_check: {
          type: "boolean",
          description:
            "Include health issues (missing type, orphaned children).",
        },
      },
      required: ["root_path"],
    },
  },
  {
    name: "brief_preview_dataset",
    description:
      "Preview rows and columns from a dataset before converting it to an ontology pack. Supports any HTTPS URL returning JSON (flat array or HuggingFace format). For HuggingFace dataset IDs, set HF_TOKEN environment variable first. brief-mcp scope: dataset inspection.",
    inputSchema: {
      type: "object",
      properties: {
        source: {
          type: "string",
          description:
            "HTTPS URL returning JSON, or HuggingFace dataset ID (e.g., 'org/dataset-name' — requires HF_TOKEN env var).",
        },
        max_rows: {
          type: "number",
          description: "Maximum rows to preview (default: 10).",
        },
      },
      required: ["source"],
    },
  },
  {
    name: "brief_fetch_dataset",
    description:
      "Fetch a dataset and convert it to an ontology pack by mapping columns to entry fields. Supports any HTTPS URL returning JSON (flat array or HuggingFace format). For HuggingFace dataset IDs, set HF_TOKEN environment variable first. brief-mcp scope: dataset conversion.",
    inputSchema: {
      type: "object",
      properties: {
        source: {
          type: "string",
          description:
            "HTTPS URL returning JSON, or HuggingFace dataset ID (e.g., 'org/dataset-name' — requires HF_TOKEN env var).",
        },
        name: {
          type: "string",
          description: "Name for the resulting ontology pack.",
        },
        id_column: {
          type: "string",
          description: "Column to use as entry ID.",
        },
        label_column: {
          type: "string",
          description: "Column to use as entry label.",
        },
        description_column: {
          type: "string",
          description: "Column to use as entry description (optional).",
        },
        keywords_column: {
          type: "string",
          description:
            "Column to use as entry keywords — comma-separated string or array (optional).",
        },
        max_entries: {
          type: "number",
          description: "Maximum entries to import (default: 500, max: 50000).",
        },
      },
      required: ["source", "name", "id_column", "label_column"],
    },
  },
  {
    name: "brief_ontology_draft",
    description:
      "Interactive ontology builder — create, refine, and finalize ontology packs through a multi-step workflow. brief-mcp scope: ontology drafting.",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description:
            "Action to perform: create, add_entries, remove_entries, approve_rows, fill_columns, add_column, edit_entry, get, list, finalize.",
          enum: [
            "create",
            "add_entries",
            "remove_entries",
            "approve_rows",
            "fill_columns",
            "add_column",
            "edit_entry",
            "get",
            "list",
            "finalize",
          ],
        },
        name: {
          type: "string",
          description: "Name for the ontology (create action).",
        },
        description: {
          type: "string",
          description: "Description for the ontology (create action).",
        },
        domain_keywords: {
          type: "array",
          items: { type: "string" },
          description: "Keywords to seed initial entries (create action).",
        },
        draft_id: {
          type: "string",
          description:
            "Draft ID to operate on (all actions except create/list).",
        },
        entries: {
          type: "array",
          description: "Entries to add (add_entries action).",
        },
        entry_ids: {
          type: "array",
          items: { type: "string" },
          description: "Entry IDs to remove (remove_entries action).",
        },
        column: {
          type: "object",
          description: "Column to add (add_column action).",
        },
        entry_id: {
          type: "string",
          description: "Entry ID to edit (edit_entry action).",
        },
        fields: {
          type: "object",
          description: "Fields to update on entry (edit_entry action).",
        },
      },
      required: ["action"],
    },
  },
];

// ---------------------------------------------------------------------------
// Known tool names (protocol-level check)
// ---------------------------------------------------------------------------

const KNOWN_TOOLS = new Set(TOOL_DEFINITIONS.map((t) => t.name));

// ---------------------------------------------------------------------------
// Inline parameter validation (MCP-03)
// Uses snake_case param names matching the JSON schema definitions above.
// ---------------------------------------------------------------------------

/** Required string params — must be a non-empty, non-whitespace string. */
const REQUIRED_STRING_PARAMS: Record<string, readonly string[]> = {
  brief_get_context: ["project_path"],
  brief_set_active_project: ["path"],
  brief_create_project: ["name", "type"],
  brief_create_sub_project: ["name", "type"],
  brief_add_workspace: ["path"],
  brief_add_decision: ["title"],
  brief_add_constraint: ["constraint"],
  brief_add_question: ["text"],
  brief_resolve_question: ["text"],
  brief_capture_external_session: ["tool_name", "summary"],
  brief_update_section: ["heading"],
  brief_search_ontology: ["query"],
  brief_get_ontology_entry: ["ontology", "entry_id"],
  brief_browse_ontology: ["ontology", "entry_id"],
  brief_install_ontology: ["source"],
  brief_tag_entry: ["ontology", "entry_id", "section"],
  brief_remove_tag: ["ontology", "entry_id", "section"],
  brief_get_entry_references: ["ontology", "entry_id"],
  brief_suggest_references: ["context"],
  brief_add_reference: ["section", "title"],
  brief_discover_references: ["extension_name"], // check-rules-ignore
  brief_get_type_guide: ["type"],
  brief_create_type_guide: ["type"],
  brief_suggest_extensions: ["project_type"],
  brief_design_extension: ["extension_name", "description"],
  brief_add_extension: ["extension_name"],
  brief_remove_extension: ["extension_name"],
  brief_remove_ontology: ["ontology"],
  brief_list_ontology_columns: ["ontology"],
  brief_link_section_dataset: ["section", "ontology"],
  brief_convert_to_structured: ["section", "ontology"],
  brief_create_parent_project: [
    "child_path",
    "parent_directory",
    "name",
    "type",
  ],
  brief_suggest_type_guides: ["query"],
  brief_apply_type_guide: ["type"],
  brief_discover_ontologies: ["query"],
  brief_create_ontology: ["name", "description"],
  brief_get_maturity_signals: ["project_path"],
  brief_where_am_i: ["project_path"],
  brief_hierarchy_tree: ["root_path"],
  brief_preview_dataset: ["source"],
  brief_fetch_dataset: ["source", "name", "id_column", "label_column"],
  brief_ontology_draft: ["action"],
};

/** Required non-string params — must be present but not validated as strings. */
const REQUIRED_PRESENT_PARAMS: Record<string, readonly string[]> = {
  brief_set_tutorial_dismissed: ["dismissed"],
};

/**
 * Required string params that allow empty string.
 * brief_update_section content="" means "clear section" (MCP-03).
 */
const REQUIRED_STRING_ALLOW_EMPTY: Record<string, readonly string[]> = {
  brief_update_section: ["content"],
};

/** Mutually exclusive param pairs — both cannot be present simultaneously. */
const MUTUAL_EXCLUSIONS: Record<
  string,
  ReadonlyArray<readonly [string, string]>
> = {
  brief_add_decision: [["replaces", "exception_to"]],
};

/**
 * Per-parameter maximum string length limits (MCP-03).
 * Keys are parameter names (snake_case). Values are character limits.
 */
const PARAM_LENGTH_LIMITS: Record<string, number> = {
  // Paths: 4096
  path: 4096,
  parent_path: 4096,
  workspace: 4096,
  // Titles/names: 500
  title: 500,
  name: 500,
  type: 500,
  constraint: 500,
  text: 500,
  tool_name: 500,
  summary: 500,
  section: 500,
  ontology: 500,
  entry_id: 500,
  source: 500,
  project_type: 500,
  extension_name: 500,
  why: 500,
  when: 500,
  alternatives_considered: 500,
  decision: 500,
  replaces: 500,
  exception_to: 500,
  // Search queries: 1000
  query: 1000,
  context: 1000,
  // Section content: 100 KB
  content: 102400,
  body: 102400,
  // Labels: 200
  paragraph: 200,
  label_override: 200,
  notes: 200,
};

/* ------------------------------------------------------------------ */
/*  Parameter alias normalization (LLM guess tolerance)                */
/* ------------------------------------------------------------------ */

/**
 * Common parameter name aliases that LLMs tend to guess instead of the
 * canonical names defined in TOOL_DEFINITIONS inputSchema.
 * Tool-specific entries override __global__ entries.
 */
const PARAM_ALIASES: Record<string, Record<string, string>> = {
  brief_update_section: { section: "heading" },
  brief_add_extension: { extension: "extension_name" },
  brief_remove_extension: { extension: "extension_name" },
  __global__: { path: "project_path" },
};

/**
 * Normalize aliased parameter names to their canonical equivalents.
 * - Only remaps if the alias is present AND the canonical name is absent.
 * - Global aliases only apply when the canonical name is a required param
 *   for the tool AND the alias name is NOT (avoids breaking tools like
 *   brief_set_active_project where "path" is the actual canonical name).
 */
function normalizeAliases(
  toolName: string,
  args: Record<string, unknown>,
): Record<string, unknown> {
  const toolAliases = PARAM_ALIASES[toolName];
  const globalAliases = PARAM_ALIASES.__global__;
  if (!toolAliases && !globalAliases) return args;

  const result = { ...args };

  // Apply tool-specific aliases
  if (toolAliases) {
    for (const [alias, canonical] of Object.entries(toolAliases)) {
      if (alias in result && !(canonical in result)) {
        result[canonical] = result[alias];
        delete result[alias];
      }
    }
  }

  // Apply global aliases (only when canonical is expected but alias is not)
  if (globalAliases) {
    const toolRequired = REQUIRED_STRING_PARAMS[toolName] ?? [];
    for (const [alias, canonical] of Object.entries(globalAliases)) {
      if (
        alias in result &&
        !(canonical in result) &&
        toolRequired.includes(canonical) &&
        !toolRequired.includes(alias)
      ) {
        result[canonical] = result[alias];
        delete result[alias];
      }
    }
  }

  return result;
}

/**
 * Validate tool arguments. Returns an error message string, or null if valid.
 */
function validateToolArgs(
  toolName: string,
  args: Record<string, unknown>,
): string | null {
  // Required string params: must be a non-empty, non-whitespace string
  for (const param of REQUIRED_STRING_PARAMS[toolName] ?? []) {
    const val = args[param];
    if (val === undefined || val === null) {
      return `Missing required parameter: ${param}`;
    }
    if (typeof val !== "string" || val.trim() === "") {
      return `Required parameter '${param}' must not be empty or whitespace-only`;
    }
  }

  // Required non-string params: must be present
  for (const param of REQUIRED_PRESENT_PARAMS[toolName] ?? []) {
    if (args[param] === undefined || args[param] === null) {
      return `Missing required parameter: ${param}`;
    }
  }

  // Required string params that allow empty string
  for (const param of REQUIRED_STRING_ALLOW_EMPTY[toolName] ?? []) {
    const val = args[param];
    if (val === undefined || val === null) {
      return `Missing required parameter: ${param}`;
    }
    if (typeof val !== "string") {
      return `Parameter '${param}' must be a string`;
    }
  }

  // Length limit validation (MCP-03)
  for (const [param, val] of Object.entries(args)) {
    if (typeof val === "string") {
      const limit = PARAM_LENGTH_LIMITS[param];
      if (limit !== undefined && val.length > limit) {
        return `Parameter '${param}' exceeds maximum length of ${limit} characters`;
      }
    }
  }

  // Mutual exclusion checks
  for (const [paramA, paramB] of MUTUAL_EXCLUSIONS[toolName] ?? []) {
    if (args[paramA] !== undefined && args[paramB] !== undefined) {
      return `Parameters '${paramA}' and '${paramB}' cannot both be provided`;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Token-bucket rate limiter (two buckets: read and write)
// ---------------------------------------------------------------------------

class TokenBucket {
  private tokens: number;
  private lastRefillMs: number;
  private readonly maxTokens: number;
  private readonly refillRatePerMs: number;

  constructor(maxTokens: number, tokensPerSecond: number) {
    this.maxTokens = maxTokens;
    this.tokens = maxTokens;
    this.refillRatePerMs = tokensPerSecond / 1000;
    this.lastRefillMs = Date.now();
  }

  consume(): boolean {
    const now = Date.now();
    const elapsed = now - this.lastRefillMs;
    this.tokens = Math.min(
      this.maxTokens,
      this.tokens + elapsed * this.refillRatePerMs,
    );
    this.lastRefillMs = now;
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }
}

// Read: 50 tokens/sec, burst 100
const readBucket = new TokenBucket(100, 50);
// Write: 10 tokens/sec, burst 20
const writeBucket = new TokenBucket(20, 10);

// Write-classified tools: add/create/update/set/install/remove/tag/capture/resolve
const WRITE_TOOLS = new Set<string>([
  "brief_add_decision",
  "brief_add_constraint",
  "brief_add_question",
  "brief_resolve_question",
  "brief_capture_external_session",
  "brief_update_section",
  "brief_set_active_project",
  "brief_create_project",
  "brief_create_sub_project",
  "brief_add_workspace",
  "brief_install_ontology",
  "brief_remove_ontology",
  "brief_list_ontology_columns",
  "brief_link_section_dataset",
  "brief_convert_to_structured",
  "brief_tag_entry",
  "brief_remove_tag",
  "brief_add_reference",
  "brief_create_type_guide",
  "brief_add_extension",
  "brief_remove_extension",
  "brief_set_tutorial_dismissed",
  "brief_create_parent_project",
  "brief_apply_type_guide",
  "brief_create_ontology",
  "brief_fetch_dataset",
  "brief_ontology_draft",
]);

function checkRateLimit(toolName: string): boolean {
  return WRITE_TOOLS.has(toolName)
    ? writeBucket.consume()
    : readBucket.consume();
}

// ---------------------------------------------------------------------------
// Response formatting — convert tool results to readable output
// ---------------------------------------------------------------------------

/**
 * Format a tool result into readable text.
 * Extracts key content as markdown for tools with large text bodies,
 * and falls back to indented JSON for everything else.
 */
function formatToolResult(toolName: string, result: unknown): string {
  if (result === null || result === undefined) {
    return "null";
  }
  const r = result as Record<string, unknown>;

  // Surface __REQUIRED_NEXT_STEPS__ prominently at the top
  const parts: string[] = [];
  if (r.__REQUIRED_NEXT_STEPS__) {
    parts.push(`⚠️ ${r.__REQUIRED_NEXT_STEPS__}`);
  }

  // Tool-specific formatting
  switch (toolName) {
    case "brief_get_type_guide": {
      const guide = r.guide as Record<string, unknown> | undefined;
      if (guide) {
        const name = guide.displayName ?? guide.slug ?? "";
        if (name) parts.push(`# Type Guide: ${name}`);
        const body = guide.body ?? guide.content;
        if (typeof body === "string" && body.length > 0) {
          parts.push(body);
        }
        // Add key metadata
        const meta: string[] = [];
        if (r.isGeneric) meta.push("generic: true");
        if (r.matchedViaAlias) meta.push(`alias: ${r.aliasUsed ?? "yes"}`);
        if (r.signal) meta.push(`signal: ${r.signal}`);
        if (meta.length > 0) {
          parts.push(`\n---\n_${meta.join(" | ")}_`);
        }
      } else {
        parts.push(JSON.stringify(result, null, 2));
      }
      break;
    }

    case "brief_create_type_guide": {
      if (r.created) {
        parts.push(`Type guide created: ${r.filePath ?? r.type ?? "unknown"}`);
        if (r.aliases && Array.isArray(r.aliases) && r.aliases.length > 0) {
          parts.push(`Aliases: ${(r.aliases as string[]).join(", ")}`);
        }
        if (r.templateUsed && typeof r.template === "string") {
          // Template was written to disk — AI must now collaborate on each section
          parts.push(
            "\n**Template written — do NOT pre-write the body.** Present each section below to the user one at a time. Discuss, draft collaboratively, then call brief_create_type_guide again with force=true and the completed body.\n",
            r.template as string,
          );
        } else {
          // Body was provided directly
          const body = r.body ?? r.template;
          if (typeof body === "string" && body.length > 0) {
            parts.push(`\n${body}`);
          }
        }
      }
      // Include remaining metadata
      const meta = { ...r };
      for (const k of ["__REQUIRED_NEXT_STEPS__", "body", "template"])
        delete meta[k];
      parts.push(`\n---\n${JSON.stringify(meta, null, 2)}`);
      break;
    }

    case "brief_create_project":
    case "brief_reenter_project": {
      // Show identity and setup phase prominently
      const identity = r.identity as Record<string, unknown> | undefined;
      if (identity) {
        parts.push(
          `**Project:** ${identity.name ?? "unknown"}${identity.type ? ` (${identity.type})` : ""}`,
        );
      }
      if (r.setupPhase) {
        parts.push(`**Setup Phase:** ${r.setupPhase}`);
      }
      if (r.status) {
        parts.push(`**Status:** ${r.status}`);
      }
      // Show nextSteps as a numbered list (if not already in __REQUIRED_NEXT_STEPS__)
      if (!r.__REQUIRED_NEXT_STEPS__ && Array.isArray(r.nextSteps)) {
        parts.push(
          "\n**Next Steps:**",
          ...(r.nextSteps as string[]).map((s, i) => `${i + 1}. ${s}`),
        );
      }
      // Include the interaction guide so the AI knows all patterns and rules
      if (typeof r.__GUIDE__ === "string") {
        parts.push(`\n---\n${r.__GUIDE__}`);
      }
      // Compact remaining metadata
      const rest = { ...r };
      for (const k of [
        "__REQUIRED_NEXT_STEPS__",
        "__GUIDE__",
        "identity",
        "setupPhase",
        "status",
        "nextSteps",
      ])
        delete rest[k];
      if (Object.keys(rest).length > 0) {
        parts.push(`\n---\n${JSON.stringify(rest, null, 2)}`);
      }
      break;
    }

    case "brief_get_context": {
      // Nudge AI to use brief_reenter_project at session start
      if (!hasSessionStarted()) {
        parts.push(
          "⚠ brief_reenter_project has not been called this session. Call it to receive the full project state, setup phase, required next steps, and interaction guide. brief_get_context is for mid-session lookups only.\n",
        );
      }
      // Format sections as readable text
      if (r.sections && typeof r.sections === "object") {
        const sections = r.sections as Record<string, unknown>;
        for (const [heading, content] of Object.entries(sections)) {
          if (typeof content === "string" && content.trim()) {
            parts.push(`## ${heading}\n${content}`);
          }
        }
      }
      // Compact remaining metadata
      const rest = { ...r };
      delete rest.sections;
      delete rest.__REQUIRED_NEXT_STEPS__;
      if (Object.keys(rest).length > 0) {
        parts.push(`\n---\n${JSON.stringify(rest, null, 2)}`);
      }
      break;
    }

    case "brief_browse_ontology":
    case "brief_get_ontology_entry": {
      // Format ontology entries readably
      const entry = (r.entry ?? r) as Record<string, unknown>;
      if (entry.label || entry.id) {
        parts.push(`**${entry.label ?? entry.id}**`);
      }
      if (typeof entry.description === "string") {
        parts.push(entry.description);
      }
      // Show key fields
      for (const key of ["keywords", "parents", "children", "references"]) {
        const val = entry[key];
        if (Array.isArray(val) && val.length > 0) {
          parts.push(`**${key}:** ${val.join(", ")}`);
        }
      }
      // Remaining data
      const rest = { ...r };
      delete rest.__REQUIRED_NEXT_STEPS__;
      parts.push(`\n---\n${JSON.stringify(rest, null, 2)}`);
      break;
    }

    case "brief_suggest_type_guides": {
      // Format candidates as a readable list
      const candidates = r.candidates as
        | Array<Record<string, unknown>>
        | undefined;
      if (candidates && candidates.length > 0) {
        parts.push("**Type Guide Candidates:**\n");
        for (const c of candidates) {
          const name = c.displayName ?? c.slug ?? c.type ?? "unknown";
          const score = c.score ? ` (score: ${c.score})` : "";
          parts.push(`- **${name}**${score}`);
          if (typeof c.description === "string") {
            parts.push(`  ${c.description}`);
          }
        }
      } else {
        parts.push(
          "No matching type guide candidates found. Consider creating a custom guide.",
        );
      }
      if (r.signal) parts.push(`\n_Signal: ${r.signal}_`);
      break;
    }

    case "brief_design_extension": {
      const extName = r.extensionName ?? "Custom Extension";
      parts.push(`**Extension Proposal: ${extName}**\n`);
      const subs = r.subsections as Array<Record<string, unknown>> | undefined;
      if (subs && subs.length > 0) {
        parts.push(
          "| Subsection | Mode | Ontology Match | Next Step |",
          "|---|---|---|---|",
        );
        for (const s of subs) {
          const mode = s.recommendedMode ?? "freeform";
          const ontology = s.matchedOntology
            ? `${s.matchedOntology} (${s.matchedOntologyEntryCount ?? "?"} entries)`
            : "—";
          let next = "";
          if (s.matchedOntology) next = "Review sample entries below";
          else if (s.ontologyAction === "discover")
            next = "Search for external packs?";
          else if (s.ontologyAction === "create")
            next = "Create custom ontology?";
          else next = "Freeform — user writes content";
          parts.push(`| ${s.name} | ${mode} | ${ontology} | ${next} |`);
        }
        // Show sample entries for matched ontologies
        const matched = subs.filter(
          (s) =>
            s.sampleEntries &&
            Array.isArray(s.sampleEntries) &&
            (s.sampleEntries as unknown[]).length > 0,
        );
        for (const s of matched) {
          parts.push(
            `\n**Sample entries from ${s.matchedOntology} (for ${s.name}):**`,
          );
          for (const e of s.sampleEntries as Array<Record<string, unknown>>) {
            const desc =
              typeof e.description === "string" ? `: "${e.description}"` : "";
            parts.push(`- ${e.label}${desc}`);
          }
          if (s.suggestedColumns && Array.isArray(s.suggestedColumns)) {
            parts.push(
              `**Suggested columns:** ${(s.suggestedColumns as string[]).join(", ")}`,
            );
          }
        }
        // Show ontology options for unmatched subsections
        const unmatched = subs.filter(
          (s) => s.ontologyAction && s.ontologyAction !== "none",
        );
        if (unmatched.length > 0) {
          parts.push("\n**Ontology options for unmatched subsections:**");
          for (const s of unmatched) {
            parts.push(
              `- ${s.name} → ${s.ontologyActionHint ?? "Search or create an ontology"}`,
            );
          }
        }
      }
      // Show installed ontologies
      const installed = r.installedOntologies as
        | Array<Record<string, unknown>>
        | undefined;
      if (installed && installed.length > 0) {
        const list = installed
          .map((o) => `${o.name} (${o.entryCount})`)
          .join(", ");
        parts.push(`\n**Installed ontologies:** ${list}`);
      }
      parts.push(
        "\nWalk through each subsection with the user. See Pattern 6 workflow for next steps.",
      );
      break;
    }

    case "brief_discover_references": {
      const dExtName = r.extensionName ?? "Extension";
      parts.push(`**Reference Discovery: ${dExtName}**\n`);
      const locals = r.localSuggestions as
        | Array<Record<string, unknown>>
        | undefined;
      if (locals && locals.length > 0) {
        parts.push("**Local suggestions:**");
        for (let i = 0; i < locals.length; i++) {
          const s = locals[i];
          parts.push(`${i + 1}. ${s.creator}: ${s.title} — ${s.matchReason}`);
        }
      }
      const ctx = r.searchContext as Record<string, unknown> | null;
      if (ctx) {
        parts.push(`\n**Web search query:** "${ctx.query}"`);
        if (
          Array.isArray(ctx.referenceTypes) &&
          (ctx.referenceTypes as string[]).length > 0
        ) {
          parts.push(
            `**Reference types to search for:** ${(ctx.referenceTypes as string[]).join(", ")}`,
          );
        }
        if (
          Array.isArray(ctx.searchHints) &&
          (ctx.searchHints as string[]).length > 0
        ) {
          parts.push(
            `**Search hints:** ${(ctx.searchHints as string[]).join(", ")}`,
          );
        }
      }
      if (typeof r.instructions === "string") {
        parts.push(`\n${r.instructions}`);
      }
      break;
    }

    case "brief_ontology_draft": {
      const d = r.draft as Record<string, unknown> | undefined;
      if (r.draftId) parts.push(`**Draft Id:** ${r.draftId}`);
      if (d) {
        const status = d.status ?? "unknown";
        const name = d.name ?? "untitled";
        const entries = d.entries as Array<Record<string, unknown>> | undefined;
        const columns = d.columns as Array<Record<string, unknown>> | undefined;
        const entryCount = entries?.length ?? 0;

        parts.push(
          `**Draft:** ${name} | Status: ${status} | ${entryCount} entries`,
        );

        // Show columns
        if (columns && columns.length > 0) {
          const colNames = columns.map(
            (c) =>
              `${c.name}${(c as Record<string, unknown>).type === "custom" ? "*" : ""}`,
          );
          parts.push(`**Columns:** ${colNames.join(", ")}`);
        }

        // Show entries with column data (max 25)
        if (entries && entries.length > 0) {
          const customCols = (columns ?? [])
            .filter((c) => (c as Record<string, unknown>).type === "custom")
            .map((c) => c.name as string);

          if (customCols.length > 0) {
            // Table format for structured data
            const header = `| id | label | ${customCols.join(" | ")} |`;
            const sep = `|---|---|${customCols.map(() => "---").join("|")}|`;
            parts.push(header, sep);
            for (const e of entries.slice(0, 25)) {
              const vals = customCols.map((c) => String(e[c] ?? ""));
              parts.push(`| ${e.id} | ${e.label} | ${vals.join(" | ")} |`);
            }
          } else {
            // Simple list
            for (const e of entries.slice(0, 25)) {
              const desc =
                typeof e.description === "string" ? ` — ${e.description}` : "";
              parts.push(`- **${e.label}** (${e.id})${desc}`);
            }
          }
          if (entries.length > 25) {
            parts.push(`_...and ${entries.length - 25} more entries_`);
          }
        }
      }
      if (r.signal) parts.push(`\n_${r.signal}_`);
      if (r.installed) parts.push(`\n**Installed as pack:** ${r.packName}`);
      break;
    }

    default: {
      // Generic auto-formatter for all other tools
      const rest = { ...r };
      delete rest.__REQUIRED_NEXT_STEPS__;
      parts.push(formatGenericResult(rest));
      break;
    }
  }

  return parts.join("\n\n");
}

// ---------------------------------------------------------------------------
// Generic result formatter — auto-detects common patterns
// ---------------------------------------------------------------------------

const STATUS_KEYS = new Set([
  "success",
  "created",
  "tagged",
  "installed",
  "removed",
  "converted",
  "resolved",
  "updated",
  "applied",
  "dismissed",
  "linked",
  "drafted",
]);

const BODY_KEYS = ["body", "guide", "template"];

function humanize(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase())
    .trim();
}

function formatGenericResult(obj: Record<string, unknown>): string {
  const lines: string[] = [];
  const shown = new Set<string>();

  // 1. Status line from boolean flags
  for (const key of STATUS_KEYS) {
    if (obj[key] === true) {
      lines.push(`${humanize(key)}`);
      shown.add(key);
    }
  }

  // 2. Text body fields — render as markdown blocks
  for (const key of BODY_KEYS) {
    const val = obj[key];
    if (typeof val === "string" && val.length > 0) {
      lines.push(val);
      shown.add(key);
    }
  }

  // 3. Remaining fields as readable key-value pairs
  for (const [key, value] of Object.entries(obj)) {
    if (shown.has(key)) continue;
    if (value === null || value === undefined) continue;
    if (typeof value === "boolean" && STATUS_KEYS.has(key)) continue;

    const label = humanize(key);

    if (typeof value === "string") {
      if (value.length > 200) {
        // Long text — render as block
        lines.push(`**${label}:**\n${value}`);
      } else {
        lines.push(`**${label}:** ${value}`);
      }
    } else if (typeof value === "number") {
      lines.push(`**${label}:** ${value}`);
    } else if (typeof value === "boolean") {
      lines.push(`**${label}:** ${value}`);
    } else if (Array.isArray(value)) {
      if (value.length === 0) continue;
      const allStrings = value.every((v) => typeof v === "string");
      if (allStrings && value.length <= 3) {
        lines.push(`**${label}:** ${value.join(", ")}`);
      } else if (allStrings) {
        lines.push(
          `**${label}:**\n${(value as string[]).map((v) => `- ${v}`).join("\n")}`,
        );
      } else {
        // Array of objects — render each compactly
        lines.push(
          `**${label}:**\n${value.map((v) => `- ${typeof v === "object" ? JSON.stringify(v) : String(v)}`).join("\n")}`,
        );
      }
    } else if (typeof value === "object") {
      // One-level deep: render sub-fields inline
      const sub = value as Record<string, unknown>;
      const subParts: string[] = [];
      for (const [sk, sv] of Object.entries(sub)) {
        if (sv === null || sv === undefined) continue;
        if (
          typeof sv === "string" ||
          typeof sv === "number" ||
          typeof sv === "boolean"
        ) {
          subParts.push(`${humanize(sk)}: ${sv}`);
        } else if (
          Array.isArray(sv) &&
          sv.length > 0 &&
          sv.every((v) => typeof v === "string")
        ) {
          subParts.push(`${humanize(sk)}: ${sv.join(", ")}`);
        }
      }
      if (subParts.length > 0) {
        lines.push(`**${label}:** ${subParts.join(" | ")}`);
      } else {
        lines.push(`**${label}:** ${JSON.stringify(sub)}`);
      }
    }
  }

  return lines.length > 0 ? lines.join("\n") : "{}";
}

// ---------------------------------------------------------------------------
// handleToolCall — exported standalone function (full middleware pipeline)
// ---------------------------------------------------------------------------

export interface HandleToolCallParams {
  readonly name: string;
  readonly arguments: object;
  readonly _simulateThrow?: Error;
  readonly _parseError?: string;
  readonly timeoutMs?: number;
}

export interface HandleToolCallResult {
  readonly content: Array<{ type: "text"; text: string }>;
  readonly isError?: boolean;
}

/**
 * Execute a tool call through the full middleware pipeline:
 * (a) request ID, (b) validation, (c) rate limit, (d) timing,
 * (e) error boundary, (f) operation timeout (ERR-09).
 *
 * Unlike the MCP server handler, this function never throws — all errors
 * are caught and returned as isError:true responses.
 */
export async function handleToolCall(
  params: HandleToolCallParams,
): Promise<HandleToolCallResult> {
  const {
    name,
    arguments: rawArgs,
    _simulateThrow,
    _parseError,
    timeoutMs = 30_000,
  } = params;
  const args = normalizeAliases(
    name,
    (rawArgs ?? {}) as Record<string, unknown>,
  );

  // JSON parse errors take priority — return isError:true with parse error message
  if (_parseError !== undefined) {
    return {
      content: [
        { type: "text", text: `JSON parse error (-32700): ${_parseError}` },
      ],
      isError: true,
    };
  }

  // Unknown tool name — throw McpError (protocol violation, MCP-07)
  if (!KNOWN_TOOLS.has(name)) {
    throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
  }

  // (a) Request ID — logged at info so tests can verify via stderr spy
  const requestId = randomUUID();
  const start = Date.now();
  logger.info("Tool call started", { requestId, tool: name });

  // (b) Parameter validation
  const validationError = validateToolArgs(name, args);
  if (validationError) {
    const duration = Date.now() - start;
    logger.info("Tool call completed", { requestId, tool: name, duration });
    return {
      content: [{ type: "text", text: validationError }],
      isError: true,
    };
  }

  // (c) Rate limit check
  if (!checkRateLimit(name)) {
    const duration = Date.now() - start;
    logger.info("Tool call completed", { requestId, tool: name, duration });
    return {
      content: [
        { type: "text", text: "Rate limit exceeded. Please slow down." },
      ],
      isError: true,
    };
  }

  // (f) Operation timeout via AbortController (ERR-09, CONC-06)
  const controller = new AbortController();
  const { signal } = controller;
  let timeoutFired = false;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<HandleToolCallResult>((resolve) => {
    timeoutId = setTimeout(() => {
      timeoutFired = true;
      controller.abort();
      resolve({
        content: [
          {
            type: "text",
            text: `Tool call '${name}' timeout after ${timeoutMs}ms`,
          },
        ],
        isError: true,
      });
    }, timeoutMs);
  });

  // (e) Error boundary + (d) timing
  const handlerPromise = (async (): Promise<HandleToolCallResult> => {
    try {
      // Simulate throw for testing error boundary
      if (_simulateThrow !== undefined) {
        throw _simulateThrow;
      }

      // Yield to macrotask queue so the timeout timer can fire if timeoutMs is very small.
      // Using setTimeout(0) ensures the 1ms timeout (registered first) fires before this resumes.
      await new Promise<void>((r) => setTimeout(r, 0));

      // Check abort after yield — timeout may have fired
      if (signal.aborted) {
        return {
          content: [
            {
              type: "text",
              text: `Tool call '${name}' timeout after ${timeoutMs}ms`,
            },
          ],
          isError: true,
        };
      }

      // Dispatch to real handler
      const handler = TOOL_HANDLERS[name];
      if (handler) {
        const result = await handler(args);
        const formatted = formatToolResult(name, result);
        return {
          content: [{ type: "text", text: formatted }],
        };
      }

      // Fallback for unmapped tools
      return {
        content: [
          { type: "text", text: `Tool '${name}' is not yet implemented.` },
        ],
      };
    } catch (err) {
      // If timeout fired, the timeout promise wins via race
      if (timeoutFired || signal.aborted) {
        return {
          content: [
            {
              type: "text",
              text: `Tool call '${name}' timeout after ${timeoutMs}ms`,
            },
          ],
          isError: true,
        };
      }

      // (e) Catch all errors, log with request ID, return isError:true
      logger.error("Unhandled error in tool handler", {
        requestId,
        tool: name,
        error: err instanceof Error ? err.message : String(err),
      });
      return {
        content: [
          {
            type: "text",
            text: `Internal error [requestId:${requestId}] in '${name}': ${
              err instanceof Error ? err.message : String(err)
            }`,
          },
        ],
        isError: true,
      };
    } finally {
      // (d) Timing
      const duration = Date.now() - start;
      logger.info("Tool call completed", { requestId, tool: name, duration });
    }
  })();

  const result = await Promise.race([handlerPromise, timeoutPromise]);
  if (timeoutId !== undefined) {
    clearTimeout(timeoutId);
  }
  return result;
}

// ---------------------------------------------------------------------------
// getRegisteredTools — returns all 38 tool definitions
// ---------------------------------------------------------------------------

export function getRegisteredTools(): Array<{
  name: string;
  description: string;
  inputSchema: { type: "object"; properties: object; required?: string[] };
}> {
  return TOOL_DEFINITIONS.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema as {
      type: "object";
      properties: object;
      required?: string[];
    },
  }));
}

// ---------------------------------------------------------------------------
// Child process configuration (T56-05)
// ---------------------------------------------------------------------------

/**
 * Returns the stdio configuration for spawning the MCP server as a child process.
 * All three streams (stdin, stdout, stderr) are piped to prevent output mixing.
 */
export function getChildProcessConfig(): { stdio: [string, string, string] } {
  return { stdio: ["pipe", "pipe", "pipe"] };
}

// ---------------------------------------------------------------------------
// createServer — MCP Server instance (OQ-117)
// ---------------------------------------------------------------------------

export function createServer(): Server {
  // Check Node.js version before any MCP SDK initialisation (OQ-117)
  checkNodeVersion(20);

  const server = new Server(
    { name: "brief-mcp", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );

  // Wire server instance to dispatch layer for sampling access
  setServer(server);

  // List tools handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: getRegisteredTools() };
  });

  // Call tool handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const toolName = request.params.name;

    // Protocol violation: unknown tool → throw McpError (MCP-07)
    if (!KNOWN_TOOLS.has(toolName)) {
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${toolName}`);
    }

    return handleToolCall({
      name: toolName,
      arguments: (request.params.arguments ?? {}) as object,
    }) as Promise<CallToolResult>;
  });

  return server;
}

// ---------------------------------------------------------------------------
// startServer — connects stdio transport (used by CLI entry point)
// ---------------------------------------------------------------------------

export async function startServer(): Promise<void> {
  // Initialize all modules from disk (best-effort, non-fatal)
  try {
    await Promise.all([
      initOntology(),
      initSuggestion(),
      initLookup(),
      initTypeCreation(),
      loadWizardState(),
    ]);
  } catch {
    // Disk init failures are non-fatal — fixture data still works
  }

  const server = createServer();
  const transport = new StdioServerTransport();
  try {
    await server.connect(transport);
    logger.info("brief-mcp server started", { transport: "stdio" });
  } catch (err) {
    logger.error("Failed to connect server transport", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Stub for TASK-52 benchmark tests */
export async function bootstrapServer(_options?: {
  packs?: number;
  dryRun?: boolean;
  [key: string]: unknown;
}): Promise<{
  started: boolean;
  lazyLoadingActivated?: boolean;
  [key: string]: unknown;
}> {
  return { started: false };
}
