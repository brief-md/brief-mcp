// src/hierarchy/position.ts — WP3/GAP-B+H: Hierarchy Position ("Where Am I?")

import fs from "node:fs";
import path from "node:path";
import { readBriefMetadata } from "../io/project-state.js"; // check-rules-ignore
import { getTypeGuide } from "../type-intelligence/loading.js"; // check-rules-ignore
import { scanDownward } from "./discovery.js";
import { walkUpward } from "./walker.js";

interface ProjectInfo {
  name: string;
  type: string;
  path: string;
}

/** Strip /BRIEF.md or \BRIEF.md from a path to get the directory. */
function toDir(p: string): string {
  return p.replace(/[/\\]BRIEF\.md$/i, "");
}

/** Resolve a path to its real filesystem path for consistent comparisons. */
async function resolveReal(p: string): Promise<string> {
  try {
    return await fs.promises.realpath(p);
  } catch {
    return path.resolve(p);
  }
}

export async function getHierarchyPosition(params: {
  projectPath: string;
  workspaceRoots?: string[];
}): Promise<{
  currentProject: ProjectInfo;
  depth: number;
  parent?: ProjectInfo;
  siblings: ProjectInfo[];
  children: ProjectInfo[];
  typeGuideContext?: {
    declaredParentTypes: string[];
    declaredChildTypes: string[];
  };
  signal: string;
}> {
  const { projectPath, workspaceRoots } = params;

  // Resolve real path for consistent comparisons (walker uses realpath internally)
  const normalizedSelf = await resolveReal(projectPath);

  // Also resolve workspace roots so walker's stop conditions match
  const resolvedRoots: string[] = [];
  if (workspaceRoots) {
    for (const r of workspaceRoots) {
      resolvedRoots.push(await resolveReal(r));
    }
  }

  // Read current project metadata
  let currentMeta: { project: string; type: string };
  try {
    currentMeta = await readBriefMetadata(projectPath);
  } catch {
    currentMeta = { project: "(unknown)", type: "(unknown)" };
  }

  const currentProject: ProjectInfo = {
    name: currentMeta.project || "(unnamed)",
    type: currentMeta.type || "(untyped)",
    path: projectPath,
  };

  // Walk upward to find ancestors
  // walkUpward returns BRIEF.md paths: [self/BRIEF.md, parent/BRIEF.md, ...]
  // Don't pass workspaceRoots — walker stops BEFORE collecting at workspace roots,
  // which would miss the parent. Instead, cap ancestors after collection.
  const ancestorBriefPaths = await walkUpward(projectPath, {});

  // Convert to directory paths (realpath-resolved) and filter out self.
  // Stop at (but include) workspace root if it appears.
  const ancestorDirs: string[] = [];
  for (const p of ancestorBriefPaths) {
    const dir = await resolveReal(toDir(p));
    if (dir === normalizedSelf) continue;
    ancestorDirs.push(dir);
    // Stop at workspace root boundary (inclusive)
    if (resolvedRoots.length > 0 && resolvedRoots.includes(dir)) break;
  }

  const depth = ancestorDirs.length;

  // Get parent info (first ancestor after self)
  let parent: ProjectInfo | undefined;
  if (ancestorDirs.length > 0) {
    const parentPath = ancestorDirs[0];
    try {
      const parentMeta = await readBriefMetadata(parentPath);
      parent = {
        name: parentMeta.project || "(unnamed)",
        type: parentMeta.type || "(untyped)",
        path: parentPath,
      };
    } catch {
      parent = { name: "(unknown)", type: "(unknown)", path: parentPath };
    }
  }

  // Scan downward for children (depth 1)
  // scanDownward returns entries where .path is the BRIEF.md file path
  const childResults = await scanDownward(projectPath, { depthLimit: 1 });
  const children: ProjectInfo[] = [];
  for (const c of childResults) {
    const cp = (c as { path?: string }).path;
    if (!cp) continue;
    const dir = await resolveReal(path.dirname(cp));
    if (dir !== normalizedSelf) {
      children.push({
        name: c.name || "(unnamed)",
        type: c.type || "(untyped)",
        path: path.dirname(cp),
      });
    }
  }

  // Find siblings (other children of same parent)
  const siblings: ProjectInfo[] = [];
  if (parent) {
    const parentChildren = await scanDownward(parent.path, { depthLimit: 1 });
    const parentResolved = await resolveReal(parent.path);
    for (const c of parentChildren) {
      const childPath = (c as { path?: string }).path;
      if (!childPath) continue;
      const childDir = await resolveReal(path.dirname(childPath));
      if (childDir !== normalizedSelf && childDir !== parentResolved) {
        siblings.push({
          name: c.name || "(unnamed)",
          type: c.type || "(untyped)",
          path: path.dirname(childPath),
        });
      }
    }
  }

  // Type guide context (best-effort)
  let typeGuideContext:
    | { declaredParentTypes: string[]; declaredChildTypes: string[] }
    | undefined;
  if (currentProject.type && currentProject.type !== "(untyped)") {
    try {
      const tgResult = await getTypeGuide({ type: currentProject.type });
      if (!tgResult.isGeneric && tgResult.guide?.metadata) {
        typeGuideContext = {
          declaredParentTypes: tgResult.guide.metadata.commonParentTypes ?? [],
          declaredChildTypes: tgResult.guide.metadata.commonChildTypes ?? [],
        };
      }
    } catch {
      /* best-effort */
    }
  }

  // Build signal
  const parts = [currentProject.type];
  if (parent) parts.unshift(parent.type);
  const ancestry = parts.join(" → ");
  const signal = `You're at depth ${depth} (${currentProject.type}) in: ${ancestry}. ${children.length} children, ${siblings.length} siblings.`;

  return {
    currentProject,
    depth,
    parent,
    siblings,
    children,
    typeGuideContext,
    signal,
  };
}
