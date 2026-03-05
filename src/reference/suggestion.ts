export async function suggestReference(
  _params: Record<string, unknown>,
): Promise<{
  results: Array<Record<string, unknown>>;
  tierAvailability?: Record<string, unknown>;
  [key: string]: unknown;
}> {
  return { results: [] };
}

export const suggestReferences = suggestReference;

export async function getEntryReferences(
  _params: Record<string, unknown>,
): Promise<{
  references: Array<Record<string, unknown>>;
  [key: string]: unknown;
}> {
  return { references: [] };
}
