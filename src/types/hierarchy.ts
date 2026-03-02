// src/types/hierarchy.ts

import type { Decision, Question } from "./decisions.js";
import type { ParsedBriefMd, Section } from "./parser.js";

export interface HierarchyLevel {
  readonly depth: number;
  readonly dirPath: string;
  readonly filePath: string | null;
  readonly parsedContent: ParsedBriefMd | null;
}

export type ContextSignalType =
  | "no_type_guide"
  | "no_ontology_matches"
  | "sparse_references"
  | "no_pack_data"
  | "truncated";

export interface ContextSignal {
  readonly type: ContextSignalType;
  readonly payload: Record<string, unknown>;
  readonly description: string;
}

export interface AccumulatedContext {
  readonly levels: HierarchyLevel[];
  readonly mergedMetadata: Record<string, unknown>;
  readonly mergedSections: Section[];
  readonly allDecisions: Decision[];
  readonly allQuestions: Question[];
  readonly signals: ContextSignal[];
}
