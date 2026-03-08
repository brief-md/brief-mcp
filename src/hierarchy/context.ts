// src/hierarchy/context.ts — TASK-18: hierarchy context assembly & formatting

import type { Decision, Question } from "../types/decisions.js";
import type { HierarchyLevel } from "../types/hierarchy.js";
import type { OntologyMetadataEntry, Section } from "../types/parser.js";

export interface ContextAssemblyOptions {
  sizeCap?: number;
  contextDepth?: number;
  includeSuperseded?: boolean;
  sections?: string[];
}

const DEFAULT_SIZE_CAP = 50 * 1024; // 50KB

interface NormalizedLevel {
  project: string;
  type: string;
  status: string;
  sections: NormalizedSection[];
  decisions: Decision[];
  questions: Question[];
  extensions: string[];
  ontologies: OntologyMetadataEntry[];
  constraints: string[];
  excludes: string[];
  depth: number;
  dirPath: string;
}

interface NormalizedSection {
  heading: string;
  body: string;
  classification: string;
  canonicalName?: string;
  type?: string;
  [key: string]: unknown;
}

function normalizeSectionList(raw: unknown): NormalizedSection[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((s: unknown) => {
    const sec = s as Record<string, unknown>;
    return {
      heading: String(sec.heading ?? sec.name ?? ""),
      body: String(sec.body ?? ""),
      classification: String(sec.classification ?? "core"),
      canonicalName:
        sec.canonicalName != null ? String(sec.canonicalName) : undefined,
      type: sec.type != null ? String(sec.type) : undefined,
      ...sec,
    };
  });
}

function extractLevel(lvl: unknown, fallbackDepth: number): NormalizedLevel {
  const l = lvl as Record<string, unknown>;
  if (l.parsedContent != null && typeof l.parsedContent === "object") {
    const pc = l.parsedContent as Record<string, unknown>;
    const meta = (pc.metadata ?? {}) as Record<string, unknown>;
    return {
      project: String(meta.Project ?? "Unknown"),
      type: String(meta.Type ?? "Project"),
      status: String(meta.Status ?? ""),
      sections: normalizeSectionList(pc.sections),
      decisions: Array.isArray(pc.decisions)
        ? (pc.decisions as Decision[])
        : [],
      questions: Array.isArray(pc.questions)
        ? (pc.questions as Question[])
        : [],
      extensions: Array.isArray(pc.extensions)
        ? (pc.extensions as string[])
        : [],
      ontologies: Array.isArray(meta.Ontologies)
        ? (meta.Ontologies as OntologyMetadataEntry[])
        : [],
      constraints: [],
      excludes: [],
      depth: typeof l.depth === "number" ? l.depth : fallbackDepth,
      dirPath: String(l.dirPath ?? ""),
    };
  }
  // Flat format: "level" = broadest-first (0=broadest), "depth" = walker (0=scope)
  const flatDepth =
    typeof l.depth === "number"
      ? l.depth
      : typeof l.level === "number"
        ? l.level
        : fallbackDepth;
  return {
    project: String(l.project ?? "Unknown"),
    type: String(l.type ?? "Project"),
    status: String(l.status ?? ""),
    sections: normalizeSectionList(l.sections),
    decisions: Array.isArray(l.decisions) ? (l.decisions as Decision[]) : [],
    questions: Array.isArray(l.questions) ? (l.questions as Question[]) : [],
    extensions: Array.isArray(l.extensions) ? (l.extensions as string[]) : [],
    ontologies: Array.isArray(l.ontologies)
      ? (l.ontologies as OntologyMetadataEntry[])
      : [],
    constraints: Array.isArray(l.constraints)
      ? (l.constraints as string[])
      : [],
    excludes: Array.isArray(l.excludes) ? (l.excludes as string[]) : [],
    depth: flatDepth,
    dirPath: String(l.dirPath ?? ""),
  };
}

// HIER-04: capitalize first letter of type
export function labelLevel(type: string, name: string): string {
  const t = type.charAt(0).toUpperCase() + type.slice(1);
  return `[${t}: ${name}]`;
}

// HIER-15a section filter helpers
function getHeading(s: unknown): string {
  const sec = s as Record<string, unknown>;
  return String(sec.heading ?? sec.name ?? "")
    .toLowerCase()
    .trim();
}

function getCanonical(s: unknown): string {
  const sec = s as Record<string, unknown>;
  return String(sec.canonicalName ?? "").toLowerCase();
}

function sectionMatchesFilter(s: unknown, filter: string): boolean {
  const sec = s as Record<string, unknown>;
  // Explicit category field takes priority (used in property tests)
  if (typeof sec.category === "string") return sec.category === filter;
  const h = getHeading(s);
  const c = getCanonical(s);
  const classification = String(sec.classification ?? "");
  const rawType = String(sec.type ?? "");
  switch (filter) {
    case "identity":
      return (
        h === "what this is" ||
        c === "what-this-is" ||
        h === "what this is not" ||
        c === "what-this-is-not"
      );
    case "constraints":
      return (
        h === "what this is not" ||
        c === "what-this-is-not" ||
        classification === "constraints"
      );
    case "motivation":
      return h === "why this exists" || c === "why-this-exists";
    case "decisions":
      return h === "key decisions" || c === "key-decisions";
    case "questions":
      return h === "open questions" || c === "open-questions";
    case "extensions":
      return classification === "extension";
    case "references":
      return (
        h === "references" || c === "references" || rawType === "reference-list"
      );
    default:
      return false;
  }
}

export function filterSections(
  sections: unknown[],
  filter?: string[],
): unknown[] {
  if (!filter || filter.length === 0) return sections;
  return sections.filter((s) => filter.some((f) => sectionMatchesFilter(s, f)));
}

// HIER-05: detect child decisions overriding parent constraints
export function detectOverrides(parent: object, child: object): string[] {
  const p = extractLevel(parent, 1);
  const c = extractLevel(child, 0);
  const constraintItems: Array<{ desc: string }> = [];
  for (const s of p.sections) {
    if (
      getHeading(s) === "what this is not" ||
      getCanonical(s) === "what-this-is-not"
    ) {
      constraintItems.push({ desc: s.body.trim().split("\n")[0] ?? s.heading });
    }
  }
  for (const constraint of p.constraints)
    constraintItems.push({ desc: constraint });
  if (constraintItems.length === 0) return [];
  const activeDecisions = c.decisions.filter((d) => d.status === "active");
  if (activeDecisions.length === 0) return [];
  return constraintItems.map(
    ({ desc }) => `Note: this ${c.type} overrides the ${p.type}'s ${desc}`,
  );
}

// Additive extension/ontology inheritance with opt-out
export function computeInheritance(
  parent: object,
  child: object,
): { extensions: string[]; ontologies: OntologyMetadataEntry[] } {
  const p = extractLevel(parent, 1);
  const c = extractLevel(child, 0);
  const extensions = [...new Set([...p.extensions, ...c.extensions])];
  const excludedNames = new Set<string>([
    ...c.excludes,
    ...c.ontologies.flatMap((o) => {
      const ex = (o as unknown as Record<string, unknown>).excludes;
      if (Array.isArray(ex)) return ex as string[];
      if (typeof ex === "string") return [ex as string];
      return [] as string[];
    }),
  ]);
  const filteredParent = p.ontologies.filter((o) => !excludedNames.has(o.name));
  const childNames = new Set(c.ontologies.map((o) => o.name));
  const ontologies = [
    ...filteredParent.filter((o) => !childNames.has(o.name)),
    ...c.ontologies,
  ];
  return { extensions, ontologies };
}

// Assembled level output shape
type AssembledLevel = {
  project: string;
  type?: string;
  status?: string;
  label?: string;
  level?: number;
  isAdvisory?: boolean;
  fullContent?: boolean;
  metadataOnly?: boolean;
  decisions?: Decision[];
  recentDecisions?: Decision[];
  sections?: unknown[];
  overrides?: string[];
  [key: string]: unknown;
};

function buildMetaOnly(
  lvl: NormalizedLevel,
  label: string,
  outputIdx: number,
  isAdvisory: boolean,
  includeSuperseded: boolean,
): AssembledLevel {
  return {
    label,
    project: lvl.project,
    type: lvl.type,
    status: lvl.status,
    level: outputIdx,
    isAdvisory,
    fullContent: false,
    metadataOnly: true,
    recentDecisions: lvl.decisions
      .filter((d) => (includeSuperseded ? true : d.status !== "superseded"))
      .slice(-3),
  };
}

// HIER-03, HIER-04, HIER-05, HIER-06, HIER-13: main context assembly
export async function assembleContext(
  levelsInput: unknown[] | HierarchyLevel[],
  options?: ContextAssemblyOptions,
): Promise<{
  levels: AssembledLevel[];
  mergedMetadata: Record<string, unknown>;
  mergedSections: Section[];
  allDecisions: Decision[];
  allQuestions: Question[];
  truncated?: boolean;
  truncationSignal?: string;
}> {
  const raw = levelsInput as unknown[];
  if (raw.length === 0) {
    return {
      levels: [],
      mergedMetadata: {},
      mergedSections: [],
      allDecisions: [],
      allQuestions: [],
    };
  }

  const sizeCap = options?.sizeCap ?? DEFAULT_SIZE_CAP;
  const contextDepth = options?.contextDepth;
  const includeSuperseded = options?.includeSuperseded ?? false;
  const sectionsFilter = options?.sections;

  const normalized = raw.map((lvl, idx) => extractLevel(lvl, idx));
  const sortedByDepth = [...normalized].sort((a, b) => a.depth - b.depth);
  const limitedLevels =
    contextDepth !== undefined && contextDepth > 0
      ? sortedByDepth.slice(-contextDepth)
      : sortedByDepth;

  const scopeDepth = Math.max(...normalized.map((l) => l.depth));
  const directParentDepth = scopeDepth - 1;
  const scopeLevel = normalized.find((l) => l.depth === scopeDepth);

  let totalSize = 0;
  let truncated = false;
  let truncationSignal: string | undefined;
  const outputLevels: AssembledLevel[] = [];
  const allDecisions: Decision[] = [];
  const allQuestions: Question[] = [];
  const mergedMetadata: Record<string, unknown> = {};
  const mergedSectionsMap = new Map<string, NormalizedSection>();

  const truncateAt = (label: string, dirPath: string) => {
    truncated = true;
    truncationSignal = `Context truncated at ${label} due to size limit. Call brief_get_context with scope=${dirPath} for full content at that level.`;
  };

  for (const lvl of limitedLevels) {
    const label = labelLevel(lvl.type, lvl.project);
    const isScope = lvl.depth === scopeDepth;
    const isDirectParent = lvl.depth === directParentDepth;
    const isAdvisory = !isScope;

    if (!(isScope || isDirectParent)) {
      if (truncated) continue;
      const meta = buildMetaOnly(
        lvl,
        label,
        outputLevels.length,
        true,
        includeSuperseded,
      );
      const sz = JSON.stringify(meta).length;
      if (totalSize + sz > sizeCap) {
        truncateAt(label, lvl.dirPath);
        continue;
      }
      totalSize += sz;
      outputLevels.push(meta);
      allDecisions.push(...(meta.recentDecisions ?? []));
      continue;
    }

    // Full content level (scope or direct parent)
    const levelDecisions = lvl.decisions.filter((d) =>
      includeSuperseded ? true : d.status !== "superseded",
    );
    let levelSections: NormalizedSection[] = [...lvl.sections];
    if (sectionsFilter?.length) {
      levelSections = filterSections(
        levelSections,
        sectionsFilter,
      ) as NormalizedSection[];
    }
    let overrides: string[] = [];
    if (!isScope && scopeLevel) {
      overrides = detectOverrides(
        lvl as unknown as object,
        scopeLevel as unknown as object,
      );
    }
    const fullLevel: AssembledLevel = {
      label,
      project: lvl.project,
      type: lvl.type,
      status: lvl.status,
      level: outputLevels.length,
      isAdvisory,
      fullContent: true,
      metadataOnly: false,
      decisions: levelDecisions,
      sections: levelSections,
      overrides,
    };
    const estimatedSize = JSON.stringify(fullLevel).length;
    if (totalSize + estimatedSize > sizeCap) {
      truncateAt(label, lvl.dirPath);
      const meta = buildMetaOnly(
        lvl,
        label,
        outputLevels.length,
        isAdvisory,
        includeSuperseded,
      );
      const metaSz = JSON.stringify(meta).length;
      if (totalSize + metaSz <= sizeCap) {
        totalSize += metaSz;
        outputLevels.push(meta);
        allDecisions.push(...(meta.recentDecisions ?? []));
      }
      continue;
    }
    totalSize += estimatedSize;
    outputLevels.push(fullLevel);
    allDecisions.push(...levelDecisions);
    allQuestions.push(...lvl.questions);
    for (const s of levelSections) mergedSectionsMap.set(s.heading, s);
    Object.assign(mergedMetadata, {
      Project: lvl.project,
      Type: lvl.type,
      Status: lvl.status,
    });
  }

  const buildResult = () => ({
    levels: outputLevels,
    mergedMetadata,
    mergedSections: [...mergedSectionsMap.values()] as unknown as Section[],
    allDecisions,
    allQuestions,
    truncated: truncated ? true : undefined,
    truncationSignal,
  });

  // Ensure total serialized size respects sizeCap (auxiliary fields add overhead)
  let result = buildResult();
  if (JSON.stringify(result).length > sizeCap) {
    mergedSectionsMap.clear();
    allDecisions.length = 0;
    allQuestions.length = 0;
    if (!truncated) {
      truncated = true;
      truncationSignal = `Context truncated due to size limit. Use brief_get_context with a narrower scope.`;
    }
    result = buildResult();
    while (JSON.stringify(result).length > sizeCap && outputLevels.length > 0) {
      outputLevels.shift();
      outputLevels.forEach((l, i) => {
        l.level = i;
      });
      result = buildResult();
    }
  }
  return result;
}

export function mergeHierarchyContext(
  levels: unknown[],
  options?: { includeSuperseded?: boolean; simulateChildPrecedence?: boolean },
): { decisions: unknown[]; [key: string]: unknown } {
  const includeSuperseded = options?.includeSuperseded ?? false;
  const childFirst = options?.simulateChildPrecedence ?? false;
  const normalized = levels.map((lvl, idx) => extractLevel(lvl, idx));
  const ordered = childFirst
    ? [...normalized].sort((a, b) => b.depth - a.depth)
    : normalized;
  const allDecisions: Decision[] = [];
  const allQuestions: Question[] = [];
  for (const lvl of ordered) {
    allDecisions.push(
      ...lvl.decisions.filter((d) =>
        includeSuperseded ? true : d.status !== "superseded",
      ),
    );
    allQuestions.push(...lvl.questions);
  }
  return { decisions: allDecisions, questions: allQuestions };
}
