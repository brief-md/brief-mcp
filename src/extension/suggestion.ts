import type { ExtensionSuggestionResult } from "../types/extensions.js";

export async function suggestExtensions(_params: {
  projectType: string;
  description?: string;
  activeExtensions?: string[];
  installedOntologies?: string[];
  simulateRegistryDown?: boolean;
}): Promise<
  ExtensionSuggestionResult & { registryNote?: string; signal?: string }
> {
  return {};
}
