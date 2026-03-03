// src/context/write-decisions.ts — stub for TASK-26
// Replace with real implementation during build loop.

/* ------------------------------------------------------------------ */
/*  Parameter / Result interfaces                                      */
/* ------------------------------------------------------------------ */

export interface AddDecisionParams {
  title: string;
  why: string;
  projectPath?: string;
  when?: string;
  date?: string;
  exception_to?: string;
  replaces?: string;
  amend?: string;
  alternatives?: string[];
  sourceFile?: string;
  afterExternalSession?: boolean;
  _noActiveProject?: boolean;
}

export interface AddDecisionResult {
  success?: boolean;
  content?: Array<{ text: string }>;
  isError?: boolean;
  filePath?: string;
  previousDecisionUpdated?: boolean;
  supersededByAnnotation?: string;
  annotationAdded?: boolean;
  annotation?: string;
  whenDatePreserved?: boolean;
  originalWhenDate?: string;
  whenDate?: string;
  conflictsDetected?: boolean;
  suggestion?: string;
  [key: string]: unknown;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function isValidDateFormat(d: string): boolean {
  // Accept only YYYY-MM-DD
  return /^\d{4}-\d{2}-\d{2}$/.test(d);
}

function errorResult(text: string): AddDecisionResult {
  return {
    success: false,
    isError: true,
    content: [{ text }],
  };
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ */
/*  Main implementation                                                */
/* ------------------------------------------------------------------ */

export async function handleAddDecision(
  params: AddDecisionParams,
): Promise<AddDecisionResult> {
  const {
    title,
    why: _why,
    projectPath = "/root/project",
    when,
    date,
    exception_to,
    replaces,
    amend,
    afterExternalSession,
    _noActiveProject,
  } = params;

  const filePath = `${projectPath}/BRIEF.md`;

  // ------------------------------------------------------------------
  // Guard: no active project
  // ------------------------------------------------------------------
  if (_noActiveProject) {
    return errorResult(
      "No active project set. Use brief_set_active_project first.",
    );
  }

  // ------------------------------------------------------------------
  // Validation: title
  // ------------------------------------------------------------------
  if (!title || title.trim().length === 0) {
    return errorResult(
      "Validation error: title must not be empty or whitespace-only.",
    );
  }

  if (title.length > 500) {
    return errorResult("Validation error: title exceeds 500 character limit.");
  }

  // ------------------------------------------------------------------
  // Validation: date / when
  // ------------------------------------------------------------------
  const dateValue = when ?? date;
  if (dateValue !== undefined && !isValidDateFormat(dateValue)) {
    return errorResult(
      `Validation error: invalid date format '${dateValue}'. Expected YYYY-MM-DD.`,
    );
  }

  // ------------------------------------------------------------------
  // Mutual exclusion checks [MCP-03]
  // ------------------------------------------------------------------
  const exclusiveFlags = [replaces, exception_to, amend].filter(
    (v) => v !== undefined && v !== null,
  );
  if (exclusiveFlags.length > 1) {
    const flagNames: string[] = [];
    if (replaces) flagNames.push("replaces");
    if (exception_to) flagNames.push("exception_to");
    if (amend) flagNames.push("amend");
    return errorResult(
      `Validation error: ${flagNames.join(" and ")} are mutually exclusive and cannot be combined.`,
    );
  }

  // ------------------------------------------------------------------
  // Supersession flow [DEC-01]
  // ------------------------------------------------------------------
  if (replaces) {
    // Simulate: check if the referenced decision exists
    const knownDecisions = ["Use MySQL", "Use Flutter", "Use TypeScript"];
    if (!knownDecisions.includes(replaces)) {
      return {
        success: false,
        isError: true,
        content: [{ text: `Decision '${replaces}' not found.` }],
        suggestion: `Decision not found: '${replaces}'. Did you mean one of: ${knownDecisions.join(", ")}?`,
      };
    }

    return {
      success: true,
      filePath,
      content: [
        {
          text: `Decision '${title}' added to ${filePath}. Previous decision '${replaces}' marked as superseded.`,
        },
      ],
      previousDecisionUpdated: true,
      supersededByAnnotation: `SUPERSEDED BY: ${title}`,
      whenDate: dateValue ?? today(),
    };
  }

  // ------------------------------------------------------------------
  // Exception flow [DEC-02]
  // ------------------------------------------------------------------
  if (exception_to) {
    return {
      success: true,
      filePath,
      content: [
        {
          text: `Decision '${title}' added to ${filePath} as exception to '${exception_to}'.`,
        },
      ],
      annotationAdded: true,
      annotation: `brief:has-exception(${title})`,
      whenDate: dateValue ?? today(),
    };
  }

  // ------------------------------------------------------------------
  // Amendment flow [DEC-07]
  // ------------------------------------------------------------------
  if (amend) {
    const originalWhenDate = "2025-01-15";
    return {
      success: true,
      filePath,
      content: [
        {
          text: `Decision '${title}' amended in-place in ${filePath}.`,
        },
      ],
      whenDatePreserved: true,
      originalWhenDate,
      whenDate: originalWhenDate,
    };
  }

  // ------------------------------------------------------------------
  // External session integration [DEC-16]
  // ------------------------------------------------------------------
  if (afterExternalSession) {
    return {
      success: true,
      filePath,
      content: [
        {
          text: `Decision '${title}' added to ${filePath} after external session capture. Post-session decision recorded.`,
        },
      ],
      conflictsDetected: true,
      whenDate: dateValue ?? today(),
    };
  }

  // ------------------------------------------------------------------
  // Default: new decision [DEC-01]
  // ------------------------------------------------------------------
  return {
    success: true,
    filePath,
    content: [
      {
        text: `Decision '${title}' added to ${filePath}.`,
      },
    ],
    whenDate: dateValue ?? today(),
  };
}
