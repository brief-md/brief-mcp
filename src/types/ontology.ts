// src/types/ontology.ts

export interface OntologyPack {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly entriesCount: number;
  readonly filePath: string;
  readonly entryCount?: number;
  readonly referenceCoverage?: number;
  readonly vectorAvailability?: boolean;
  readonly trustLevel?: string;
}

export interface OntologyEntry {
  readonly id: string;
  readonly label: string;
  readonly aliases?: string[];
  readonly description?: string;
  readonly relatedIds?: string[];
  readonly tags?: string[];
  readonly categories?: string[];
  readonly keywords?: string[];
  readonly synonyms?: string[];
  readonly references?: OntologyReference[];
  readonly packId: string;
}

export interface OntologyReference {
  readonly creator?: string;
  readonly title: string;
  readonly type?: string;
  readonly notes?: string;
}

export interface OntologySearchResult {
  readonly entry: OntologyEntry;
  readonly score: number;
  readonly matchedField: string;
  readonly packId: string;
  readonly entryId?: string;
  readonly label?: string;
  readonly matchedFields?: string[];
  readonly matchType?: string;
  readonly matchContext?: {
    matchedTerms?: string[];
    matchedFields?: string[];
  };
  readonly source?: string;
}

export interface ReverseIndexEntry {
  readonly entryId: string;
  readonly referencingPaths: string[];
  readonly count: number;
}

export interface OntologyIndex {
  readonly packId: string;
  readonly entries: Map<string, OntologyEntry>;
  readonly keywordIndex: Map<string, string[]>;
  readonly reverseRefIndex: Map<
    string,
    Array<{
      pack: string;
      entryId: string;
      categories: string[];
      tags: string[];
    }>
  >;
}
