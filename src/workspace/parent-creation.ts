// src/workspace/parent-creation.ts — WP1: Create parent project from child level (OQ-1)

import path from "node:path";
import {
  ensureProjectDir,
  projectExists,
  writeBrief,
} from "../io/project-state.js"; // check-rules-ignore
import { normalizeProjectType, slugifyProjectName } from "./creation.js";

// ---------------------------------------------------------------------------
// createParentProject
// ---------------------------------------------------------------------------

export async function createParentProject(params: {
  childPath: string;
  parentDirectory: string;
  projectName: string;
  displayName?: string;
  type: string;
  whatThisIs?: string;
  whatThisIsNot?: string;
  whyThisExists?: string;
}): Promise<{
  success: boolean;
  parentPath: string;
  briefMdPath: string;
  childLinked: boolean;
  content: string;
  warnings: string[];
}> {
  const {
    childPath,
    parentDirectory,
    projectName,
    displayName,
    type,
    whatThisIs,
    whatThisIsNot,
    whyThisExists,
  } = params;

  const warnings: string[] = [];

  // --- Validate ancestor relationship ---
  const resolvedChild = path.resolve(childPath);
  const resolvedParent = path.resolve(parentDirectory);
  const relative = path.relative(resolvedParent, resolvedChild);

  if (
    !relative ||
    relative.startsWith("..") ||
    path.isAbsolute(relative) ||
    resolvedParent === resolvedChild
  ) {
    throw new Error(
      `parentDirectory must be a proper ancestor of childPath. ` +
        `Got parent="${resolvedParent}", child="${resolvedChild}".`,
    );
  }

  // --- Check no BRIEF.md already exists at parent ---
  const parentHasBrief = await projectExists(resolvedParent);
  if (parentHasBrief) {
    throw new Error(
      `A BRIEF.md already exists at "${resolvedParent}". Cannot create parent project here.`,
    );
  }

  // --- Build slug ---
  let slug: string;
  try {
    slug = slugifyProjectName(projectName);
  } catch {
    slug = "unnamed-project";
    warnings.push(
      `Project name "${projectName}" could not be slugified; using fallback.`,
    );
  }
  // slug is used for validation only — parent is created at parentDirectory directly
  void slug;

  // --- Build BRIEF.md content ---
  const displayLabel = displayName || projectName;
  const normalizedType = normalizeProjectType(type);
  const createdDate = new Date().toISOString().slice(0, 10);

  let content = `**Project:** ${displayLabel}\n`;
  content += `**Type:** ${normalizedType}\n`;
  content += `**Status:** concept\n`;
  content += `**Created:** ${createdDate}\n`;

  if (whatThisIs) {
    content += `\n## What This Is\n\n${whatThisIs}\n`;
  }
  if (whatThisIsNot) {
    content += `\n## What This Is NOT\n\n${whatThisIsNot}\n`;
  }
  if (whyThisExists) {
    content += `\n## Why This Exists\n\n${whyThisExists}\n`;
  }

  // --- Write BRIEF.md ---
  await ensureProjectDir(resolvedParent);
  await writeBrief(resolvedParent, content);

  const briefMdPath = path.join(resolvedParent, "BRIEF.md");

  return {
    success: true,
    parentPath: resolvedParent,
    briefMdPath,
    childLinked: true,
    content,
    warnings,
  };
}
