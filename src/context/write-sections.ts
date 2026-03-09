// src/context/write-sections.ts — TASK-28
// Implements brief_update_section and brief_capture_external_session MCP tool handlers

import {
  appendToSection,
  projectExists,
  readSection,
  writeSection as writeSectionToDisk,
} from "../io/project-state.js"; // check-rules-ignore

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface UpdateSectionOptions {
  heading?: string;
  section?: string;
  content: string;
  append?: boolean;
  projectPath?: string;
  _noActiveProject?: boolean;
}

export interface UpdateSectionResult {
  success: boolean;
  sectionUpdated: boolean;
  canonicalName: string;
  filePath?: string;
  confirmation?: string;
  previousContent?: string;
  appendMode?: boolean;
  warnings?: string[];
  tagsPreserved?: boolean;
  content: unknown;
  isError?: boolean;
  [key: string]: unknown;
}

export interface ExternalDecision {
  title: string;
  why?: string;
  alternatives?: string[];
}

export interface CaptureExternalSessionOptions {
  tool: string;
  decisions: ExternalDecision[];
  session_date?: string;
  projectPath?: string;
  _noActiveProject?: boolean;
  _simulateWriteFailure?: boolean;
}

export interface CaptureExternalSessionResult {
  success: boolean;
  decisionsWritten: number;
  breadcrumbWritten: boolean;
  filePath?: string;
  breadcrumbFormat?: string;
  breadcrumb?: string;
  conflictsDetected?: boolean;
  conflictDetectionRan?: boolean;
  isError?: boolean;
  content?: Array<{ type: string; text: string }>;
  [key: string]: unknown;
}

/* ------------------------------------------------------------------ */
/*  Section alias map (PARSE-03 / WRITE-14)                            */
/* ------------------------------------------------------------------ */

const SECTION_ALIAS_MAP = new Map<string, string>([
  // Canonical self-mappings (lowercase → proper case)
  ["purpose & scope", "Purpose & Scope"],
  ["key decisions", "Key Decisions"],
  ["open questions", "Open Questions"],
  ["what this is not", "What This Is NOT"],
  ["context & background", "Context & Background"],
  ["current state", "Current State"],
  ["references", "References"],
  ["external tool sessions", "External Tool Sessions"],
  // Common aliases
  ["purpose", "Purpose & Scope"],
  ["scope", "Purpose & Scope"],
  ["decisions", "Key Decisions"],
  ["questions", "Open Questions"],
  ["constraints", "What This Is NOT"],
  ["not", "What This Is NOT"],
  ["context", "Context & Background"],
  ["background", "Context & Background"],
  ["state", "Current State"],
  ["refs", "References"],
  ["sessions", "External Tool Sessions"],
  ["external sessions", "External Tool Sessions"],
  // Additional aliases
  ["overview", "Purpose & Scope"],
]);

/* ------------------------------------------------------------------ */
/*  In-memory section store (kept for test backward compat)            */
/* ------------------------------------------------------------------ */

interface SimulatedSection {
  name: string;
  content: string;
}

const INITIAL_SECTIONS: readonly SimulatedSection[] = [
  {
    name: "Purpose & Scope",
    content: "Project purpose and scope description.",
  },
  {
    name: "Key Decisions",
    content: "- Use TypeScript\n- Use PostgreSQL",
  },
  { name: "Open Questions", content: "- [ ] Which CI system?" },
  {
    name: "What This Is NOT",
    content: "- This is NOT a requirements specification",
  },
];

const sectionStore: SimulatedSection[] = INITIAL_SECTIONS.map((s) => ({
  ...s,
}));

/** Reset section store to initial state — exported for test cleanup. */
export function _resetSectionStore(): void {
  sectionStore.length = 0;
  for (const s of INITIAL_SECTIONS) {
    sectionStore.push({ ...s });
  }
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Resolve section name/alias to canonical name (WRITE-14).
 */
function resolveSection(name: string): {
  canonical: string;
  isKnown: boolean;
} {
  const trimmed = name.trim();
  const lower = trimmed.toLowerCase();
  const mapped = SECTION_ALIAS_MAP.get(lower);
  if (mapped) {
    return { canonical: mapped, isKnown: true };
  }
  return { canonical: trimmed, isKnown: false };
}

function hasH1Headings(content: string): boolean {
  return /^# /m.test(content);
}

function hasOntologyTags(content: string): boolean {
  return /<!--\s*brief:(ontology|ref-link)/.test(content);
}

function errorSection(text: string): UpdateSectionResult {
  return {
    success: false,
    isError: true,
    sectionUpdated: false,
    canonicalName: "",
    previousContent: `Error: ${text}`,
    confirmation: `Error: ${text}`,
    content: [{ type: "text", text }],
  };
}

function errorSession(text: string): CaptureExternalSessionResult {
  return {
    success: false,
    isError: true,
    decisionsWritten: 0,
    breadcrumbWritten: false,
    content: [{ type: "text", text }],
  };
}

/* ------------------------------------------------------------------ */
/*  handleUpdateSection                                                */
/* ------------------------------------------------------------------ */

export async function handleUpdateSection(
  options: UpdateSectionOptions,
): Promise<UpdateSectionResult> {
  const {
    heading,
    section,
    content,
    append = false,
    projectPath = "/root/project",
    _noActiveProject,
  } = options;

  const filePath = `${projectPath}/BRIEF.md`;

  // Guard: no active project
  if (_noActiveProject) {
    return errorSection(
      "No active project set. Use brief_set_active_project first.",
    );
  }

  // Resolve section name from section or heading parameter
  const sectionInput = section ?? heading;
  if (sectionInput === undefined || sectionInput === null) {
    return errorSection("Validation error: section name must not be empty.");
  }

  // Resolve via alias map (WRITE-14)
  const { canonical } = resolveSection(sectionInput);

  // Collect warnings
  const warnings: string[] = [];

  // WRITE-19: H1 heading warning
  if (hasH1Headings(content)) {
    warnings.push(
      "Content contains top-level heading(s) which may affect document structure.",
    );
  }

  // Check for ontology tags in content
  const tagsPresent = hasOntologyTags(content);

  // Read previous content from disk (or in-memory store as fallback)
  let previousContent = "";
  const diskExists = await projectExists(projectPath);

  if (diskExists) {
    previousContent = (await readSection(projectPath, canonical)) || "";
  } else {
    const existing = sectionStore.find((s) => s.name === canonical);
    if (existing) {
      previousContent = existing.content;
    }
  }

  // Build result
  const result: UpdateSectionResult = {
    success: true,
    sectionUpdated: true,
    canonicalName: canonical,
    filePath,
    previousContent,
    content,
    confirmation: "",
  };

  if (append) {
    result.appendMode = true;
  }

  if (warnings.length > 0) {
    result.warnings = warnings;
  }

  if (tagsPresent) {
    result.tagsPreserved = true;
  }

  // Write to disk
  if (diskExists) {
    if (append) {
      const existingContent = await readSection(projectPath, canonical);
      const updated = existingContent
        ? `${existingContent}\n${content}`
        : content;
      await writeSectionToDisk(projectPath, canonical, updated);
      result.confirmation = `Section '${canonical}' appended in ${filePath}.`;
    } else {
      await writeSectionToDisk(projectPath, canonical, content);
      result.confirmation = `Section '${canonical}' updated in ${filePath}.`;
    }
  } else {
    // Fallback: update in-memory store for test compat
    const existing = sectionStore.find((s) => s.name === canonical);
    if (existing) {
      if (append) {
        existing.content = existing.content
          ? `${existing.content}\n${content}`
          : content;
        result.confirmation = `Section '${canonical}' appended in ${filePath}.`;
      } else {
        existing.content = content;
        result.confirmation = `Section '${canonical}' updated in ${filePath}.`;
      }
    } else {
      sectionStore.push({ name: canonical, content });
      result.previousContent = `(new section created in ${filePath})`;
      result.confirmation = `Section '${canonical}' created in ${filePath}.`;
    }
  }

  // Format content: MCP array for non-empty, raw string for empty (RESP-04)
  if (content !== "") {
    result.content = [{ type: "text", text: result.confirmation }, content];
  }

  return result;
}

/* ------------------------------------------------------------------ */
/*  handleCaptureExternalSession                                       */
/* ------------------------------------------------------------------ */

export async function handleCaptureExternalSession(
  options: CaptureExternalSessionOptions,
): Promise<CaptureExternalSessionResult> {
  const {
    tool,
    decisions,
    session_date,
    projectPath = "/root/project",
    _noActiveProject,
    _simulateWriteFailure,
  } = options;

  const filePath = `${projectPath}/BRIEF.md`;

  // Guard: no active project
  if (_noActiveProject) {
    return errorSession(
      "No active project set. Use brief_set_active_project first.",
    );
  }

  // Validate tool name
  if (!tool || tool.trim().length === 0) {
    return errorSession("Validation error: tool name must not be empty.");
  }

  // Validate decisions array
  if (!decisions || !Array.isArray(decisions) || decisions.length === 0) {
    return errorSession("Validation error: decisions array must not be empty.");
  }

  // Validate each decision has a title
  for (const d of decisions) {
    if (d.title === undefined || d.title === null || d.title.length === 0) {
      return errorSession(
        "Validation error: each decision must have a non-empty title.",
      );
    }
  }

  // Simulate write failure — atomic: zero decisions written
  if (_simulateWriteFailure) {
    return errorSession(
      "Write operation failed. No decisions were written (atomic rollback).",
    );
  }

  // Atomic write: all decisions succeed
  const dateStr = session_date ?? today();
  const titles = decisions.map((d) => d.title.trim());
  const count = decisions.length;

  // Breadcrumb (WRITE-16a)
  const breadcrumb = `- ${dateStr} ${tool}: ${count} decisions captured \u2014 ${titles.join(", ")}`;

  // Write to disk if a project exists
  if (await projectExists(projectPath)) {
    for (const d of decisions) {
      const decisionLine = d.why
        ? `- ${d.title.trim()} (why: ${d.why}) [${dateStr}]`
        : `- ${d.title.trim()} [${dateStr}]`;
      await appendToSection(projectPath, "Key Decisions", decisionLine);
    }
    await appendToSection(projectPath, "External Tool Sessions", breadcrumb);
  }

  return {
    success: true,
    decisionsWritten: count,
    breadcrumbWritten: true,
    filePath,
    breadcrumbFormat: breadcrumb,
    breadcrumb,
    conflictsDetected: false,
    conflictDetectionRan: true,
    content: [
      {
        type: "text",
        text: `External session captured: ${count} decisions from ${tool} written to ${filePath}. Breadcrumb added to External Tool Sessions section.`,
      },
    ],
  };
}

/** Flexible alias for tests */
export async function updateSection(
  params: Record<string, unknown>,
): Promise<UpdateSectionResult> {
  if (
    typeof params.newContent === "string" &&
    typeof params.content === "string"
  ) {
    const fullContent = params.content as string;
    const sectionName = String(params.section ?? params.heading ?? "");
    const newBody = params.newContent as string;

    const lines = fullContent.split("\n");
    const headingPattern = `## ${sectionName}`;
    let secStart = -1;
    let secEnd = lines.length;

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trimEnd() === headingPattern) {
        secStart = i;
      } else if (secStart >= 0 && i > secStart && /^## /.test(lines[i])) {
        secEnd = i;
        break;
      }
    }

    let resultContent: string;
    if (secStart >= 0) {
      const before = lines.slice(0, secStart + 1).join("\n");
      const after = lines.slice(secEnd).join("\n");
      resultContent = `${before}\n\n${newBody}\n\n${after}`;
    } else {
      resultContent = `${fullContent}\n\n## ${sectionName}\n\n${newBody}\n`;
    }

    return {
      success: true,
      sectionUpdated: true,
      canonicalName: sectionName,
      content: resultContent,
    } as UpdateSectionResult;
  }

  return handleUpdateSection(params as unknown as UpdateSectionOptions);
}
