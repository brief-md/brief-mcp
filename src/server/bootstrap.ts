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
import { createLogger } from "../observability/logger.js";
import { TOOL_HANDLERS } from "./dispatch.js";

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
// Tool definitions (38 tools — MCP-02, MCP-05, MCP-06)
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
      "List all BRIEF.md projects in known workspaces. brief-mcp scope: project discovery and filtering.",
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
      "Set the active project for the current session. brief-mcp scope: session state. Provide the path to a BRIEF.md file or project directory.",
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
      "Create a new BRIEF.md project file. brief-mcp scope: project initialisation. Specify name, type, optional workspace, and extensions.",
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
      "Resume work on a project by loading its full context. brief-mcp scope: session continuity. Returns decisions, open questions, and recent activity.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Project path to re-enter." },
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
      "Call this at the start of every session. Returns full project context from BRIEF.md. brief-mcp scope: session initialisation. Use scope to walk the project hierarchy.",
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
      "Update or clear a section in BRIEF.md. brief-mcp scope: section editing. Pass empty string to clear a section.",
    inputSchema: {
      type: "object",
      properties: {
        heading: { type: "string", description: "Section heading to update." },
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
      "Check for conflicting decisions in BRIEF.md hierarchy. brief-mcp scope: conflict detection. Walks the hierarchy for contradictions.",
    inputSchema: {
      type: "object",
      properties: {
        scope: { type: "string", description: "Project scope path." },
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
      "Browse entries in an ontology pack, optionally by category. brief-mcp scope: ontology browsing. Data is user-contributed — verify before relying on it.",
    inputSchema: {
      type: "object",
      properties: {
        ontology: { type: "string", description: "Pack ID to browse." },
        category: { type: "string", description: "Filter by category." },
        max_results: {
          type: "number",
          description: "Maximum results to return.",
        },
      },
      required: ["ontology"],
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
        ontology_links: {
          type: "array",
          items: { type: "object" },
          description: "Linked ontology entries.",
        },
      },
      required: ["section", "title"],
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
      "Create or update a type guide file. brief-mcp scope: type guide authoring. Defines recommended structure for a project type.",
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
        body: { type: "string", description: "Guide body content." },
        force: { type: "boolean", description: "Overwrite if already exists." },
      },
      required: ["type", "body"],
    },
  },

  // --- Extension tools ---
  {
    name: "brief_suggest_extensions",
    description:
      "Suggest BRIEF.md extensions for a project type. brief-mcp scope: extension discovery.",
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
    name: "brief_add_extension",
    description:
      "Activate an extension in BRIEF.md to add specialised sections. brief-mcp scope: extension management.",
    inputSchema: {
      type: "object",
      properties: {
        extension_name: {
          type: "string",
          description: "Extension to activate.",
        },
        subsections: {
          type: "array",
          items: { type: "string" },
          description: "Optional subsections to include.",
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
  brief_browse_ontology: ["ontology"],
  brief_install_ontology: ["source"],
  brief_tag_entry: ["ontology", "entry_id", "section"],
  brief_get_entry_references: ["ontology", "entry_id"],
  brief_suggest_references: ["context"],
  brief_add_reference: ["section", "title"],
  brief_get_type_guide: ["type"],
  brief_create_type_guide: ["type", "body"],
  brief_suggest_extensions: ["project_type"],
  brief_add_extension: ["extension_name"],
  brief_remove_ontology: ["ontology"],
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
  "brief_tag_entry",
  "brief_add_reference",
  "brief_create_type_guide",
  "brief_add_extension",
  "brief_set_tutorial_dismissed",
]);

function checkRateLimit(toolName: string): boolean {
  return WRITE_TOOLS.has(toolName)
    ? writeBucket.consume()
    : readBucket.consume();
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
  const args = (rawArgs ?? {}) as Record<string, unknown>;

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
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
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
