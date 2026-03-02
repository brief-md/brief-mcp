// src/hierarchy/context.ts — stub for TASK-18
// Replace with real implementation during build loop.

import type { AccumulatedContext, HierarchyLevel } from "../types/hierarchy.js";

export interface ContextAssemblyOptions {
  contextDepth?: number;
  sections?: string[];
  includeSuperseded?: boolean;
  sizeLimitBytes?: number;
}

export async function assembleContext(
  _levels: HierarchyLevel[],
  _options?: ContextAssemblyOptions,
): Promise<AccumulatedContext> {
  throw new Error("Not implemented: assembleContext");
}

export function formatLevelLabel(
  _projectType: string,
  _projectName: string,
): string {
  throw new Error("Not implemented: formatLevelLabel");
}

export function detectHierarchyOverrides(
  _childLevels: HierarchyLevel[],
  _parentLevels: HierarchyLevel[],
): Array<{ childDecision: string; parentConstraint: string; note: string }> {
  throw new Error("Not implemented: detectHierarchyOverrides");
}

export function computeExtensionInheritance(
  _levels: HierarchyLevel[],
): string[] {
  throw new Error("Not implemented: computeExtensionInheritance");
}

export function computeOntologyInheritance(
  _levels: HierarchyLevel[],
): import("../types/parser.js").OntologyMetadataEntry[] {
  throw new Error("Not implemented: computeOntologyInheritance");
}
