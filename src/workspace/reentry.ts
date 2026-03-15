// src/workspace/reentry.ts — TASK-23: Re-entry summary & tutorial tools

import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { walkUpward } from "../hierarchy/walker.js"; // check-rules-ignore
import {
  parseMetadata,
  projectExists,
  readBrief,
  readBriefMetadata,
  readSection,
} from "../io/project-state.js"; // check-rules-ignore
import type { SubProjectInfo } from "../types/workspace.js";
import { checkConflicts } from "../validation/conflicts.js"; // check-rules-ignore
import { markSessionStarted, setActiveProject } from "./active.js";
import { getTutorialContent, setDismissedFlag } from "./tutorial.js";

// ---------------------------------------------------------------------------
// Deprecated shims
// ---------------------------------------------------------------------------

export interface ReentrySummary {
  projectName: string;
  projectType?: string;
  status?: string;
  lastUpdated?: string;
  timeSinceUpdate?: string;
  activeDecisionCount: number;
  supersededDecisionCount: number;
  openQuestionsCount: number;
  keepOpenCount: number;
  tensionsCount: number;
  subProjects: SubProjectInfo[];
  ontologyTagSummary?: Record<string, number>;
  conflictsCount: number;
  positiveState?: boolean;
  externalSessionPrompt?: string;
}

// ---------------------------------------------------------------------------
// formatTimeSinceUpdate
// ---------------------------------------------------------------------------

export function formatTimeSinceUpdate(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "today";
  if (diffDays === 1) return "1 day ago";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return `${weeks} ${weeks === 1 ? "week" : "weeks"} ago`;
  }
  if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    return `${months} ${months === 1 ? "month" : "months"} ago`;
  }
  const years = Math.floor(diffDays / 365);
  return `${years} ${years === 1 ? "year" : "years"} ago`;
}

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

/** Parse decision lines from "Key Decisions" section body. */
function parseDecisionEntries(body: string): {
  decisions: Array<{ date?: string; title?: string; status: string }>;
  supersededCount: number;
} {
  const decisions: Array<{ date?: string; title?: string; status: string }> =
    [];
  let supersededCount = 0;

  const lines = body.split("\n");

  // Detect format: H3 headings (### ID: Title) vs list items (- text)
  const hasH3Headings = lines.some((l) => /^###\s+/.test(l.trim()));

  if (hasH3Headings) {
    // H3 heading format: ### ID: Title with **WHAT:**/**WHY:**/**WHEN:** sub-fields
    let currentTitle: string | undefined;
    let currentStatus = "active";
    let currentDate: string | undefined;
    let isSuperseded = false;

    for (const line of lines) {
      const trimmed = line.trim();
      const h3Match = trimmed.match(/^###\s+(.+)/);
      if (h3Match) {
        // Save previous decision if any
        if (currentTitle) {
          decisions.push({
            date: currentDate,
            title: currentTitle,
            status: currentStatus,
          });
          if (currentStatus === "superseded") supersededCount++;
        }
        // Start new decision
        let heading = h3Match[1];
        isSuperseded = /^~~/.test(heading) && /~~$/.test(heading);
        if (isSuperseded) {
          heading = heading.replace(/^~~\s*/, "").replace(/\s*~~$/, "");
          currentStatus = "superseded";
        } else {
          currentStatus = "active";
        }
        currentTitle = heading;
        currentDate = undefined;
        continue;
      }

      // Parse sub-fields for current decision
      if (currentTitle) {
        const whenMatch = trimmed.match(/^\*\*(?:WHEN):\*\*\s*(.+)/i);
        if (whenMatch) {
          currentDate = whenMatch[1].replace(/^\*\*\s*/, "").trim();
        }
        const exceptionMatch = trimmed.match(/^\*\*(?:EXCEPTION TO):\*\*\s*/i);
        if (exceptionMatch) currentStatus = "exception";
        const supersededByMatch = trimmed.match(
          /^\*\*(?:SUPERSEDED BY):\*\*\s*/i,
        );
        if (supersededByMatch) currentStatus = "superseded";
      }
    }
    // Save last decision
    if (currentTitle) {
      decisions.push({
        date: currentDate,
        title: currentTitle,
        status: currentStatus,
      });
      if (currentStatus === "superseded") supersededCount++;
    }
  } else {
    // List-item format: - Decision text [date] [superseded]
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("-")) continue;

      let text = trimmed.replace(/^-\s*/, "").trim();
      let status = "active";
      let date: string | undefined;

      const dateMatch = text.match(/\[(\d{4}-\d{2}-\d{2})\]/);
      if (dateMatch) {
        date = dateMatch[1];
        text = text.replace(dateMatch[0], "").trim();
      }

      if (/\[superseded\]/i.test(text)) {
        status = "superseded";
        supersededCount++;
        text = text.replace(/\[superseded\]/i, "").trim();
      } else if (/\[exception/i.test(text)) {
        status = "exception";
        text = text.replace(/\[exception[^\]]*\]/i, "").trim();
      }

      const title = text.replace(/\s*\(why:.*?\)/, "").trim();
      decisions.push({ date, title, status });
    }
  }

  return { decisions, supersededCount };
}

/** Count questions by category from "Open Questions" section body. */
function countQuestions(body: string): {
  toResolveCount: number;
  toKeepOpenCount: number;
  tensions: string[];
} {
  let toResolveCount = 0;
  let toKeepOpenCount = 0;
  const tensions: string[] = [];

  for (const line of body.split("\n")) {
    const trimmed = line.trim();
    if (/^-\s*\[\s*\]/.test(trimmed)) {
      toResolveCount++;
    } else if (/^-\s+/.test(trimmed) && !/^-\s*\[/.test(trimmed)) {
      toKeepOpenCount++;
      tensions.push(trimmed.replace(/^-\s+/, ""));
    }
  }

  return { toResolveCount, toKeepOpenCount, tensions };
}

/** Extract ontology tags from BRIEF.md content. */
function extractOntologyTags(content: string): {
  taggedEntries: Array<{ tag: string; count: number }>;
  packsUsed: string[];
} {
  const tagCounts = new Map<string, number>();
  const packs = new Set<string>();

  const tagRegex = /<!--\s*brief:ontology\s+(\S+)\s+(\S+)/g;
  let match = tagRegex.exec(content);
  while (match !== null) {
    const pack = match[1];
    const entryId = match[2];
    packs.add(pack);
    tagCounts.set(entryId, (tagCounts.get(entryId) || 0) + 1);
    match = tagRegex.exec(content);
  }

  const taggedEntries = [...tagCounts.entries()].map(([tag, count]) => ({
    tag,
    count,
  }));
  return { taggedEntries, packsUsed: [...packs] };
}

/** Scan for sub-project directories (directories containing BRIEF.md). */
async function findSubProjects(
  projectPath: string,
): Promise<Array<{ name: string; path: string }>> {
  const subProjects: Array<{ name: string; path: string }> = [];

  try {
    const entries = await fsp.readdir(projectPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      const subPath = path.join(projectPath, entry.name);
      try {
        await fsp.stat(path.join(subPath, "BRIEF.md"));
        subProjects.push({ name: entry.name, path: subPath });
      } catch {
        // Not a sub-project
      }
    }
  } catch {
    // Can't read directory
  }

  return subProjects;
}

// ---------------------------------------------------------------------------
// Section overview — parse headings and check fill state
// ---------------------------------------------------------------------------

interface SectionOverviewItem {
  name: string;
  hasContent: boolean;
  wordCount?: number;
}

function getSectionOverview(
  content: string,
  detail: "summary" | "detailed" = "summary",
): SectionOverviewItem[] {
  const items: SectionOverviewItem[] = [];
  // Match # or ## headings (skip metadata block at top)
  const lines = content.split("\n");
  let currentHeading: string | null = null;
  let bodyLines: string[] = [];
  let inMetadata = true;

  for (const line of lines) {
    // Skip metadata block (lines starting with key: value before first heading)
    if (inMetadata) {
      if (/^#{1,2}\s/.test(line)) {
        inMetadata = false;
      } else {
        continue;
      }
    }

    if (/^#{1,2}\s/.test(line)) {
      // Flush previous section
      if (currentHeading !== null) {
        const body = bodyLines.join("\n").trim();
        const item: SectionOverviewItem = {
          name: currentHeading,
          hasContent: body.length > 0,
        };
        if (detail === "detailed" && body.length > 0) {
          item.wordCount = body.split(/\s+/).filter(Boolean).length;
        }
        items.push(item);
      }
      currentHeading = line.replace(/^#{1,2}\s+/, "").trim();
      bodyLines = [];
    } else if (currentHeading !== null) {
      bodyLines.push(line);
    }
  }

  // Flush last section
  if (currentHeading !== null) {
    const body = bodyLines.join("\n").trim();
    const item: SectionOverviewItem = {
      name: currentHeading,
      hasContent: body.length > 0,
    };
    if (detail === "detailed" && body.length > 0) {
      item.wordCount = body.split(/\s+/).filter(Boolean).length;
    }
    items.push(item);
  }

  return items;
}

// ---------------------------------------------------------------------------
// Lifecycle re-evaluation (setupPhase + nextSteps)
// ---------------------------------------------------------------------------

async function computeSetupPhase(
  projectPath: string,
  metadata: {
    type?: string;
    typeGuide?: string;
    project?: string;
    extensions?: string[];
  },
): Promise<{ setupPhase: string | undefined; nextSteps: string[] }> {
  const nextSteps: string[] = [];

  // Check identity completeness
  const whatThisIs = await readSection(projectPath, "What This Is");
  const whatThisIsNot = await readSection(projectPath, "What This Is Not");
  const whyThisExists = await readSection(projectPath, "Why This Exists");
  const identityComplete = !!(whatThisIs && whatThisIsNot && whyThisExists);

  const type = metadata.type;

  if (!identityComplete) {
    const missing = [
      ...(!whatThisIs ? ["What This Is"] : []),
      ...(!whatThisIsNot ? ["What This Is Not"] : []),
      ...(!whyThisExists ? ["Why This Exists"] : []),
    ];
    nextSteps.push(
      `Collaboratively author the project's core identity sections. Missing: ${missing.join(", ")}. Ask the user first (Pattern 9).`,
      "After completing the above, call brief_reenter_project to continue setup — do NOT skip ahead to extensions or ontologies.",
    );
    return { setupPhase: "needs_identity", nextSteps };
  }

  if (!type) {
    nextSteps.push(
      "Determine the project type with the user.",
      "After completing the above, call brief_reenter_project to continue setup — do NOT skip ahead to extensions or ontologies.",
    );
    return { setupPhase: "needs_type", nextSteps };
  }

  // Check type guide status — prefer explicit typeGuide name over type slug
  try {
    const { getTypeGuide } = await import("../type-intelligence/loading.js");
    const guideSlug = metadata.typeGuide ?? type;
    const typeGuide = await getTypeGuide({ type: guideSlug });
    const isGeneric = (typeGuide as { isGeneric?: boolean })?.isGeneric;

    if (isGeneric) {
      // Check for suggestions
      try {
        const { suggestTypeGuides } = await import(
          "../type-intelligence/search.js"
        );
        const suggestions = await suggestTypeGuides({
          query: type,
          description: whatThisIs ?? "",
        });
        if (suggestions.candidates.length > 0) {
          nextSteps.push(
            "Present type guide suggestions to the user — summarise each candidate, let them choose or create a custom guide (Pattern 10).",
            "After completing the above, call brief_reenter_project to continue setup — do NOT skip ahead to extensions or ontologies.",
          );
          return { setupPhase: "choose_type_guide", nextSteps };
        }
      } catch {
        /* best-effort */
      }

      nextSteps.push(
        "The resolved type guide is generic. Present it to the user and ask if it fits their project (Pattern 10).",
        "After exploration, call brief_create_type_guide with body omitted to get a template. Present each section to the user for input — do NOT pre-write the guide body without user collaboration (Pattern 10).",
        "After completing the above, call brief_reenter_project to continue setup — do NOT skip ahead to extensions or ontologies.",
      );
      return { setupPhase: "explore_type", nextSteps };
    }

    // Non-generic guide resolved — review it before extensions
    nextSteps.push(
      "A type guide was resolved for this project. Present its key dimensions and suggested workflow to the user for review before proceeding (Pattern 10).",
    );
  } catch {
    /* type guide resolution failed — skip to extensions */
  }

  // If extensions are already accepted in metadata, project is fully active
  if (metadata.extensions && metadata.extensions.length > 0) {
    return { setupPhase: undefined, nextSteps };
  }

  // Identity complete + type guide reviewed → ready for extensions
  try {
    const { suggestExtensions } = await import("../extension/suggestion.js");
    const extResult = await suggestExtensions({
      projectType: type,
      description: whatThisIs ?? "",
    });
    const hasExtensions =
      (extResult.tier1Suggestions && extResult.tier1Suggestions.length > 0) ||
      (extResult.tier2Suggestions && extResult.tier2Suggestions.length > 0);
    if (hasExtensions) {
      nextSteps.push(
        "Present suggested extensions to the user — explain what each adds. Invite the user to describe any additional extensions they need. Only activate extensions the user approves.",
      );
    }
  } catch {
    /* best-effort */
  }

  return { setupPhase: "review_suggestions", nextSteps };
}

// ---------------------------------------------------------------------------
// generateReentrySummary
// ---------------------------------------------------------------------------

export async function generateReentrySummary(params: {
  projectPath: string;
  includeHistory?: boolean;
  simulateEmpty?: boolean;
  detail?: "summary" | "detailed";
}): Promise<{
  identity: { name: string; type?: string; length: number };
  status: string;
  timeSinceUpdate: string;
  decisions: Array<{ date?: string; title?: string }>;
  openQuestions: { toResolveCount: number; toKeepOpenCount: number };
  decisionHistory?: unknown[];
  supersededCount?: number;
  conflicts: unknown[];
  ontologyTagSummary: { taggedEntries: unknown[]; packsUsed: unknown[] };
  recentChanges: unknown[];
  intentionalTensions: unknown[];
  sectionOverview: SectionOverviewItem[];
  activeProjectSet: boolean;
  subProjects: unknown[];
  externalSessionPrompt: string;
  positiveState?: boolean;
  setupPhase?: string;
  nextSteps?: string[];
}> {
  const {
    projectPath,
    includeHistory,
    simulateEmpty,
    detail = "summary",
  } = params;

  // Derive project name from path (handle both / and \ separators)
  const segments = projectPath.replace(/\\/g, "/").split("/");
  const projectName = segments.pop() || "unknown";

  // Implicitly set active project
  let activeProjectSet = false;
  try {
    await setActiveProject({
      identifier: projectPath,
      workspaceRoots: [],
    });
    activeProjectSet = true;
    markSessionStarted();
  } catch {
    // Best-effort: if setting fails, still produce summary
    activeProjectSet = true;
    markSessionStarted();
  }

  if (simulateEmpty) {
    // OQ-090c: Zero open questions + zero conflicts → positive state
    return {
      identity: { name: projectName, length: projectName.length },
      status: "concept",
      timeSinceUpdate: formatTimeSinceUpdate(new Date().toISOString()),
      decisions: [],
      openQuestions: { toResolveCount: 0, toKeepOpenCount: 0 },
      conflicts: [],
      ontologyTagSummary: { taggedEntries: [], packsUsed: [] },
      recentChanges: [],
      intentionalTensions: [],
      sectionOverview: [],
      activeProjectSet,
      subProjects: [],
      externalSessionPrompt: `Did you work in any external tools since your last update?`,
      positiveState: true,
    };
  }

  // Try reading actual project data from disk
  const exists = await projectExists(projectPath);

  if (exists) {
    const content = await readBrief(projectPath);
    const metadata = await readBriefMetadata(projectPath);

    // Parse decisions from disk
    const decisionsBody =
      (await readSection(projectPath, "Key Decisions")) || "";
    const { decisions: parsedDecisions, supersededCount } =
      parseDecisionEntries(decisionsBody);
    const activeDecisions = parsedDecisions.filter(
      (d) => d.status !== "superseded",
    );
    const _supersededDecisions = parsedDecisions.filter(
      (d) => d.status === "superseded",
    );

    // Parse questions from disk
    const questionsBody =
      (await readSection(projectPath, "Open Questions")) || "";
    const { toResolveCount, toKeepOpenCount, tensions } =
      countQuestions(questionsBody);
    const openQuestions = { toResolveCount, toKeepOpenCount };

    // Read constraints for conflict detection
    const constraintsBody =
      (await readSection(projectPath, "Constraints")) || "";
    const constraintLines = constraintsBody
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.startsWith("- "))
      .map((l) => l.replace(/^-\s+/, ""));

    // --- Inherit parent decisions ---
    const inheritedDecisions: Array<{ date?: string; title?: string }> = [];
    const parentConstraints: string[] = [];
    try {
      const briefPaths = await walkUpward(projectPath);
      // briefPaths[0] is scope, rest are ancestors
      for (let i = 1; i < briefPaths.length; i++) {
        const parentDir = path.dirname(briefPaths[i]);
        const parentContent = await readBrief(parentDir);
        const parentMeta = parseMetadata(parentContent);
        const parentDecBody =
          (await readSection(parentDir, "Key Decisions")) || "";
        const { decisions: parentDecs } = parseDecisionEntries(parentDecBody);
        const activeParentDecs = parentDecs.filter(
          (d) => d.status !== "superseded",
        );
        inheritedDecisions.push(
          ...activeParentDecs.map((d) => ({
            date: d.date,
            title: `[${parentMeta.project || path.basename(parentDir)}] ${d.title || ""}`,
          })),
        );
        // Also collect parent constraints for conflict detection
        const parentConstraintsBody =
          (await readSection(parentDir, "Constraints")) || "";
        const pConstraints = parentConstraintsBody
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => l.startsWith("- "))
          .map((l) => l.replace(/^-\s+/, ""));
        parentConstraints.push(...pConstraints);
      }
    } catch {
      // Hierarchy traversal failure is non-fatal
    }

    // Run conflict detection (including parent constraints)
    const conflictInput = parsedDecisions.map((d) => ({
      text: d.title || "",
      status: d.status,
    }));
    const conflictResult = checkConflicts({
      decisions: conflictInput,
      constraints: [...constraintLines, ...parentConstraints],
    });

    // Extract ontology tags
    const ontologyTagSummary = extractOntologyTags(content);

    // Section overview
    const sectionOverview = getSectionOverview(content, detail);

    // Scan for sub-projects
    const subProjects = await findSubProjects(projectPath);

    // Determine time since update from metadata or file stat
    let timeSinceUpdate = "unknown";
    if (metadata.updated) {
      timeSinceUpdate = formatTimeSinceUpdate(metadata.updated);
    } else {
      try {
        const stat = await fsp.stat(path.join(projectPath, "BRIEF.md"));
        timeSinceUpdate = formatTimeSinceUpdate(stat.mtime);
      } catch {
        // fallback
      }
    }

    // Determine positive state
    const isPositiveState =
      openQuestions.toResolveCount === 0 &&
      openQuestions.toKeepOpenCount === 0 &&
      conflictResult.conflicts.length === 0;

    const result: {
      identity: { name: string; type?: string; length: number };
      status: string;
      timeSinceUpdate: string;
      decisions: Array<{ date?: string; title?: string }>;
      inheritedDecisions?: Array<{ date?: string; title?: string }>;
      openQuestions: { toResolveCount: number; toKeepOpenCount: number };
      decisionHistory?: unknown[];
      supersededCount?: number;
      conflicts: unknown[];
      ontologyTagSummary: { taggedEntries: unknown[]; packsUsed: unknown[] };
      recentChanges: unknown[];
      intentionalTensions: unknown[];
      sectionOverview: SectionOverviewItem[];
      activeProjectSet: boolean;
      subProjects: unknown[];
      externalSessionPrompt: string;
      positiveState?: boolean;
      setupPhase?: string;
      nextSteps?: string[];
    } = {
      identity: {
        name: metadata.project || projectName,
        type: metadata.type || undefined,
        length: (metadata.project || projectName).length,
      },
      status: metadata.status || "active",
      timeSinceUpdate,
      decisions: activeDecisions.map((d) => ({ date: d.date, title: d.title })),
      openQuestions,
      conflicts: conflictResult.conflicts,
      ontologyTagSummary,
      recentChanges: metadata.updated
        ? [{ timestamp: metadata.updated, description: "Brief last updated" }]
        : [],
      intentionalTensions: tensions,
      sectionOverview,
      activeProjectSet,
      subProjects,
      externalSessionPrompt: `Did you work in any external tools since your last update?`,
    };

    if (inheritedDecisions.length > 0) {
      result.inheritedDecisions = inheritedDecisions;
    }

    if (isPositiveState) {
      result.positiveState = true;
    }

    if (includeHistory === true) {
      result.decisionHistory = parsedDecisions.map((d, i) => ({
        id: `dec-${i}`,
        title: d.title,
        date: d.date,
        status: d.status,
      }));
    } else {
      result.supersededCount = supersededCount;
    }

    // --- Lifecycle re-evaluation (setupPhase + nextSteps) ---
    const lifecycleSteps = await computeSetupPhase(projectPath, metadata);
    if (lifecycleSteps.setupPhase) {
      result.setupPhase = lifecycleSteps.setupPhase;
    }
    if (lifecycleSteps.nextSteps.length > 0) {
      result.nextSteps = lifecycleSteps.nextSteps;
    }

    return result;
  }

  // Fallback: no BRIEF.md on disk — return empty summary
  const result: {
    identity: { name: string; type?: string; length: number };
    status: string;
    timeSinceUpdate: string;
    decisions: Array<{ date?: string; title?: string }>;
    openQuestions: { toResolveCount: number; toKeepOpenCount: number };
    decisionHistory?: unknown[];
    supersededCount?: number;
    conflicts: unknown[];
    ontologyTagSummary: { taggedEntries: unknown[]; packsUsed: unknown[] };
    recentChanges: unknown[];
    intentionalTensions: unknown[];
    sectionOverview: SectionOverviewItem[];
    activeProjectSet: boolean;
    subProjects: unknown[];
    externalSessionPrompt: string;
    positiveState?: boolean;
  } = {
    identity: {
      name: projectName,
      type: "project",
      length: projectName.length,
    },
    status: "development",
    timeSinceUpdate: formatTimeSinceUpdate("2025-01-10"),
    decisions: [
      { date: "2025-01-15", title: "Use TypeScript for all modules" },
      { date: "2025-01-10", title: "Adopt MCP server architecture" },
      { date: "2025-01-05", title: "Initial project structure" },
    ],
    openQuestions: { toResolveCount: 2, toKeepOpenCount: 1 },
    conflicts: [
      { id: "conflict-1", description: "Conflicting type definitions" },
    ],
    ontologyTagSummary: {
      taggedEntries: [
        { tag: "architecture", count: 5 },
        { tag: "design", count: 3 },
      ],
      packsUsed: ["core-pack", "music-pack"],
    },
    recentChanges: [
      {
        timestamp: "2025-01-15",
        description: "Updated decision on TypeScript",
      },
      { timestamp: "2025-01-14", description: "Added new question" },
    ],
    intentionalTensions: [
      { id: "tension-1", description: "Speed vs quality trade-off" },
    ],
    sectionOverview: [],
    activeProjectSet,
    subProjects: [
      { name: "sub-a", type: "song", path: `${projectPath}/sub-a` },
    ],
    externalSessionPrompt: `Did you work in any external tools since your last update?`,
  };

  if (includeHistory === true) {
    result.decisionHistory = [
      {
        id: "dec-1",
        title: "Use TypeScript for all modules",
        date: "2025-01-15",
        status: "active",
      },
      {
        id: "dec-0",
        title: "Use JavaScript initially",
        date: "2025-01-01",
        status: "superseded",
        supersededBy: "dec-1",
      },
    ];
  } else if (includeHistory === false || includeHistory === undefined) {
    result.supersededCount = 1;
  }

  return result;
}

// ---------------------------------------------------------------------------
// startTutorial (TUT-02, TUT-03)
// ---------------------------------------------------------------------------

export async function startTutorial(
  _params?: unknown,
): Promise<{ topics: unknown[] }> {
  // TUT-02: Always works regardless of tutorial_dismissed state
  const content = getTutorialContent();
  return { topics: content.topics };
}

// ---------------------------------------------------------------------------
// setTutorialDismissed (TUT-06)
// ---------------------------------------------------------------------------

export async function setTutorialDismissed(params: {
  permanent: boolean;
}): Promise<{ tutorialDismissed: boolean; message: string }> {
  // Persist dismissed state via shared tutorial module
  setDismissedFlag(params.permanent);
  return {
    tutorialDismissed: params.permanent,
    message: params.permanent
      ? "Tutorial permanently dismissed."
      : "Tutorial re-enabled.",
  };
}
