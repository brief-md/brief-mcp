// src/types/writer.ts

export type WriteOperationType =
  | "update-section"
  | "add-decision"
  | "add-question"
  | "resolve-question"
  | "update-metadata"
  | "add-extension"
  | "add-ontology-tag"
  | "add-reference"
  | "capture-session";

export interface WriteOperation {
  readonly type: WriteOperationType;
  readonly targetSection?: string;
  readonly content?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface SectionWriteTarget {
  readonly sectionName: string;
  readonly extensionName?: string;
  readonly subsectionName?: string;
}

export interface DecisionWriteParams {
  readonly title: string;
  readonly why?: string;
  readonly when?: string;
  readonly alternativesConsidered?: string | string[];
  readonly replaces?: string;
  readonly exceptionTo?: string;
  readonly date?: string;
}

export interface QuestionWriteParams {
  readonly text: string;
  readonly category: "to-resolve" | "to-keep-open";
  readonly options?: string[];
  readonly impact?: string;
  readonly priority?: "high" | "medium" | "low";
}

export interface MetadataSyncParams {
  readonly field: string;
  readonly value: string | string[];
  readonly append?: boolean;
}

export interface WriterResult {
  readonly filePath: string;
  readonly changesSummary: string;
  readonly warnings: string[];
}
