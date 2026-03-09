// src/workspace/creation.ts — TASK-22: Project creation

import { suggestExtensions } from "../extension/suggestion.js"; // check-rules-ignore
import {
  ensureProjectDir,
  readBriefMetadata,
  writeBrief,
} from "../io/project-state.js"; // check-rules-ignore
import { getTypeGuide } from "../type-intelligence/loading.js"; // check-rules-ignore

// ---------------------------------------------------------------------------
// Reserved Windows names
// ---------------------------------------------------------------------------

const WINDOWS_RESERVED = new Set([
  "con",
  "prn",
  "aux",
  "nul",
  "com1",
  "com2",
  "com3",
  "com4",
  "com5",
  "com6",
  "com7",
  "com8",
  "com9",
  "lpt1",
  "lpt2",
  "lpt3",
  "lpt4",
  "lpt5",
  "lpt6",
  "lpt7",
  "lpt8",
  "lpt9",
]);

// ---------------------------------------------------------------------------
// slugifyProjectName (FS-03)
// ---------------------------------------------------------------------------

export function slugifyProjectName(name: string): string {
  // NFKD normalize and strip combining marks (diacritics)
  let slug = name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");

  // Lowercase
  slug = slug.toLowerCase();

  // Replace spaces and underscores with hyphens
  slug = slug.replace(/[\s_]+/g, "-");

  // Strip non-[a-z0-9-] characters
  slug = slug.replace(/[^a-z0-9-]/g, "");

  // Collapse multiple hyphens
  slug = slug.replace(/-{2,}/g, "-");

  // Trim leading/trailing hyphens
  slug = slug.replace(/^-+/, "").replace(/-+$/, "");

  // Truncate to 64 chars
  if (slug.length > 64) {
    slug = slug.slice(0, 64).replace(/-+$/, "");
  }

  // Reject empty slug
  if (slug.length === 0) {
    throw new Error(
      `Project name "${name}" produces an empty slug after sanitisation.`,
    );
  }

  // Prefix Windows reserved names
  if (WINDOWS_RESERVED.has(slug)) {
    slug = `project-${slug}`;
  }

  return slug;
}

// ---------------------------------------------------------------------------
// normalizeProjectType (COMPAT-06)
// ---------------------------------------------------------------------------

export function normalizeProjectType(type: string): string {
  const result = type
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
  return result || "unknown";
}

// ---------------------------------------------------------------------------
// Deprecated shims
// ---------------------------------------------------------------------------

export interface CreateProjectParams {
  projectName: string;
  displayName?: string;
  type: string;
  workspaceRoot?: string;
  parentProject?: string;
  whatThisIs?: string;
  whatThisIsNot?: string;
  whyThisExists?: string;
}

export interface CreateProjectResult {
  projectPath: string;
  filePath: string;
  created: boolean;
  initializedExisting?: boolean;
  firstProject?: boolean;
  suggestExtensions?: boolean;
}

export interface CreateSubProjectParams {
  name: string;
  displayName?: string;
  type?: string;
  subdirectory?: string;
  whatThisIs?: string;
  parentPath?: string;
}

/** @deprecated Use the new params-object overload. */
export async function isFirstProject(
  _workspaceRoots: string[],
): Promise<boolean> {
  throw new Error("Deprecated: isFirstProject");
}

// ---------------------------------------------------------------------------
// createProject
// ---------------------------------------------------------------------------

export async function createProject(params: {
  projectName: string;
  displayName?: string;
  type?: string;
  whatThisIs?: string;
  whatThisIsNot?: string;
  whyThisExists?: string;
  workspaceRoot?: string;
  parentProject?: string;
  isFirstProject?: boolean;
  directoryExists?: boolean;
  hasBrief?: boolean;
}): Promise<{
  content: string;
  success: boolean;
  filePath: string;
  briefMdPath: string;
  path: string;
  directoriesCreated: number;
  warnings: string[];
  workspaceRoot: string;
  workspaceRootSource: string;
  parentLinked?: boolean;
  initializedExisting?: boolean;
  firstProject?: boolean;
  suggestExtensions?: boolean;
  tutorialOffer?: boolean;
  typeGuide?: {
    slug: string;
    body?: string;
    source: string;
    suggestedExtensions?: string[];
    suggestedOntologies?: string[];
    isGeneric?: boolean;
    signal?: string;
  };
  extensionSuggestions?: {
    tier1?: Array<{ name: string; reason: string; confidence: string }>;
    tier2?: Array<{ name: string; reason: string; confidence: string }>;
    tier3?: string[];
  };
  ontologySuggestions?: Array<{
    name: string;
    fromExtension: string;
    status: string;
  }>;
  setupPhase?: string;
  nextSteps?: string[];
}> {
  const {
    projectName,
    displayName,
    type,
    whatThisIs,
    whatThisIsNot,
    whyThisExists,
    workspaceRoot,
    parentProject,
    isFirstProject: isFirst,
    directoryExists,
    hasBrief,
  } = params;

  const warnings: string[] = [];

  // --- Existing directory with BRIEF.md → error (FS-10) ---
  if (directoryExists && hasBrief) {
    throw new Error("Project already exists at this location.");
  }

  // --- Type validation (COMPAT-04) ---
  if (!type) {
    warnings.push("type is a required field per the BRIEF spec.");
  }

  // --- Resolve workspace root ---
  const resolvedRoot = workspaceRoot || "/default-workspace";
  const rootSource = workspaceRoot ? "config" : "default";

  // --- Build slug & paths ---
  let slug: string;
  try {
    slug = slugifyProjectName(projectName);
  } catch {
    // Graceful fallback for names that produce empty slugs
    slug = "unnamed-project";
    warnings.push(
      `Project name "${projectName}" could not be slugified; using fallback.`,
    );
  }

  let projectPath: string;
  if (parentProject) {
    // Strip BRIEF.md from parent path if present (FS-13)
    let parentDir = parentProject;
    if (/[/\\]BRIEF\.md$/i.test(parentDir)) {
      parentDir = parentDir.replace(/[/\\]BRIEF\.md$/i, "");
    }
    projectPath = `${parentDir}/${slug}`;
  } else {
    projectPath = `${resolvedRoot}/${slug}`;
  }

  const briefMdPath = `${projectPath}/BRIEF.md`;

  // --- Build BRIEF.md content ---
  const displayLabel = displayName || projectName;
  const normalizedType = type ? normalizeProjectType(type) : "unknown";
  const createdDate = new Date().toISOString().slice(0, 10);

  let content = `**Project:** ${displayLabel}\n`;
  content += `**Type:** ${normalizedType}\n`;
  content += `**Status:** concept\n`;
  content += `**Created:** ${createdDate}\n`;

  if (parentProject) {
    content += `\nParent: ${parentProject}\n`;
    content += "This is a sub-project linked to its parent.\n";
  }

  if (whatThisIs) {
    content += `\n## What This Is\n\n${whatThisIs}\n`;
  }
  if (whatThisIsNot) {
    content += `\n## What This Is NOT\n\n${whatThisIsNot}\n`;
  }
  if (whyThisExists) {
    content += `\n## Why This Exists\n\n${whyThisExists}\n`;
  }

  // --- Write BRIEF.md to disk ---
  await ensureProjectDir(projectPath);
  await writeBrief(projectPath, content);

  // --- Build result ---
  const result: Record<string, unknown> = {
    content,
    success: true,
    filePath: briefMdPath,
    briefMdPath,
    path: projectPath,
    directoriesCreated: directoryExists ? 0 : 2,
    warnings,
    workspaceRoot: resolvedRoot,
    workspaceRootSource: rootSource,
  };

  // Initialized existing directory (FS-10)
  if (directoryExists && !hasBrief) {
    result.initializedExisting = true;
  }

  // Parent project linking (FS-13)
  if (parentProject) {
    result.parentLinked = true;
  }

  // First project flag
  if (isFirst === true) {
    result.firstProject = true;
    result.suggestExtensions = true;
  }

  // Extension suggestion — whenever type is declared
  if (type) {
    result.suggestExtensions = true;
  }

  // --- Resolve type guide inline (Gap 1) ---
  if (type) {
    try {
      const tgResult = await getTypeGuide({ type: normalizedType });
      result.typeGuide = {
        slug: tgResult.guide.slug,
        body: tgResult.guide.body,
        source: tgResult.guide.metadata.source,
        suggestedExtensions: tgResult.guide.metadata.suggestedExtensions,
        suggestedOntologies: tgResult.guide.metadata.suggestedOntologies,
        isGeneric: tgResult.isGeneric,
        signal: tgResult.signal,
      };
    } catch {
      /* best-effort */
    }
  }

  // --- Suggest extensions inline (Gap 2) ---
  if (type) {
    try {
      const suggestions = await suggestExtensions({
        projectType: normalizedType,
        description: whatThisIs ?? "",
      });
      result.extensionSuggestions = {
        tier1: suggestions.tier1Suggestions?.map((s) => ({
          name: s.name,
          reason: s.reason,
          confidence: s.confidence,
        })),
        tier2: suggestions.tier2Suggestions?.map((s) => ({
          name: s.name,
          reason: s.reason,
          confidence: s.confidence,
        })),
        tier3: suggestions.tier3BootstrapSuggestions,
      };
    } catch {
      /* best-effort */
    }
  }

  // --- Surface associated ontologies (Gap 9) ---
  const extSuggestions = result.extensionSuggestions as
    | {
        tier1?: Array<Record<string, unknown>>;
        tier2?: Array<Record<string, unknown>>;
      }
    | undefined;
  const typeGuideResult = result.typeGuide as
    | { suggestedOntologies?: string[] }
    | undefined;

  if (extSuggestions || typeGuideResult?.suggestedOntologies) {
    const ontologies: Array<{
      name: string;
      fromExtension: string;
      status: string;
    }> = [];
    const seen = new Set<string>();

    // From type guide
    if (typeGuideResult?.suggestedOntologies) {
      for (const ont of typeGuideResult.suggestedOntologies) {
        if (!seen.has(ont)) {
          seen.add(ont);
          ontologies.push({
            name: ont,
            fromExtension: "(type-guide)",
            status: "unknown",
          });
        }
      }
    }

    if (ontologies.length > 0) {
      result.ontologySuggestions = ontologies;
    }
  }

  // --- Lifecycle signals (Gap 6) ---
  const nextSteps: string[] = [];
  if (!type) {
    result.setupPhase = "needs_type";
    nextSteps.push("Determine the project type with the user");
  } else if (
    (result.typeGuide as { isGeneric?: boolean } | undefined)?.isGeneric
  ) {
    result.setupPhase = "explore_type";
    nextSteps.push(
      "Use the generic guide's 10 Universal Dimensions to explore this project type with the user",
      "Then call brief_create_type_guide to create a domain-specific guide",
    );
  } else {
    result.setupPhase = "review_suggestions";
  }
  if (result.extensionSuggestions) {
    nextSteps.push(
      "Review suggested extensions and call brief_add_extension for each relevant one",
    );
  }
  if (
    Array.isArray(result.ontologySuggestions) &&
    result.ontologySuggestions.length > 0
  ) {
    nextSteps.push(
      "Consider installing suggested ontologies with brief_install_ontology",
    );
  }
  if (nextSteps.length > 0) {
    result.nextSteps = nextSteps;
  }

  return result as Awaited<ReturnType<typeof createProject>>;
}

// ---------------------------------------------------------------------------
// createSubProject (FS-14)
// ---------------------------------------------------------------------------

export async function createSubProject(params: {
  name: string;
  displayName?: string;
  type?: string;
  whatThisIs?: string;
  parentPath: string;
  subdirectory?: string;
  inheritTypeFromParent?: boolean;
}): Promise<{
  success: boolean;
  path: string;
  type?: string;
  typeInherited?: boolean;
  content?: string;
}> {
  const {
    name,
    displayName,
    type,
    whatThisIs,
    parentPath,
    subdirectory,
    inheritTypeFromParent,
  } = params;

  const slug = slugifyProjectName(name);
  const parent = parentPath || "/root";

  let projectPath: string;
  if (subdirectory) {
    projectPath = `${parent}/${subdirectory}/${slug}`;
  } else {
    projectPath = `${parent}/${slug}`;
  }

  let resolvedType = type;
  let typeInherited = false;

  if (!type && inheritTypeFromParent) {
    // Read parent's type from disk
    try {
      const parentMeta = await readBriefMetadata(parent);
      if (parentMeta.type) {
        resolvedType = parentMeta.type;
        typeInherited = true;
      }
    } catch {
      // Parent doesn't exist on disk — fall through without type
    }
  }

  const normalizedType = resolvedType
    ? normalizeProjectType(resolvedType)
    : undefined;

  const displayLabel = displayName || name;

  let content = `**Project:** ${displayLabel}\n`;
  if (normalizedType) {
    content += `**Type:** ${normalizedType}\n`;
  }
  content += `**Status:** concept\n`;
  content += `**Created:** ${new Date().toISOString().slice(0, 10)}\n`;

  if (whatThisIs) {
    content += `\n## What This Is\n\n${whatThisIs}\n`;
  }

  // Write sub-project BRIEF.md to disk
  await ensureProjectDir(projectPath);
  await writeBrief(projectPath, content);

  return {
    success: true,
    path: projectPath,
    type: normalizedType,
    typeInherited: typeInherited || undefined,
    content,
  };
}
