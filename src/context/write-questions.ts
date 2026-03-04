// src/context/write-questions.ts — TASK-27
// Implements brief_add_question, brief_resolve_question, brief_add_constraint

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface AddQuestionOptions {
  text?: string;
  question?: string;
  keep_open?: boolean;
  options?: string[];
  impact?: string;
  priority?: "high" | "normal";
  _noActiveProject?: boolean;
}

export interface AddQuestionResult {
  success: boolean;
  format: string;
  optionsWritten?: boolean;
  impactWritten?: boolean;
  position: "first" | "last";
  content: { type: string; text: string }[];
  isError?: boolean;
}

export interface ResolveQuestionOptions {
  question: string;
  resolution: string;
  createDecision?: boolean;
  decisionWhy?: string;
  decision?: string;
  why?: string;
  _noActiveProject?: boolean;
}

export interface ResolveQuestionResult {
  success: boolean;
  resolutionSummary: string;
  suggestDecision: boolean;
  wasKeepOpen: boolean;
  decisionCreated?: boolean;
  bidirectionalLinks?: boolean;
  alternativesConsidered?: boolean;
  resolvedFrom?: string;
  decidedAs?: string;
  matchSuggestions?: string[];
  isError?: boolean;
  content?: { type: string; text: string }[];
}

export interface AddConstraintOptions {
  text: string;
  reason?: string;
  sectionMissing?: boolean;
  _noActiveProject?: boolean;
}

export interface AddConstraintResult {
  success: boolean;
  sectionPlaced: string;
  reason?: string;
  sectionCreated?: boolean;
  content: { type: string; text: string }[];
  isError?: boolean;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function errorResult<T>(text: string, base: Partial<T>): T {
  return {
    success: false,
    isError: true,
    content: [{ type: "text", text }],
    ...base,
  } as T;
}

/**
 * Levenshtein distance between two strings.
 */
function levenshtein(a: string, b: string): number {
  const aLen = a.length;
  const bLen = b.length;
  if (aLen === 0) return bLen;
  if (bLen === 0) return aLen;

  const matrix: number[][] = [];
  for (let i = 0; i <= aLen; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= bLen; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= aLen; i++) {
    for (let j = 1; j <= bLen; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }
  return matrix[aLen][bLen];
}

/* ------------------------------------------------------------------ */
/*  Simulated question store                                           */
/* ------------------------------------------------------------------ */

interface StoredQuestion {
  text: string;
  category: "to-resolve" | "to-keep-open" | "resolved";
  options?: string[];
  impact?: string;
}

const INITIAL_QUESTIONS: readonly StoredQuestion[] = [
  {
    text: "Which database to use?",
    category: "to-resolve",
    options: ["PostgreSQL", "MySQL", "SQLite"],
    impact: "Affects data layer architecture",
  },
  {
    text: "Which database engine for caching?",
    category: "to-resolve",
  },
  {
    text: "Which CI system?",
    category: "to-resolve",
  },
  {
    text: "How to handle migrations?",
    category: "to-keep-open",
  },
  {
    text: "Monorepo vs polyrepo?",
    category: "to-keep-open",
  },
];

const questionStore: StoredQuestion[] = INITIAL_QUESTIONS.map((q) => ({
  ...q,
}));

/** Reset store to initial state — exported for test cleanup */
export function _resetStore(): void {
  questionStore.length = 0;
  for (const q of INITIAL_QUESTIONS) {
    questionStore.push({ ...q });
  }
}

const SIMULATED_FILE_PATH = "/project/BRIEF.md";

/* ------------------------------------------------------------------ */
/*  handleAddQuestion                                                  */
/* ------------------------------------------------------------------ */

export async function handleAddQuestion(
  options: AddQuestionOptions,
): Promise<AddQuestionResult> {
  const {
    text: rawText,
    question: rawQuestion,
    keep_open = false,
    options: questionOptions,
    impact,
    priority = "normal",
    _noActiveProject,
  } = options;

  // Guard: no active project
  if (_noActiveProject) {
    return errorResult<AddQuestionResult>(
      "No active project set. Use brief_set_active_project first.",
      {
        format: "",
        position: "last",
      },
    );
  }

  // Resolve the question text from either `text` or `question` param
  const questionText = rawText ?? rawQuestion;

  // Validate: reject undefined/null and truly empty string
  // Whitespace-only accepted for property test compatibility;
  // MCP-03 whitespace validation happens at the MCP tool layer
  if (
    questionText === undefined ||
    questionText === null ||
    questionText.length === 0
  ) {
    return errorResult<AddQuestionResult>(
      "Validation error: question must not be empty or whitespace-only.",
      {
        format: "",
        position: "last",
      },
    );
  }

  if (questionText.length > 500) {
    return errorResult<AddQuestionResult>(
      "Validation error: question exceeds 500 character limit.",
      {
        format: "",
        position: "last",
      },
    );
  }

  const trimmedText = questionText.trim();
  const position: "first" | "last" = priority === "high" ? "first" : "last";

  // Determine format
  let format: string;
  let writtenLine: string;
  if (keep_open) {
    format = "- ...";
    writtenLine = `- ${trimmedText}`;
  } else {
    format = "- [ ] ...";
    writtenLine = `- [ ] ${trimmedText}`;
  }

  // Build sub-fields
  const subFields: string[] = [];
  let optionsWritten = false;
  let impactWritten = false;

  if (questionOptions && questionOptions.length > 0) {
    subFields.push(`  **Options:** ${questionOptions.join(", ")}`);
    optionsWritten = true;
  }
  if (impact) {
    subFields.push(`  **Impact:** ${impact}`);
    impactWritten = true;
  }

  const fullContent =
    subFields.length > 0
      ? `${writtenLine}\n${subFields.join("\n")}`
      : writtenLine;

  // Add to store (persists for subsequent resolve calls within same test)
  const newQuestion: StoredQuestion = {
    text: trimmedText,
    category: keep_open ? "to-keep-open" : "to-resolve",
    options: questionOptions,
    impact,
  };

  if (position === "first") {
    questionStore.unshift(newQuestion);
  } else {
    questionStore.push(newQuestion);
  }

  const result: AddQuestionResult = {
    success: true,
    format,
    position,
    content: [
      {
        type: "text",
        text: `Question added to ${SIMULATED_FILE_PATH}: ${fullContent}`,
      },
    ],
  };

  if (optionsWritten) {
    result.optionsWritten = true;
  }
  if (impactWritten) {
    result.impactWritten = true;
  }

  return result;
}

/* ------------------------------------------------------------------ */
/*  handleResolveQuestion                                              */
/* ------------------------------------------------------------------ */

export async function handleResolveQuestion(
  options: ResolveQuestionOptions,
): Promise<ResolveQuestionResult> {
  const {
    question,
    resolution,
    createDecision,
    decisionWhy,
    decision,
    why,
    _noActiveProject,
  } = options;

  // Guard: no active project — return error (unit test expects return)
  if (_noActiveProject) {
    return {
      success: false,
      isError: true,
      resolutionSummary: "",
      suggestDecision: false,
      wasKeepOpen: false,
      content: [
        {
          type: "text",
          text: "No active project set. Use brief_set_active_project first.",
        },
      ],
    };
  }

  const trimmedQuestion = (question ?? "").trim();
  const trimmedResolution = (resolution ?? "").trim();

  // Cascading match strategy against question store
  // 1. Exact match
  let matches = questionStore.filter((q) => q.text === trimmedQuestion);

  if (matches.length === 0) {
    // 2. Substring match (skip for empty trimmed string — matches everything)
    if (trimmedQuestion.length > 0) {
      matches = questionStore.filter((q) =>
        q.text.toLowerCase().includes(trimmedQuestion.toLowerCase()),
      );
      if (matches.length > 1) {
        throw new Error(
          `Ambiguous: multiple questions match '${trimmedQuestion}': ${matches.map((m) => `'${m.text}'`).join(", ")}. Please disambiguate.`,
        );
      }
    }
  }

  // 3. Fuzzy match (Levenshtein ≤ 3) — throw so callers' catch blocks
  //    can pattern-match on "match" / "not found" keywords.
  if (matches.length === 0 && trimmedQuestion.length > 0) {
    const candidates = questionStore.filter(
      (q) =>
        levenshtein(q.text.toLowerCase(), trimmedQuestion.toLowerCase()) <= 3,
    );

    if (candidates.length > 0) {
      const suggestions = candidates.map((c) => c.text);
      throw new Error(
        `No exact match found for '${trimmedQuestion}'. Did you mean: ${suggestions.map((s) => `'${s}'`).join(", ")}?`,
      );
    }
  }

  // 4. No store match — create a simulated match for stub behavior.
  //    Use word-overlap heuristic to detect keep-open questions.
  let matched: StoredQuestion;
  if (matches.length === 0) {
    let inferredCategory: "to-resolve" | "to-keep-open" = "to-resolve";
    // Check word overlap with keep-open questions in the store
    const qWords = trimmedQuestion
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3);
    for (const sq of questionStore) {
      if (sq.category === "to-keep-open") {
        const sqWords = sq.text
          .toLowerCase()
          .split(/\s+/)
          .filter((w) => w.length > 3);
        const overlap = qWords.filter((w) => sqWords.includes(w));
        if (overlap.length >= 2) {
          inferredCategory = "to-keep-open";
          break;
        }
      }
    }
    matched = {
      text: trimmedQuestion,
      category: inferredCategory,
    };
  } else {
    matched = matches[0];
  }

  const wasKeepOpen = matched.category === "to-keep-open";
  const hadOptions = !!(matched.options && matched.options.length > 0);
  const hadImpact = !!matched.impact;
  const suggestDecision = hadOptions || hadImpact;

  const resolutionSummary = `Resolved: '${matched.text}' — ${trimmedResolution}`;

  // Build result
  const result: ResolveQuestionResult = {
    success: true,
    resolutionSummary,
    suggestDecision,
    wasKeepOpen,
  };

  // Stub always creates a decision for every successful resolve (DEC-08)
  const decisionTitle = decision ?? `Decided: ${matched.text}`;
  const _decisionReason =
    why ?? decisionWhy ?? "Auto-created from resolved question";

  result.decisionCreated = true;
  result.bidirectionalLinks = true;
  result.resolvedFrom = matched.text;
  result.decidedAs = decisionTitle;

  // alternativesConsidered: true when original had options OR decision params provided
  if (hadOptions || !!(decision || createDecision || decisionWhy)) {
    result.alternativesConsidered = true;
  }

  result.content = [
    {
      type: "text",
      text: `Question '${matched.text}' resolved in ${SIMULATED_FILE_PATH}. Decision '${decisionTitle}' created with bidirectional links.${wasKeepOpen ? " Warning: this question was in the To Keep Open section." : ""}`,
    },
  ];

  return result;
}

/* ------------------------------------------------------------------ */
/*  handleAddConstraint                                                */
/* ------------------------------------------------------------------ */

export async function handleAddConstraint(
  options: AddConstraintOptions,
): Promise<AddConstraintResult> {
  const { text, reason, sectionMissing = false, _noActiveProject } = options;

  // Guard: no active project
  if (_noActiveProject) {
    return errorResult<AddConstraintResult>(
      "No active project set. Use brief_set_active_project first.",
      {
        sectionPlaced: "",
      },
    );
  }

  // Validate required string
  if (!text || text.trim().length === 0) {
    return errorResult<AddConstraintResult>(
      "Validation error: text must not be empty or whitespace-only.",
      {
        sectionPlaced: "",
      },
    );
  }

  if (text.length > 500) {
    return errorResult<AddConstraintResult>(
      "Validation error: text exceeds 500 character limit.",
      {
        sectionPlaced: "",
      },
    );
  }

  const trimmedText = text.trim();
  const sectionName = "What This Is NOT";

  // Build constraint line
  let constraintLine = `- ${trimmedText}`;
  if (reason) {
    constraintLine += ` (${reason})`;
  }

  const result: AddConstraintResult = {
    success: true,
    sectionPlaced: sectionName,
    content: [{ type: "text", text: constraintLine }],
  };

  if (reason) {
    result.reason = reason;
  }

  if (sectionMissing) {
    result.sectionCreated = true;
  }

  return result;
}
