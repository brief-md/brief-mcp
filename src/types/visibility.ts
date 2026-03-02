// src/types/visibility.ts

export type FrameworkSource = "local" | "inherited";

export interface ActiveExtension {
  readonly name: string;
  readonly source: FrameworkSource;
  readonly inheritedFrom?: string;
}

export interface ActiveOntology {
  readonly name: string;
  readonly version?: string;
  readonly tagCount: number;
  readonly source: FrameworkSource;
  readonly inheritedFrom?: string;
}

export interface ProjectFrameworks {
  readonly projectPath: string;
  readonly extensions: ActiveExtension[];
  readonly ontologies: ActiveOntology[];
}

export interface OntologyRemovalResult {
  readonly removed: boolean;
  readonly wasInherited: boolean;
  readonly excludeAdded: boolean;
  readonly tagsRemoved: number;
  readonly filePath: string;
  readonly parentModified?: boolean;
  readonly contentPreserved?: boolean;
  readonly afterContent?: string;
  readonly tagsPreserved?: boolean;
  readonly otherPacksPreserved?: boolean;
}
