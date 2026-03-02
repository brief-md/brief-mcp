// src/types/extensions.ts

export type ExtensionConfidence = "high" | "medium" | "low";

export interface Extension {
  readonly name: string;
  readonly displayName: string;
  readonly description: string;
  readonly heading: string;
  readonly abstractCapabilityDescriptors?: string[];
  readonly typicalSubsections?: string[];
  readonly commonlyAssociatedOntologies?: string[];
  readonly slug?: string;
  readonly sections?: string[];
}

export interface ExtensionSuggestion {
  readonly name: string;
  readonly reason: string;
  readonly confidence: ExtensionConfidence;
  readonly sourceTier: 1 | 2 | 3;
  readonly extension?: string;
  readonly suggestedOntologies?: Array<{
    available: boolean;
    statusNote?: string;
    status?: string;
  }>;
}

export interface ExtensionSuggestionResult {
  readonly tier1Suggestions?: ExtensionSuggestion[];
  readonly tier2Suggestions?: ExtensionSuggestion[];
  readonly tier3BootstrapSuggestions?: string[];
  readonly availabilityChecks?: Record<
    string,
    "available" | "not-found" | "registry-unavailable"
  >;
}
