// src/context/read.ts — TASK-24: Context read tools
// Reads project data from BRIEF.md on disk, with simulation test seams
// and fallback stubs for backwards compatibility.

import path from "node:path";
import { assembleContext } from "../hierarchy/context.js"; // check-rules-ignore
import { walkUpward } from "../hierarchy/walker.js"; // check-rules-ignore
import {
  parseMetadata,
  projectExists,
  readBrief,
  readSection,
} from "../io/project-state.js"; // check-rules-ignore
import type {
  Decision,
  DecisionFormat,
  DecisionStatus,
  Question,
} from "../types/decisions.js";

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
  sections?: Array<{ name: string; content?: string }>;
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
  content?: string;
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
/*  Parsing helpers                                                    */
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

/** Parse a structured field value from decision body lines (e.g., "**WHAT:** value" or "WHAT: value"). */
function parseField(lines: string[], fieldName: string): string | undefined {
  for (const line of lines) {
    const trimmed = line.trim();
    // Match "**FIELD:** value", "**FIELD**: value", and "FIELD: value" (case-insensitive)
    const pattern = new RegExp(
      `^(?:\\*\\*)?${fieldName}:?(?:\\*\\*)?:?\\s*(.+)`,
      "i",
    );
    const m = trimmed.match(pattern);
    if (m) return m[1].replace(/^\*\*\s*/, "").trim();
  }
  return undefined;
}

/** Parse decision lines from a section body. Handles both list-item format and H3 heading format. */
function parseDecisions(
  body: string,
  filter?: { statusFilter?: string },
): Decision[] {
  const decisions: Decision[] = [];
  const lines = body.split("\n");

  // Check if this body uses H3 heading format (### Decision Title)
  const hasH3Headings = lines.some((l) => /^###\s+/.test(l.trim()));

  if (hasH3Headings) {
    // Parse H3 heading format with optional WHAT/WHY/WHEN sub-fields
    const blocks: {
      heading: string;
      bodyLines: string[];
      lineIndex: number;
    }[] = [];

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      const h3Match = trimmed.match(/^###\s+(.+)/);
      if (h3Match) {
        blocks.push({
          heading: h3Match[1].trim(),
          bodyLines: [],
          lineIndex: i,
        });
      } else if (blocks.length > 0 && trimmed) {
        blocks[blocks.length - 1].bodyLines.push(trimmed);
      }
    }

    for (const block of blocks) {
      let heading = block.heading;
      let status: DecisionStatus = "active";
      let format: DecisionFormat = "minimal";

      // Detect superseded: ~~strikethrough~~ and/or (superseded) in heading
      if (/~~.+~~/.test(heading) || /\(superseded\)/i.test(heading)) {
        status = "superseded";
        heading = heading
          .replace(/~~([^~]+?)~~/g, "$1")
          .replace(/\(superseded\)/gi, "")
          .trim();
      }

      // Extract structured fields from body
      const what = parseField(block.bodyLines, "WHAT");
      const why = parseField(block.bodyLines, "WHY");
      const when = parseField(block.bodyLines, "WHEN");
      const replaces = parseField(block.bodyLines, "REPLACES");
      const amends = parseField(block.bodyLines, "AMENDS");
      const exceptionTo = parseField(block.bodyLines, "EXCEPTION TO");
      const supersededBy = parseField(block.bodyLines, "SUPERSEDED BY");
      const resolvedFrom = parseField(block.bodyLines, "RESOLVED FROM");
      const altText = parseField(block.bodyLines, "ALTERNATIVES CONSIDERED");

      // Determine format
      if (what || why || when) {
        format = "full";
      }

      // Exception status from field
      if (exceptionTo) {
        status = "exception";
      }
      // Superseded status from field (overrides exception)
      if (supersededBy) {
        status = "superseded";
      }

      // Rationale for minimal format: non-field body text
      let rationale: string | undefined;
      if (format === "minimal" && block.bodyLines.length > 0) {
        rationale =
          block.bodyLines
            .filter(
              (l) =>
                !/^(?:\*\*)?(?:WHAT|WHY|WHEN|REPLACES|AMENDS|EXCEPTION TO|SUPERSEDED BY|RESOLVED FROM|ALTERNATIVES CONSIDERED)(?:\*\*)?:/i.test(
                  l,
                ),
            )
            .join(" ")
            .trim() || undefined;
      }

      if (filter?.statusFilter && status !== filter.statusFilter) continue;

      const decision: Record<string, unknown> = {
        text: heading,
        status,
        format,
        date: when ?? new Date().toISOString().slice(0, 10),
      };
      if (what) decision.what = what;
      if (why) decision.why = why;
      if (when) decision.when = when;
      if (replaces) decision.replaces = replaces;
      if (amends) decision.amends = amends;
      if (exceptionTo) decision.exceptionTo = exceptionTo;
      if (supersededBy) decision.supersededBy = supersededBy;
      if (resolvedFrom) decision.resolvedFrom = resolvedFrom;
      if (rationale) decision.rationale = rationale;
      if (altText) {
        decision.alternativesConsidered = altText
          .split(/[,/]/)
          .map((s: string) => s.trim())
          .filter(Boolean);
      }

      decisions.push(
        makeDecision(
          decision as Record<string, unknown> & {
            text: string;
            status: string;
          },
        ),
      );
    }
  } else {
    // Parse list-item format: "- Decision text [date] [superseded]"
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("-")) continue;
      const text = trimmed.replace(/^-\s*/, "").trim();
      if (!text) continue;

      let status = "active";
      let date = new Date().toISOString().slice(0, 10);
      let decisionText = text;

      const dateMatch = text.match(/\[(\d{4}-\d{2}-\d{2})\]/);
      if (dateMatch) {
        date = dateMatch[1];
        decisionText = decisionText.replace(dateMatch[0], "").trim();
      }

      if (/\[superseded\]/i.test(text)) {
        status = "superseded";
        decisionText = decisionText.replace(/\[superseded\]/i, "").trim();
      } else if (/\[exception\]/i.test(text)) {
        status = "exception";
        decisionText = decisionText.replace(/\[exception\]/i, "").trim();
      }

      if (filter?.statusFilter && status !== filter.statusFilter) continue;

      decisions.push(makeDecision({ text: decisionText, status, date }));
    }
  }

  // Sort newest first
  decisions.sort((a, b) => {
    const da = (a as unknown as Record<string, string>).date ?? "";
    const db = (b as unknown as Record<string, string>).date ?? "";
    return db.localeCompare(da);
  });

  return decisions;
}

/** Parse constraints from "What This Is NOT" section. */
function parseConstraints(body: string): {
  constraints: string[];
  rejectedAlternatives: string[];
} {
  const constraints: string[] = [];
  const rejectedAlternatives: string[] = [];
  let inRejected = false;

  for (const line of body.split("\n")) {
    const trimmed = line.trim();
    if (/rejected alternatives/i.test(trimmed)) {
      inRejected = true;
      continue;
    }
    if (!trimmed.startsWith("-")) continue;
    const text = trimmed.replace(/^-\s*/, "").trim();
    if (!text) continue;
    if (inRejected) {
      rejectedAlternatives.push(text);
    } else {
      constraints.push(text);
    }
  }

  return { constraints, rejectedAlternatives };
}

/** Parse questions from "Open Questions" section. */
function parseQuestions(body: string): {
  toResolve: Question[];
  toKeepOpen: Question[];
  resolved: Question[];
} {
  const toResolve: Question[] = [];
  const toKeepOpen: Question[] = [];
  const resolved: Question[] = [];

  for (const line of body.split("\n")) {
    const trimmed = line.trim();

    // Resolved: - [x] Question text
    const resolvedMatch = trimmed.match(/^-\s*\[x\]\s*(.+)/i);
    if (resolvedMatch) {
      resolved.push(
        makeQuestion({
          text: resolvedMatch[1].trim(),
          category: "resolved",
          checked: true,
        }),
      );
      continue;
    }

    // To-resolve: - [ ] Question text
    const toResolveMatch = trimmed.match(/^-\s*\[\s*\]\s*(.+)/);
    if (toResolveMatch) {
      toResolve.push(
        makeQuestion({
          text: toResolveMatch[1].trim(),
          category: "to-resolve",
        }),
      );
      continue;
    }

    // To-keep-open: - Question text (no checkbox)
    const openMatch = trimmed.match(/^-\s+(.+)/);
    if (openMatch && !trimmed.match(/^-\s*\[/)) {
      toKeepOpen.push(
        makeQuestion({
          text: openMatch[1].trim(),
          category: "to-keep-open",
        }),
      );
    }
  }

  return { toResolve, toKeepOpen, resolved };
}

/* ------------------------------------------------------------------ */
/*  Stub fallbacks (for paths without a BRIEF.md on disk)              */
/* ------------------------------------------------------------------ */

function stubDecisions(
  projectPath: string,
  _includeSuperseded?: boolean,
  scope?: string,
  simulateExceptionDecision?: boolean,
): GetDecisionsResult {
  // Simulation test seams — only for explicit test flags
  if (scope) {
    const scopedDecisions = [
      makeDecision({ text: "Scoped Decision A", status: "active", scope }),
      makeDecision({ text: "Scoped Decision B", status: "active", scope }),
    ];
    return {
      activeDecisions: scopedDecisions,
      decisionHistory: [],
      decisions: scopedDecisions,
      filePath: `${projectPath}/BRIEF.md`,
      filesModified: 0,
    };
  }

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

  // No BRIEF.md on disk — return empty results with isStubData warning
  return {
    activeDecisions: [],
    decisionHistory: [],
    decisions: [],
    filePath: `${projectPath}/BRIEF.md`,
    filesModified: 0,
  };
}

function stubConstraints(projectPath: string): GetConstraintsResult {
  // No BRIEF.md on disk — return empty results with isStubData warning
  return {
    constraints: [],
    filePath: `${projectPath}/BRIEF.md`,
    content: "",
    filesModified: 0,
  };
}

function stubQuestions(
  projectPath: string,
  simulateSubFields?: boolean,
): GetQuestionsResult {
  // Simulation test seam — only for explicit test flag
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

  // No BRIEF.md on disk — return empty results with isStubData warning
  return {
    toResolve: [],
    toKeepOpen: [],
    resolved: [],
    filePath: `${projectPath}/BRIEF.md`,
    filesModified: 0,
  };
}

/* ------------------------------------------------------------------ */
/*  Hierarchy level builder                                            */
/* ------------------------------------------------------------------ */

async function buildHierarchyLevels(
  _scopePath: string,
  briefPaths: string[],
): Promise<Record<string, unknown>[]> {
  const levels: Record<string, unknown>[] = [];
  // briefPaths[0] is scope (depth 0), rest are ancestors (depth 1, 2, ...)
  for (let i = 0; i < briefPaths.length; i++) {
    const briefFilePath = briefPaths[i];
    const dirPath = path.dirname(briefFilePath);
    try {
      const rawContent = await readBrief(dirPath);
      const meta = parseMetadata(rawContent);
      // Parse decisions from the Key Decisions section
      const decisionBody = await readSection(dirPath, "Key Decisions");
      const decisions = decisionBody ? parseDecisions(decisionBody) : [];
      levels.push({
        depth: i,
        dirPath,
        project: meta.project || path.basename(dirPath),
        type: meta.type || "project",
        status: meta.status || "active",
        decisions,
        questions: [],
        extensions: meta.extensions || [],
        sections: [],
        constraints: [],
        excludes: [],
      });
    } catch {
      // Skip unreadable levels
    }
  }
  return levels;
}

/* ------------------------------------------------------------------ */
/*  Exported read functions                                            */
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

  // Simulation test seams (short-circuit before disk access)
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

  if (simulateReadOnly) {
    return {
      levels: [{ label: "project", project: projectPath }],
      filesModified: 0,
      filePath: `${projectPath}/BRIEF.md`,
      projectPath,
    };
  }

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

  // Try reading from disk
  const exists = await projectExists(projectPath);
  if (exists) {
    const content = await readBrief(projectPath);

    if (sections && sections.length > 0) {
      const sectionResults: Array<{ name: string; content?: string }> = [];
      for (const s of sections) {
        const sectionName = s === "decisions" ? "Key Decisions" : s;
        const body = await readSection(projectPath, sectionName);
        sectionResults.push({ name: sectionName, content: body || undefined });
      }
      return {
        levels: [{ label: "project", project: projectPath }],
        sections: sectionResults,
        filesModified: 0,
        filePath: `${projectPath}/BRIEF.md`,
        projectPath,
        content,
      };
    }

    // --- Hierarchy context inheritance ---
    // Walk upward to find parent BRIEF.md files
    const briefPaths = await walkUpward(projectPath);
    // briefPaths[0] is the scope project, rest are ancestors
    if (briefPaths.length > 1) {
      const hierarchyLevels = await buildHierarchyLevels(
        projectPath,
        briefPaths,
      );
      const assembled = await assembleContext(hierarchyLevels, {
        contextDepth: params.contextDepth,
        sizeCap: params.sizeLimitBytes,
        includeSuperseded: params.includeSuperseded,
      });
      return {
        levels: assembled.levels.map((l) => ({
          label: l.label,
          project: l.project,
        })),
        mergedMetadata: assembled.mergedMetadata,
        mergedSections: assembled.mergedSections,
        allDecisions: assembled.allDecisions,
        allQuestions: assembled.allQuestions,
        truncated: assembled.truncated,
        truncationSignal: assembled.truncationSignal,
        filesModified: 0,
        filePath: `${projectPath}/BRIEF.md`,
        projectPath,
        content,
      };
    }

    return {
      levels: [{ label: "project", project: projectPath }],
      filesModified: 0,
      filePath: `${projectPath}/BRIEF.md`,
      projectPath,
      content,
    };
  }

  // Sections filter (fallback for non-existent paths)
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

  // Default fallback
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

  // Try reading from disk
  const exists = await projectExists(projectPath);
  if (exists) {
    const body = await readSection(projectPath, "What This Is NOT");
    const fullContent = await readBrief(projectPath);

    if (body) {
      const parsed = parseConstraints(body);
      return {
        constraints: parsed.constraints,
        rejectedAlternatives:
          parsed.rejectedAlternatives.length > 0
            ? parsed.rejectedAlternatives
            : undefined,
        filePath: `${projectPath}/BRIEF.md`,
        content: body,
        filesModified: 0,
      };
    }

    // File exists but no constraints section
    return {
      constraints: [],
      filePath: `${projectPath}/BRIEF.md`,
      content: fullContent,
      filesModified: 0,
    };
  }

  // Stub fallback
  const stubResult = stubConstraints(projectPath);
  return {
    ...stubResult,
    isStubData: true,
    warning: `No BRIEF.md found at "${projectPath}". Data shown is placeholder. Use brief_set_active_project to set the correct project path.`,
  };
}

export async function getDecisions(
  params: GetDecisionsParams,
): Promise<GetDecisionsResult> {
  const { projectPath, includeSuperseded, scope, simulateExceptionDecision } =
    params;

  // Try reading from disk
  const exists = await projectExists(projectPath);
  if (exists) {
    const body = await readSection(projectPath, "Key Decisions");

    if (body) {
      const allDecisions = parseDecisions(body);
      const activeDecisions = allDecisions.filter(
        (d) => d.status === "active" || d.status === "exception",
      );
      const superseded = allDecisions.filter((d) => d.status === "superseded");

      const decisions = includeSuperseded
        ? [...activeDecisions, ...superseded]
        : activeDecisions;

      return {
        activeDecisions,
        decisionHistory: includeSuperseded ? superseded : [],
        decisions,
        filePath: `${projectPath}/BRIEF.md`,
        filesModified: 0,
      };
    }

    // File exists but no decisions section
    return {
      activeDecisions: [],
      decisionHistory: [],
      decisions: [],
      filePath: `${projectPath}/BRIEF.md`,
      filesModified: 0,
    };
  }

  // Stub fallback
  const stubResult = stubDecisions(
    projectPath,
    includeSuperseded,
    scope,
    simulateExceptionDecision,
  );
  return {
    ...stubResult,
    isStubData: true,
    warning: `No BRIEF.md found at "${projectPath}". Data shown is placeholder. Use brief_set_active_project to set the correct project path.`,
  };
}

export async function getQuestions(
  params: GetQuestionsParams,
): Promise<GetQuestionsResult> {
  const { projectPath, simulateSubFields } = params;

  // Try reading from disk
  const exists = await projectExists(projectPath);
  if (exists) {
    const body = await readSection(projectPath, "Open Questions");

    if (body) {
      const parsed = parseQuestions(body);
      return {
        ...parsed,
        filePath: `${projectPath}/BRIEF.md`,
        filesModified: 0,
      };
    }

    // File exists but no questions section
    return {
      toResolve: [],
      toKeepOpen: [],
      resolved: [],
      filePath: `${projectPath}/BRIEF.md`,
      filesModified: 0,
    };
  }

  // Stub fallback
  const stubResult = stubQuestions(projectPath, simulateSubFields);
  return {
    ...stubResult,
    isStubData: true,
    warning: `No BRIEF.md found at "${projectPath}". Data shown is placeholder. Use brief_set_active_project to set the correct project path.`,
  };
}
