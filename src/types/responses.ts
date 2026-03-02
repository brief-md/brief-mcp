// src/types/responses.ts

export type ErrorType =
  | "invalid_input"
  | "not_found"
  | "parse_warning"
  | "system_error"
  | "internal_error"
  | "security_limit_exceeded";

export type DecisionItemStatus = "active" | "superseded" | "exception";

export interface Signal {
  readonly type: string;
  readonly payload: Record<string, unknown>;
  readonly description: string;
}

export interface ToolResponse {
  readonly content: Array<{ type: "text"; text: string }>;
  readonly signals?: Signal[];
  readonly warnings?: string[];
  readonly metadata?: Record<string, unknown>;
  readonly isError?: boolean;
  readonly isTruncated?: boolean;
  readonly truncatedCount?: number;
}

export interface ErrorResponse {
  readonly type: ErrorType;
  readonly message: string;
  readonly suggestion?: string;
  readonly code?: string;
  readonly subtype?: string;
}

export interface WriteConfirmation {
  readonly filePath: string;
  readonly changesSummary: string;
  readonly updatedTimestamp: string;
}

export interface SuggestionsForAi {
  readonly missing: string;
  readonly aiCanDo: string;
  readonly scenario:
    | "no_ontology_matches"
    | "sparse_references"
    | "no_pack_data"
    | "no_type_guide";
}
