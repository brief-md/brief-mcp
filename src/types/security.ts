// src/types/security.ts

export type SecurityErrorType = "security_error" | "security_limit_exceeded";

export interface PathValidationResult {
  readonly resolvedPath: string;
  readonly isAllowed: boolean;
  readonly matchedRoot?: string;
}

export interface SecurityLimits {
  readonly maxFileSize: number;
  readonly maxSectionCount: number;
  readonly maxDecisionChainDepth: number;
  readonly maxPackSize: number;
  readonly maxTotalPackSize: number;
  readonly maxEntriesPerPack: number;
}

export interface SecurityLimitCheck {
  readonly fileSize?: number;
  readonly sectionCount?: number;
  readonly chainDepth?: number;
}

export type ParameterType = "title" | "content" | "query" | "label" | "path";

export interface OntologyPackSchema {
  readonly name: string;
  readonly version: string;
  readonly entries: OntologyPackEntrySchema[];
  [key: string]: unknown;
}

export interface OntologyPackEntrySchema {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly keywords?: string[];
  readonly synonyms?: string[];
  readonly aliases?: string[];
  readonly references?: unknown[];
  [key: string]: unknown;
}
