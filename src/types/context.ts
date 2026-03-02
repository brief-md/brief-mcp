// src/types/context.ts

import type { Decision, Question } from "./decisions.js";
import type { BriefMetadata, Section } from "./parser.js";
import type { Signal } from "./responses.js";

export interface ContextReadResult {
  readonly projectPath: string;
  readonly filePath: string;
  readonly metadata: BriefMetadata;
  readonly sections: Section[];
  readonly activeDecisions: Decision[];
  readonly decisionHistory?: Decision[];
  readonly questions: Question[];
  readonly signals: Signal[];
  readonly isTruncated?: boolean;
}

export interface ActiveProject {
  readonly projectPath: string;
  readonly briefFilePath: string;
  readonly projectName: string;
  readonly lastAccessed: number;
}
