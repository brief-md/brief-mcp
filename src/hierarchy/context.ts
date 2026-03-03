// src/hierarchy/context.ts — stub for TASK-18
// Replace with real implementation during build loop.

import type { HierarchyLevel } from "../types/hierarchy.js";
import type { OntologyMetadataEntry } from "../types/parser.js";

// ---------------------------------------------------------------------------
// Primary exports (match test expectations)
// ---------------------------------------------------------------------------

export interface ContextAssemblyOptions {
  sizeCap?: number;
  contextDepth?: number;
  includeSuperseded?: boolean;
}

export async function assembleContext(
  _levels: unknown[] | HierarchyLevel[],
  _options?: ContextAssemblyOptions,
): Promise<{
  levels: Array<{
    project: string;
    isAdvisory?: boolean;
    fullContent?: boolean;
    metadataOnly?: boolean;
    decisions?: unknown[];
    label?: string;
    recentDecisions?: unknown[];
    sections?: unknown[];
    level?: number;
    [key: string]: unknown;
  }>;
  truncated?: boolean;
  truncationSignal?: string;
}> {
  throw new Error("Not implemented: assembleContext");
}

export function computeInheritance(
  _parent: object,
  _child: object,
): { extensions: string[]; ontologies: unknown[] } {
  throw new Error("Not implemented: computeInheritance");
}

export function detectOverrides(_parent: object, _child: object): string[] {
  throw new Error("Not implemented: detectOverrides");
}

export function filterSections(
  _sections: unknown[],
  _filter: unknown,
): unknown[] {
  throw new Error("Not implemented: filterSections");
}

export function labelLevel(_type: string, _name: string): string {
  throw new Error("Not implemented: labelLevel");
}

export function mergeHierarchyContext(
  _levels: unknown[],
  _options?: unknown,
): { decisions: unknown[]; [key: string]: unknown } {
  throw new Error("Not implemented: mergeHierarchyContext");
}

// ---------------------------------------------------------------------------
// Deprecated shims (kept for backward compatibility)
// ---------------------------------------------------------------------------

/** @deprecated Use labelLevel instead */
export function formatLevelLabel(
  _projectType: string,
  _projectName: string,
): string {
  throw new Error("Not implemented: formatLevelLabel");
}

/** @deprecated Use detectOverrides instead */
export function detectHierarchyOverrides(
  _childLevels: HierarchyLevel[],
  _parentLevels: HierarchyLevel[],
): Array<{ childDecision: string; parentConstraint: string; note: string }> {
  throw new Error("Not implemented: detectHierarchyOverrides");
}

/** @deprecated Use computeInheritance instead */
export function computeExtensionInheritance(
  _levels: HierarchyLevel[],
): string[] {
  throw new Error("Not implemented: computeExtensionInheritance");
}

/** @deprecated Use computeInheritance instead */
export function computeOntologyInheritance(
  _levels: HierarchyLevel[],
): OntologyMetadataEntry[] {
  throw new Error("Not implemented: computeOntologyInheritance");
}
