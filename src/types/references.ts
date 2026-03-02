// src/types/references.ts

export interface Reference {
  readonly fromId: string;
  readonly toId: string;
  readonly relationshipType: string;
  readonly context?: string;
  readonly id?: string;
  readonly creator?: string;
  readonly title?: string;
  readonly notes?: string;
  readonly packId?: string;
}

export interface ReferenceLink {
  readonly sourcePack: string;
  readonly sourceEntry: string;
  readonly targetPack: string;
  readonly targetEntry: string;
  readonly relationship: string;
  readonly pack?: string;
  readonly id?: string;
}

export interface ReferenceEntry {
  readonly creator?: string;
  readonly title: string;
  readonly notes?: string;
  readonly section: string;
  readonly ontologyLinks?: Array<{ pack: string; entryId: string }>;
}

export interface ReverseReferenceIndexEntry {
  readonly pack: string;
  readonly entryId: string;
  readonly categories: string[];
  readonly tags: string[];
  readonly creator?: string;
  readonly title: string;
}

export type ReferenceSourceTier = 1 | 2 | 3;

export interface SuggestedReference {
  readonly entry: ReverseReferenceIndexEntry;
  readonly sourceTier: ReferenceSourceTier;
}

export interface ReferenceSuggestionResult {
  readonly suggestions: SuggestedReference[];
  readonly hasAiKnowledgeTier: boolean;
  readonly hasWebSearchTier: boolean;
  readonly derivedContext?: Record<string, unknown>;
}
