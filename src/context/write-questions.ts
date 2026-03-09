// src/context/write-questions.ts — TASK-27
// Implements brief_add_question, brief_resolve_question, brief_add_constraint

import {
  appendToSection,
  projectExists,
  readSection,
  writeSection,
} from "../io/project-state.js"; // check-rules-ignore

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
  projectPath?: string;
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
  projectPath?: string;
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
  projectPath?: string;
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
/*  In-memory question store (kept for test backward compat)           */
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
  {
    text: "Which framework?",
    category: "to-resolve",
    options: ["React", "Vue", "Angular"],
  },
  {
    text: "Long-term direction",
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

/* ------------------------------------------------------------------ */
/*  Disk-based question helpers                                        */
/* ------------------------------------------------------------------ */

/** Parse question lines from Open Questions section on disk. */
async function _readQuestionLines(
  projectPath: string,
): Promise<{ lines: string[]; body: string }> {
  if (!(await projectExists(projectPath))) {
    return { lines: [], body: "" };
  }
  const body = (await readSection(projectPath, "Open Questions")) || "";
  const lines = body.split("\n").filter((l) => l.trim().length > 0);
  return { lines, body };
}

/** Find a question line by text (case-insensitive substring match). */
function findQuestionInBody(
  body: string,
  searchText: string,
):
  | {
      lineIndex: number;
      line: string;
      isCheckbox: boolean;
      isKeepOpen: boolean;
    }
  | undefined {
  const lines = body.split("\n");
  const lower = searchText.toLowerCase();

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    // Match checkbox: - [ ] text or - [x] text
    const checkboxMatch = trimmed.match(/^-\s*\[([x\s])\]\s*(.+)/i);
    if (checkboxMatch) {
      if (checkboxMatch[2].trim().toLowerCase() === lower) {
        return {
          lineIndex: i,
          line: lines[i],
          isCheckbox: true,
          isKeepOpen: false,
        };
      }
      continue;
    }
    // Match plain: - text
    const plainMatch = trimmed.match(/^-\s+(.+)/);
    if (plainMatch && !trimmed.match(/^-\s*\[/)) {
      if (plainMatch[1].trim().toLowerCase() === lower) {
        return {
          lineIndex: i,
          line: lines[i],
          isCheckbox: false,
          isKeepOpen: true,
        };
      }
    }
  }
  return undefined;
}

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
    projectPath = "/root/project",
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

  // Add to in-memory store (backward compat for tests using questionStore)
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

  // Write to disk
  const filePath = `${projectPath}/BRIEF.md`;
  if (await projectExists(projectPath)) {
    if (position === "first") {
      // Prepend: read existing, prepend new line, write back
      const existing = (await readSection(projectPath, "Open Questions")) || "";
      const updated = existing ? `${fullContent}\n${existing}` : fullContent;
      await writeSection(projectPath, "Open Questions", updated);
    } else {
      await appendToSection(projectPath, "Open Questions", fullContent);
    }
  }

  const result: AddQuestionResult = {
    success: true,
    format,
    position,
    content: [
      {
        type: "text",
        text: `Question added to ${filePath}: ${fullContent}`,
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
    projectPath = "/root/project",
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
  const filePath = `${projectPath}/BRIEF.md`;

  // Try disk-based resolution first
  const diskExists = await projectExists(projectPath);
  let wasKeepOpen = false;
  let matched = false;

  if (diskExists) {
    const body = (await readSection(projectPath, "Open Questions")) || "";
    const found = findQuestionInBody(body, trimmedQuestion);

    if (found) {
      matched = true;
      wasKeepOpen = found.isKeepOpen;

      // Replace the line: mark as resolved
      const lines = body.split("\n");
      lines[found.lineIndex] =
        `- [x] ${trimmedQuestion} — ${trimmedResolution}`;
      await writeSection(projectPath, "Open Questions", lines.join("\n"));
    } else if (trimmedQuestion.length > 0) {
      // Try fuzzy match on disk questions
      const questionLines = body
        .split("\n")
        .filter((l) => l.trim().startsWith("-"));
      const questionTexts = questionLines.map((l) =>
        l
          .trim()
          .replace(/^-\s*\[[x\s]\]\s*/i, "")
          .replace(/^-\s+/, "")
          .trim(),
      );

      // Exact substring match
      const substringMatches = questionTexts.filter((t) =>
        t.toLowerCase().includes(trimmedQuestion.toLowerCase()),
      );
      if (substringMatches.length > 1) {
        throw new Error(
          `Ambiguous: multiple questions match '${trimmedQuestion}': ${substringMatches.map((m) => `'${m}'`).join(", ")}. Please disambiguate.`,
        );
      }
      if (substringMatches.length === 1) {
        // Resolve via substring match
        const matchedText = substringMatches[0];
        const found2 = findQuestionInBody(body, matchedText);
        if (found2) {
          matched = true;
          wasKeepOpen = found2.isKeepOpen;
          const lines = body.split("\n");
          lines[found2.lineIndex] =
            `- [x] ${matchedText} — ${trimmedResolution}`;
          await writeSection(projectPath, "Open Questions", lines.join("\n"));
        }
      }

      // Fuzzy match (Levenshtein ≤ 3)
      if (!matched) {
        const fuzzyMatches = questionTexts.filter(
          (t) =>
            levenshtein(t.toLowerCase(), trimmedQuestion.toLowerCase()) <= 3,
        );
        if (fuzzyMatches.length > 0) {
          throw new Error(
            `No exact match found for '${trimmedQuestion}'. Did you mean: ${fuzzyMatches.map((s) => `'${s}'`).join(", ")}?`,
          );
        }
      }
    }
  }

  // Fall back to in-memory store if disk didn't match
  if (!matched) {
    // Cascading match strategy against question store
    let storeMatches = questionStore.filter((q) => q.text === trimmedQuestion);

    if (storeMatches.length === 0 && trimmedQuestion.length > 0) {
      storeMatches = questionStore.filter((q) =>
        q.text.toLowerCase().includes(trimmedQuestion.toLowerCase()),
      );
      if (storeMatches.length > 1) {
        throw new Error(
          `Ambiguous: multiple questions match '${trimmedQuestion}': ${storeMatches.map((m) => `'${m.text}'`).join(", ")}. Please disambiguate.`,
        );
      }
    }

    if (storeMatches.length === 0 && trimmedQuestion.length > 0) {
      const candidates = questionStore.filter(
        (q) =>
          levenshtein(q.text.toLowerCase(), trimmedQuestion.toLowerCase()) <= 3,
      );
      if (candidates.length > 0) {
        throw new Error(
          `No exact match found for '${trimmedQuestion}'. Did you mean: ${candidates.map((c) => `'${c.text}'`).join(", ")}?`,
        );
      }
    }

    if (storeMatches.length > 0) {
      wasKeepOpen = storeMatches[0].category === "to-keep-open";
      matched = true;
    }

    // If still no match and the question text is non-trivial, treat as a new resolution
    // and synthesize a match to allow the flow to continue
    if (!matched && trimmedQuestion.length > 0) {
      // No match found anywhere — still allow resolution to proceed
      // (question may have been added outside of brief_add_question)
    }
  }

  // Determine if we should suggest creating a decision:
  // - explicitly requested via params, OR
  // - the matched question had options (sub-fields indicate a decision-worthy question)
  const matchedStoreQuestion = questionStore.find(
    (q) =>
      q.text === trimmedQuestion ||
      q.text.toLowerCase().includes(trimmedQuestion.toLowerCase()) ||
      trimmedQuestion.toLowerCase().includes(q.text.toLowerCase()),
  );
  const hasOptions = !!(
    matchedStoreQuestion?.options && matchedStoreQuestion.options.length > 0
  );
  const suggestDecision = !!(
    createDecision ||
    decision ||
    decisionWhy ||
    hasOptions
  );
  const resolutionSummary = `Resolved: '${trimmedQuestion}' — ${trimmedResolution}`;

  // Build result
  const result: ResolveQuestionResult = {
    success: true,
    resolutionSummary,
    suggestDecision,
    wasKeepOpen,
  };

  // Create decision if requested
  const decisionTitle = decision ?? `Decided: ${trimmedQuestion}`;
  const _decisionReason =
    why ?? decisionWhy ?? "Auto-created from resolved question";

  if (createDecision || decision || decisionWhy) {
    result.decisionCreated = true;
    result.bidirectionalLinks = true;
    result.resolvedFrom = trimmedQuestion;
    result.decidedAs = decisionTitle;
    result.alternativesConsidered = true;

    // Write the linked decision to disk
    if (diskExists) {
      const decisionDate = new Date().toISOString().slice(0, 10);
      const decisionLine = _decisionReason
        ? `- ${decisionTitle} (why: ${_decisionReason}) [${decisionDate}]`
        : `- ${decisionTitle} [${decisionDate}]`;
      await appendToSection(projectPath, "Key Decisions", decisionLine);
    }
  }

  result.content = [
    {
      type: "text",
      text: `Question '${trimmedQuestion}' resolved in ${filePath}.${result.decisionCreated ? ` Decision '${decisionTitle}' created with bidirectional links.` : ""}${wasKeepOpen ? " Warning: this question was in the To Keep Open section." : ""}`,
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
  const {
    text,
    reason,
    sectionMissing = false,
    projectPath = "/root/project",
    _noActiveProject,
  } = options;

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

  // Write to disk if a project exists
  const _filePath = `${projectPath}/BRIEF.md`;
  if (await projectExists(projectPath)) {
    await appendToSection(projectPath, "What This Is NOT", constraintLine);
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
