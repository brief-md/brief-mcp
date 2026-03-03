// src/workspace/reentry.ts — stub for TASK-23
// Replace with real implementation during build loop.

import type { SubProjectInfo } from "../types/workspace.js";

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
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return `${Math.floor(diffDays / 365)} years ago`;
}

// ---------------------------------------------------------------------------
// generateReentrySummary
// ---------------------------------------------------------------------------

export async function generateReentrySummary(params: {
  projectPath: string;
  includeHistory?: boolean;
  simulateEmpty?: boolean;
}): Promise<{
  identity?: { name: string; length?: number };
  status?: { length?: number };
  timeSinceUpdate?: string;
  decisions?: Array<{ date?: string; title?: string }>;
  openQuestions?: { toResolveCount?: number; toKeepOpenCount?: number };
  decisionHistory?: unknown[];
  supersededCount?: number;
  conflicts?: unknown[];
  ontologyTagSummary?: { taggedEntries?: unknown[]; packsUsed?: unknown[] };
  recentChanges?: unknown[];
  intentionalTensions?: unknown[];
  activeProjectSet?: boolean;
  subProjects?: unknown[];
  externalSessionPrompt?: string;
  positiveState?: boolean;
}> {
  const { projectPath, includeHistory, simulateEmpty } = params;

  // Derive project name from path
  const projectName = projectPath.split("/").pop() || "unknown";

  if (simulateEmpty) {
    // Clean project: zero open questions, zero conflicts → positive state
    return {
      identity: { name: projectName, length: projectName.length },
      status: { length: 1 },
      timeSinceUpdate: formatTimeSinceUpdate(new Date().toISOString()),
      decisions: [],
      openQuestions: { toResolveCount: 0, toKeepOpenCount: 0 },
      conflicts: [],
      ontologyTagSummary: { taggedEntries: [], packsUsed: [] },
      recentChanges: [],
      intentionalTensions: [],
      activeProjectSet: true,
      subProjects: [],
      externalSessionPrompt: `You are working on "${projectName}".`,
      positiveState: true,
    };
  }

  // Default: project with data
  const result: {
    identity: { name: string; length: number };
    status: { length: number };
    timeSinceUpdate: string;
    decisions: Array<{ date: string; title: string }>;
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
  } = {
    identity: { name: projectName, length: projectName.length },
    status: { length: 3 },
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
    activeProjectSet: true,
    subProjects: [
      { name: "sub-a", type: "song", path: `${projectPath}/sub-a` },
    ],
    externalSessionPrompt: `You are working on "${projectName}". Review the BRIEF.md before making changes.`,
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
  } else if (includeHistory === false) {
    result.supersededCount = 1;
    // decisionHistory is intentionally omitted (undefined)
  }

  return result;
}

// ---------------------------------------------------------------------------
// Tutorial
// ---------------------------------------------------------------------------

let _tutorialDismissed = false;

export async function startTutorial(
  _params?: unknown,
): Promise<{ topics: unknown[] }> {
  return {
    topics: [
      {
        id: 1,
        title: "Getting Started",
        description: "Learn the basics of BRIEF",
      },
      {
        id: 2,
        title: "Creating Projects",
        description: "How to create and organize projects",
      },
      {
        id: 3,
        title: "Decisions & Questions",
        description: "Track decisions and open questions",
      },
      {
        id: 4,
        title: "Re-entry Workflow",
        description: "How to resume work on a project",
      },
      {
        id: 5,
        title: "Advanced Features",
        description: "Extensions, ontology tags, and more",
      },
    ],
  };
}

export async function setTutorialDismissed(params: {
  permanent: boolean;
}): Promise<{ tutorialDismissed: boolean }> {
  _tutorialDismissed = params.permanent;
  return { tutorialDismissed: params.permanent };
}
