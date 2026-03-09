// src/hierarchy/tree.ts — WP3/GAP-B+H: Hierarchy Tree View

import fs from "node:fs";
import path from "node:path";
import { readBriefMetadata } from "../io/project-state.js"; // check-rules-ignore
import { scanDownward } from "./discovery.js";

export interface TreeNode {
  name: string;
  type: string;
  path: string;
  children: TreeNode[];
}

/** Resolve a path to its real filesystem path for consistent comparisons. */
async function resolveReal(p: string): Promise<string> {
  try {
    return await fs.promises.realpath(p);
  } catch {
    return path.resolve(p);
  }
}

export async function buildHierarchyTree(params: {
  rootPath: string;
  depthLimit?: number;
  includeHealthCheck?: boolean;
}): Promise<{
  tree: TreeNode;
  ascii: string;
  totalProjects: number;
  maxDepth: number;
  healthIssues?: Array<{ path: string; issue: string }>;
}> {
  const { rootPath, depthLimit = 5, includeHealthCheck = false } = params;
  // Use realpath for consistent comparison with scanDownward results
  const normalizedRoot = await resolveReal(rootPath);

  // Read root metadata
  let rootMeta: { project: string; type: string };
  try {
    rootMeta = await readBriefMetadata(rootPath);
  } catch {
    rootMeta = { project: "(unknown)", type: "(unknown)" };
  }

  const root: TreeNode = {
    name: rootMeta.project || path.basename(rootPath),
    type: rootMeta.type || "(untyped)",
    path: rootPath,
    children: [],
  };

  // Scan all descendants (returns entries with .path = BRIEF.md file path)
  const allDescendants = await scanDownward(rootPath, { depthLimit });

  // Build tree by directory containment
  const nodeMap = new Map<string, TreeNode>();
  nodeMap.set(normalizedRoot, root);

  // Convert to dir paths, filter self, sort by path length (parents first)
  const sorted: Array<{ name: string; type: string; dirPath: string }> = [];
  for (const d of allDescendants) {
    if (!d.path) continue;
    const dir = await resolveReal(path.dirname(d.path));
    if (dir !== normalizedRoot) {
      sorted.push({ name: d.name, type: d.type, dirPath: dir });
    }
  }
  sorted.sort((a, b) => a.dirPath.length - b.dirPath.length);

  for (const desc of sorted) {
    const node: TreeNode = {
      name: desc.name || path.basename(desc.dirPath),
      type: desc.type || "(untyped)",
      path: desc.dirPath,
      children: [],
    };
    nodeMap.set(desc.dirPath, node);

    // Find parent by walking up directory path
    let parentDir = path.dirname(desc.dirPath);
    let parentNode: TreeNode | undefined;
    while (parentDir.length >= normalizedRoot.length) {
      parentNode = nodeMap.get(parentDir);
      if (parentNode) break;
      parentDir = path.dirname(parentDir);
    }

    if (parentNode) {
      parentNode.children.push(node);
    } else {
      root.children.push(node);
    }
  }

  // Count total projects and max depth
  let totalProjects = 0;
  let maxDepth = 0;

  function countNodes(node: TreeNode, depth: number): void {
    totalProjects++;
    if (depth > maxDepth) maxDepth = depth;
    for (const child of node.children) {
      countNodes(child, depth + 1);
    }
  }
  countNodes(root, 0);

  // Render ASCII tree
  const ascii = renderAscii(root);

  // Health check
  let healthIssues: Array<{ path: string; issue: string }> | undefined;
  if (includeHealthCheck) {
    healthIssues = [];
    function checkHealth(node: TreeNode): void {
      if (!node.type || node.type === "(untyped)") {
        healthIssues?.push({ path: node.path, issue: "Missing project type" });
      }
      if (!node.name || node.name === "(unknown)") {
        healthIssues?.push({
          path: node.path,
          issue: "Missing project name",
        });
      }
      for (const child of node.children) {
        checkHealth(child);
      }
    }
    checkHealth(root);
  }

  return { tree: root, ascii, totalProjects, maxDepth, healthIssues };
}

function renderAscii(
  node: TreeNode,
  prefix = "",
  isLast = true,
  isRoot = true,
): string {
  const connector = isRoot ? "" : isLast ? "└── " : "├── ";
  const typeLabel = node.type !== "(untyped)" ? ` [${node.type}]` : "";
  let result = `${prefix}${connector}${node.name}${typeLabel}\n`;

  const childPrefix = isRoot ? "" : prefix + (isLast ? "    " : "│   ");
  for (let i = 0; i < node.children.length; i++) {
    const isChildLast = i === node.children.length - 1;
    result += renderAscii(node.children[i], childPrefix, isChildLast, false);
  }

  return result;
}
