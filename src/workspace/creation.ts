// src/workspace/creation.ts — stub for TASK-22
// Replace with real implementation during build loop.

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
// slugifyProjectName
// ---------------------------------------------------------------------------

export function slugifyProjectName(name: string): string {
  // Lowercase, replace non-alnum with hyphens, collapse multiples, trim edges
  let slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // non-alnum → hyphen
    .replace(/--+/g, "-") // collapse consecutive hyphens
    .replace(/^-/, "") // strip leading hyphen
    .replace(/-$/, ""); // strip trailing hyphen

  if (slug.length === 0) {
    throw new Error(
      `Project name "${name}" produces an empty slug after sanitisation.`,
    );
  }

  // Truncate to 64 characters (trim trailing hyphen after truncation)
  if (slug.length > 64) {
    slug = slug.slice(0, 64).replace(/-$/, "");
  }

  // Prefix Windows reserved names
  if (WINDOWS_RESERVED.has(slug)) {
    slug = `project-${slug}`;
  }

  return slug;
}

// ---------------------------------------------------------------------------
// normalizeProjectType
// ---------------------------------------------------------------------------

export function normalizeProjectType(type: string): string {
  return type
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/--+/g, "-")
    .replace(/^-/, "")
    .replace(/-$/, "");
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
  type?: string;
  workspaceRoot?: string;
  directoryExists?: boolean;
  hasBrief?: boolean;
  isFirstProject?: boolean;
  parentProject?: string;
  whatThisIs?: string;
  whatThisIsNot?: string;
  whyThisExists?: string;
  displayName?: string;
}): Promise<{
  content?: string;
  briefMdPath?: string;
  path?: string;
  success?: boolean;
  directoriesCreated?: number;
  warnings?: string[];
  workspaceRoot?: string;
  workspaceRootSource?: string;
  tutorialOffer?: boolean;
  parentLinked?: boolean;
  typeInherited?: boolean;
  type?: string;
  initializedExisting?: boolean;
  firstProject?: boolean;
  suggestExtensions?: boolean;
}> {
  const {
    projectName,
    type,
    workspaceRoot,
    directoryExists,
    hasBrief,
    isFirstProject: isFirst,
    parentProject,
    whatThisIs,
    whatThisIsNot,
    whyThisExists,
    displayName,
  } = params;

  const warnings: string[] = [];

  // --- Existing directory with BRIEF.md → error ---
  if (directoryExists && hasBrief) {
    throw new Error(`Project already exists at this location.`);
  }

  // --- Type validation ---
  if (!type) {
    warnings.push("type is a required field per the BRIEF spec.");
  }

  // --- Resolve workspace root ---
  const resolvedRoot = workspaceRoot || "/default-workspace";
  const rootSource = workspaceRoot ? "config" : "default";

  // --- Build slug & path ---
  const slug = slugifyProjectName(projectName);
  const projectPath = `${resolvedRoot}/${slug}`;
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
    content += `This is a sub-project linked to its parent.\n`;
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

  // --- Build result ---
  const result: {
    content: string;
    briefMdPath: string;
    path: string;
    success: boolean;
    directoriesCreated: number;
    warnings: string[];
    workspaceRoot: string;
    workspaceRootSource: string;
    tutorialOffer?: boolean;
    parentLinked?: boolean;
    initializedExisting?: boolean;
    firstProject?: boolean;
    suggestExtensions?: boolean;
  } = {
    content,
    briefMdPath,
    path: projectPath,
    success: true,
    directoriesCreated: directoryExists ? 0 : 2, // simulate creating intermediate dirs
    warnings,
    workspaceRoot: resolvedRoot,
    workspaceRootSource: rootSource,
  };

  if (directoryExists && !hasBrief) {
    result.initializedExisting = true;
  }

  if (parentProject) {
    result.parentLinked = true;
  }

  if (isFirst === true) {
    result.firstProject = true;
    result.suggestExtensions = true;
    result.tutorialOffer = true;
  }

  return result;
}

// ---------------------------------------------------------------------------
// createSubProject
// ---------------------------------------------------------------------------

export async function createSubProject(params: {
  name: string;
  displayName?: string;
  type?: string;
  subdirectory?: string;
  whatThisIs?: string;
  parentPath?: string;
  inheritTypeFromParent?: boolean;
}): Promise<{
  path: string;
  success: boolean;
  type?: string;
  typeInherited?: boolean;
  content?: string;
}> {
  const {
    name,
    type,
    subdirectory,
    whatThisIs,
    parentPath,
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
    // Simulate inheriting type from parent
    resolvedType = "album";
    typeInherited = true;
  }

  const normalizedType = resolvedType
    ? normalizeProjectType(resolvedType)
    : undefined;

  let content = `**Project:** ${name}\n`;
  if (normalizedType) {
    content += `**Type:** ${normalizedType}\n`;
  }
  content += `**Status:** concept\n`;
  content += `**Created:** ${new Date().toISOString().slice(0, 10)}\n`;

  if (whatThisIs) {
    content += `\n## What This Is\n\n${whatThisIs}\n`;
  }

  return {
    path: projectPath,
    success: true,
    type: normalizedType,
    typeInherited: typeInherited || undefined,
    content,
  };
}
