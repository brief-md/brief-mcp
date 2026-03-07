import type {
  TypeGuide,
  TypeGuideLoadResult,
} from "../types/type-intelligence";

export async function getTypeGuide(_params: Record<string, unknown>): Promise<
  TypeGuideLoadResult & {
    signal?: string;
    yamlFallback?: boolean;
    parentGuide?: TypeGuide;
    circularDetected?: boolean;
    reloaded?: boolean;
    fromCache?: boolean;
    mtimeIndexPopulated?: boolean;
    sourceModified?: boolean;
    jsExecutionPrevented?: boolean;
    aliasExpansionLimited?: boolean;
    expansionCount?: number;
  }
> {
  throw new Error("Not implemented");
}

/** @deprecated Use getTypeGuide */
export const loadTypeGuide = getTypeGuide;

/** @internal Reset module-level state (guide cache, mtime index) between tests */
export function _resetState(): void {
  /* clear all module-level state */
}
