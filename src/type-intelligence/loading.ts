export async function getTypeGuide(_params: Record<string, unknown>): Promise<{
  isGeneric: boolean;
  guide?: Record<string, unknown>;
  [key: string]: unknown;
}> {
  return { isGeneric: true };
}

/** @deprecated Use getTypeGuide */
export const loadTypeGuide = getTypeGuide;
