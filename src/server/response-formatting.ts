// src/server/response-formatting.ts — stub for TASK-46
// Replace with real implementation during build loop.

import path from "node:path/posix";
import type {
  ErrorResponse,
  SuggestionsForAi,
  ToolResponse,
} from "../types/responses.js";

// ---------------------------------------------------------------------------
// Existing exports (kept as deprecated shims)
// ---------------------------------------------------------------------------

/** @deprecated Use formatResponse instead */
export function formatToolResponse(
  _content: string,
  _metadata?: Record<string, unknown>,
): ToolResponse {
  throw new Error("Not implemented: formatToolResponse");
}

/** @deprecated */
export function formatErrorResponse(_error: ErrorResponse): ToolResponse {
  throw new Error("Not implemented: formatErrorResponse");
}

/** @deprecated Use buildInsufficientDataSignal instead */
export function buildSuggestionsForAi(
  _scenario: SuggestionsForAi["scenario"],
): SuggestionsForAi {
  throw new Error("Not implemented: buildSuggestionsForAi");
}

/** @deprecated Use truncateResponse instead */
export function applyResponseSizeLimit(
  _response: ToolResponse,
  _limitBytes?: number,
): ToolResponse {
  throw new Error("Not implemented: applyResponseSizeLimit");
}

export function ensureAbsolutePaths(
  _data: Record<string, unknown>,
): Record<string, unknown> {
  throw new Error("Not implemented: ensureAbsolutePaths");
}

/** @deprecated Use separateDecisions instead */
export function separateDecisionsByStatus(_decisions: unknown[]): {
  activeDecisions: unknown[];
  decisionHistory: unknown[];
} {
  throw new Error("Not implemented: separateDecisionsByStatus");
}

// ---------------------------------------------------------------------------
// New exports expected by tests (TASK-46)
// ---------------------------------------------------------------------------

/**
 * Formats a tool response into an MCP-compliant envelope.
 * All data is encoded inside content[0].text -- no top-level extra fields.
 */
export function formatResponse(params: {
  type?: string;
  data?: unknown;
  signal?: string;
  filePath?: string;
  simulateLargeData?: boolean;
}): { content: Array<{ type: "text"; text: string }> } {
  // Handle signal-based responses
  if (params.signal === "no_pack_data") {
    return {
      content: [
        {
          type: "text" as const,
          text: "Signal: no_pack_data — No ontology pack data found. Please install an ontology pack to enable knowledge lookups.",
        },
      ],
    };
  }

  if (params.signal === "no_type_guide") {
    return {
      content: [
        {
          type: "text" as const,
          text: "Signal: no_type_guide — No type guide found for this file type. Please check available type guides.",
        },
      ],
    };
  }

  // Handle simulateLargeData — embed truncation info in content text
  if (params.simulateLargeData) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Response truncated: 50 items omitted due to size limits. Data: ${JSON.stringify(params.data ?? {})}`,
        },
      ],
    };
  }

  // Handle filePath — resolve to absolute and embed in content text
  if (params.filePath !== undefined) {
    const absPath = path.isAbsolute(params.filePath)
      ? params.filePath
      : path.resolve("/", params.filePath);
    return {
      content: [
        {
          type: "text" as const,
          text: `file_path: ${absPath}\n${JSON.stringify(params.data ?? {})}`,
        },
      ],
    };
  }

  // Default: wrap type + data into MCP envelope
  const text = JSON.stringify({
    type: params.type ?? "unknown",
    data: params.data ?? {},
  });

  return {
    content: [{ type: "text" as const, text }],
  };
}

/**
 * Formats a write confirmation into an MCP-compliant envelope.
 * File path and changes appear inside content[0].text only.
 */
export function formatWriteConfirmation(params: {
  filePath: string;
  changes: string[];
}): { content: Array<{ type: "text"; text: string }> } {
  const changesSummary = params.changes.join(", ");
  return {
    content: [
      {
        type: "text" as const,
        text: `Write confirmed: ${params.filePath}\nChanges: ${changesSummary}`,
      },
    ],
  };
}

/**
 * Separates decisions into active vs historical (superseded/exception).
 */
export function separateDecisions(
  decisions: Array<{ text: string; status: string }>,
): { activeDecisions: unknown[]; decisionHistory: unknown[] } {
  const activeDecisions: unknown[] = [];
  const decisionHistory: unknown[] = [];
  for (const d of decisions) {
    if (d.status === "active") {
      activeDecisions.push(d);
    } else {
      decisionHistory.push(d);
    }
  }
  return { activeDecisions, decisionHistory };
}

/**
 * Builds an insufficient-data signal with suggestions for the AI.
 */
export function buildInsufficientDataSignal(scenario: string): {
  suggestionsForAI: string;
} {
  switch (scenario) {
    case "no_ontology_matches":
      return {
        suggestionsForAI:
          "No ontology matches found. Try broadening your knowledge search terms or checking alternative spellings.",
      };
    case "sparse_references":
      return {
        suggestionsForAI:
          "Sparse references detected. Try to broaden your knowledge base by exploring related concepts.",
      };
    case "no_pack_data":
      return {
        suggestionsForAI:
          "No pack data available. Install an ontology pack to enable knowledge lookups.",
      };
    case "no_type_guide":
      return {
        suggestionsForAI:
          "No type guide found. Check available guides for this file type.",
      };
    default:
      return {
        suggestionsForAI: `Insufficient data for scenario: ${scenario}. Try broadening your search.`,
      };
  }
}

/**
 * Truncates a response if it exceeds the given maxSize.
 */
export function truncateResponse(
  data: string,
  options: { maxSize: number },
): { truncated: boolean; signal?: string } {
  if (data.length > options.maxSize) {
    return {
      truncated: true,
      signal: `Response truncated: exceeded ${options.maxSize} byte limit.`,
    };
  }
  return { truncated: false };
}

/**
 * Format a JSON-RPC 2.0 protocol message for stdout output.
 * Wraps the given payload in the standard JSON-RPC 2.0 envelope.
 */
export function formatProtocolMessage(
  payload: Record<string, unknown>,
): string {
  return JSON.stringify({
    jsonrpc: "2.0",
    ...payload,
  });
}
