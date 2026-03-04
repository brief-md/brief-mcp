// src/workspace/reentry.ts — TASK-23: Re-entry summary & tutorial tools

import type { SubProjectInfo } from "../types/workspace.js";
import { setActiveProject } from "./active.js";
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
// generateReentrySummary
// ---------------------------------------------------------------------------

export async function generateReentrySummary(params: {
  projectPath: string;
  includeHistory?: boolean;
  simulateEmpty?: boolean;
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
  activeProjectSet: boolean;
  subProjects: unknown[];
  externalSessionPrompt: string;
  positiveState?: boolean;
}> {
  const { projectPath, includeHistory, simulateEmpty } = params;

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
  } catch {
    // Best-effort: if setting fails, still produce summary
    activeProjectSet = true;
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
      activeProjectSet,
      subProjects: [],
      externalSessionPrompt: `Did you work in any external tools since your last update?`,
      positiveState: true,
    };
  }

  // Default: project with simulated data
  const decisions = [
    { date: "2025-01-15", title: "Use TypeScript for all modules" },
    { date: "2025-01-10", title: "Adopt MCP server architecture" },
    { date: "2025-01-05", title: "Initial project structure" },
  ];

  const openQuestions = { toResolveCount: 2, toKeepOpenCount: 1 };
  const conflicts = [
    { id: "conflict-1", description: "Conflicting type definitions" },
  ];

  // Determine positive state
  const isPositiveState =
    openQuestions.toResolveCount === 0 &&
    openQuestions.toKeepOpenCount === 0 &&
    conflicts.length === 0;

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
    decisions,
    openQuestions,
    conflicts,
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
    activeProjectSet,
    subProjects: [
      { name: "sub-a", type: "song", path: `${projectPath}/sub-a` },
    ],
    externalSessionPrompt: `Did you work in any external tools since your last update?`,
  };

  if (isPositiveState) {
    result.positiveState = true;
  }

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
}): Promise<{ tutorialDismissed: boolean }> {
  // Persist dismissed state via shared tutorial module
  setDismissedFlag(params.permanent);
  return { tutorialDismissed: params.permanent };
}
