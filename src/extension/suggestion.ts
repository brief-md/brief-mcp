export async function suggestExtensions(
  _params: Record<string, unknown>,
): Promise<{
  suggestions: Array<{
    extension: string;
    sourceTier?: number;
    suggestedOntologies?: Array<{
      available?: boolean;
      statusNote?: string;
      [key: string]: unknown;
    }>;
    [key: string]: unknown;
  }>;
  bootstrapSuggestions?: unknown[];
  registryNote?: string;
  signal?: string;
  tier1Suggestions?: unknown[];
  tier2Suggestions?: unknown[];
  tier3BootstrapSuggestions?: unknown[];
}> {
  return { suggestions: [] };
}
