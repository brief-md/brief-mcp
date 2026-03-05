export async function lookupReference(
  _params: Record<string, unknown>,
): Promise<{
  results: Array<Record<string, unknown>>;
  [key: string]: unknown;
}> {
  return { results: [] };
}

export function buildReverseIndex(_params?: unknown): {
  index: Record<string, unknown>;
  byReference: Record<string, unknown>;
  [key: string]: unknown;
} {
  return { index: {}, byReference: {} };
}
