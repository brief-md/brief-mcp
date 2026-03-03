// src/context/read.ts — stub for TASK-24
// Replace with real implementation during build loop.

import type { Decision, Question } from "../types/decisions.js";

/* ------------------------------------------------------------------ */
/*  Parameter / Result interfaces                                      */
/* ------------------------------------------------------------------ */

export interface GetContextParams {
  projectPath: string;
  sections?: string[];
  includeSuperseded?: boolean;
  contextDepth?: number;
  scope?: string;
  sizeLimitBytes?: number;
  simulateEmpty?: boolean;
  simulateReadOnly?: boolean;
  simulateLargeResponse?: boolean;
  maxResponseSize?: number;
  lenient?: boolean;
}

export interface GetContextResult {
  levels?: Array<{ label?: string; project?: string }>;
  sections?: Array<{ name: string }>;
  truncated?: boolean;
  truncationSignal?: string;
  filesModified?: number;
  suggestions?: unknown;
  isError?: boolean;
  pathNotFound?: boolean;
  filePath?: string;
  briefMdPath?: string;
  projectPath?: string;
  activeDecisions?: Decision[];
  [key: string]: unknown;
}

export interface GetConstraintsParams {
  projectPath: string;
  simulateReadOnly?: boolean;
  [key: string]: unknown;
}

export interface GetConstraintsResult {
  constraints: string[];
  rejectedAlternatives?: string[];
  filePath: string;
  content: string;
  warnings?: string[];
  filesModified?: number;
  [key: string]: unknown;
}

export interface GetDecisionsParams {
  projectPath: string;
  includeSuperseded?: boolean;
  scope?: string;
  simulateExceptionDecision?: boolean;
  simulateReadOnly?: boolean;
  [key: string]: unknown;
}

export interface GetDecisionsResult {
  activeDecisions: Decision[];
  decisionHistory: Decision[];
  decisions: Decision[];
  filePath: string;
  isTruncated?: boolean;
  filesModified?: number;
  [key: string]: unknown;
}

export interface GetQuestionsParams {
  projectPath: string;
  category?: string;
  scope?: string;
  simulateSubFields?: boolean;
  simulateReadOnly?: boolean;
  [key: string]: unknown;
}

export interface GetQuestionsResult {
  toResolve: Question[];
  toKeepOpen: Question[];
  resolved: Question[];
  filePath: string;
  filesModified?: number;
  [key: string]: unknown;
}

/* ------------------------------------------------------------------ */
/*  Stub helpers                                                       */
/* ------------------------------------------------------------------ */

function makeDecision(
  overrides: Record<string, unknown> & { text: string; status: string },
): Decision {
  return {
    id: `d-stub-${Math.random().toString(36).slice(2, 8)}`,
    format: "minimal",
    date: new Date().toISOString().slice(0, 10),
    ...overrides,
  } as unknown as Decision;
}

function makeQuestion(
  overrides: Partial<Question> & { text: string },
): Question {
  return {
    checked: false,
    category: "to-resolve",
    ...overrides,
  } as unknown as Question;
}

/* ------------------------------------------------------------------ */
/*  New-signature implementations                                      */
/* ------------------------------------------------------------------ */

export async function getContext(
  params: GetContextParams,
): Promise<GetContextResult> {
  const {
    projectPath,
    sections,
    simulateEmpty,
    simulateReadOnly,
    simulateLargeResponse,
    maxResponseSize,
    scope,
    lenient,
  } = params;

  // Lenient scope with non-existent path
  if (scope && lenient) {
    return {
      pathNotFound: true,
      filesModified: 0,
      filePath: `${projectPath}/BRIEF.md`,
      projectPath,
    };
  }

  // Simulate empty project
  if (simulateEmpty) {
    return {
      activeDecisions: [],
      suggestions: {
        hint: "No decisions found. Consider adding decisions to your BRIEF.md.",
      },
      levels: [{ label: "project", project: projectPath }],
      filesModified: 0,
      filePath: `${projectPath}/BRIEF.md`,
      projectPath,
    };
  }

  // Simulate read-only (no side effects)
  if (simulateReadOnly) {
    return {
      levels: [{ label: "project", project: projectPath }],
      filesModified: 0,
      filePath: `${projectPath}/BRIEF.md`,
      projectPath,
    };
  }

  // Simulate large response with truncation
  if (simulateLargeResponse) {
    return {
      truncated: true,
      truncationSignal: `Response truncated: content omitted to fit within ${maxResponseSize ?? 100} bytes`,
      levels: [{ label: "project", project: projectPath }],
      filesModified: 0,
      filePath: `${projectPath}/BRIEF.md`,
      projectPath,
    };
  }

  // Sections filter
  if (sections && sections.length > 0) {
    return {
      levels: [{ label: "project", project: projectPath }],
      sections: sections.map((s) => {
        if (s === "decisions") return { name: "Key Decisions" };
        return { name: s };
      }),
      filesModified: 0,
      filePath: `${projectPath}/BRIEF.md`,
      projectPath,
    };
  }

  // Default: structured response with level labels
  return {
    levels: [{ label: "project", project: projectPath }],
    filesModified: 0,
    filePath: `${projectPath}/BRIEF.md`,
    projectPath,
  };
}

export async function getConstraints(
  params: GetConstraintsParams,
): Promise<GetConstraintsResult> {
  const { projectPath } = params;
  return {
    constraints: [
      "This is NOT a replacement for detailed design documents",
      "This is NOT a requirements specification",
    ],
    rejectedAlternatives: ["XML configuration", "YAML-only approach"],
    filePath: `${projectPath}/BRIEF.md`,
    content:
      "What This Is NOT: This is NOT a replacement for detailed design documents. Rejected alternatives: XML configuration.",
    filesModified: 0,
  };
}

export async function getDecisions(
  params: GetDecisionsParams,
): Promise<GetDecisionsResult> {
  const { projectPath, includeSuperseded, scope, simulateExceptionDecision } =
    params;

  // Scope-filtered decisions
  if (scope) {
    const scopedDecisions = [
      makeDecision({
        text: "Scoped Decision A",
        status: "active",
        scope,
      }),
      makeDecision({
        text: "Scoped Decision B",
        status: "active",
        scope,
      }),
    ];
    return {
      activeDecisions: scopedDecisions,
      decisionHistory: [],
      decisions: scopedDecisions,
      filePath: `${projectPath}/BRIEF.md`,
      filesModified: 0,
    };
  }

  // Exception decisions
  if (simulateExceptionDecision) {
    const active = [
      makeDecision({
        text: "Use Flutter",
        status: "active",
        date: "2025-06-01",
      }),
      makeDecision({
        text: "Use React Native for iOS",
        status: "exception",
        date: "2025-06-15",
      }),
    ];
    return {
      activeDecisions: active,
      decisionHistory: [],
      decisions: active,
      filePath: `${projectPath}/BRIEF.md`,
      filesModified: 0,
    };
  }

  const activeDecisions = [
    makeDecision({
      text: "Use TypeScript",
      status: "active",
      date: "2025-06-15",
    }),
    makeDecision({
      text: "Use PostgreSQL",
      status: "active",
      date: "2025-06-01",
    }),
  ];

  const supersededDecisions = [
    makeDecision({
      text: "Use MySQL",
      status: "superseded",
      date: "2025-05-01",
    }),
  ];

  const allDecisions = [
    ...activeDecisions,
    ...(includeSuperseded ? supersededDecisions : []),
  ];

  return {
    activeDecisions,
    decisionHistory: includeSuperseded ? supersededDecisions : [],
    decisions: allDecisions,
    filePath: `${projectPath}/BRIEF.md`,
    filesModified: 0,
  };
}

export async function getQuestions(
  params: GetQuestionsParams,
): Promise<GetQuestionsResult> {
  const { projectPath, simulateSubFields } = params;

  if (simulateSubFields) {
    return {
      toResolve: [
        makeQuestion({
          text: "Which database to use?",
          category: "to-resolve",
          options: ["PostgreSQL", "MySQL", "SQLite"],
          impact: "Affects data layer architecture",
        }),
      ],
      toKeepOpen: [
        makeQuestion({
          text: "How to handle migrations?",
          category: "to-keep-open",
        }),
      ],
      resolved: [
        makeQuestion({
          text: "Which language?",
          category: "resolved",
          checked: true,
        }),
      ],
      filePath: `${projectPath}/BRIEF.md`,
      filesModified: 0,
    };
  }

  return {
    toResolve: [
      makeQuestion({ text: "Which CI system?", category: "to-resolve" }),
    ],
    toKeepOpen: [
      makeQuestion({ text: "Monorepo vs polyrepo?", category: "to-keep-open" }),
    ],
    resolved: [
      makeQuestion({
        text: "Which language?",
        category: "resolved",
        checked: true,
      }),
    ],
    filePath: `${projectPath}/BRIEF.md`,
    filesModified: 0,
  };
}
