// src/types/validation.ts

export type LintSeverity = "error" | "warning" | "info";

export interface LintFinding {
  readonly ruleId: string;
  readonly severity: LintSeverity;
  readonly message: string;
  readonly line?: number;
  readonly section?: string;
  readonly suggestion?: string;
  readonly code?: string;
  readonly fields?: string[];
}

export interface LintResult {
  readonly filePath: string;
  readonly findings: LintFinding[];
  readonly isValid: boolean;
  readonly isWellFormed: boolean;
}

export interface ConflictResult {
  readonly type?: string;
  readonly source?: string;
  readonly severity: LintSeverity;
  readonly items?: Array<{ text: string; status: string }>;
  readonly resolutionOptions?: string[];
  readonly description?: string;
  readonly suggestion?: string;
}

export interface ConflictCheckResult {
  readonly conflicts: ConflictResult[];
  readonly checkedDecisions: number;
}
