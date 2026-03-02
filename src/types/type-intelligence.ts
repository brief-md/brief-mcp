// src/types/type-intelligence.ts

export type TypeGuideSource =
  | "bundled"
  | "ai_generated"
  | "community"
  | "user_edited";

export interface TypeGuideMetadata {
  readonly type: string;
  readonly typeAliases?: string[];
  readonly source: TypeGuideSource;
  readonly version: string;
  readonly suggestedExtensions?: string[];
  readonly suggestedOntologies?: string[];
  readonly commonParentTypes?: string[];
  readonly commonChildTypes?: string[];
  readonly bootstrapping?: boolean;
  readonly createdByProject?: string;
  readonly parentType?: string;
}

export interface TypeGuide {
  readonly slug: string;
  readonly displayName: string;
  readonly metadata: TypeGuideMetadata;
  readonly content: string;
  readonly path: string;
  readonly body?: string;
}

export interface TypeGuideLoadResult {
  readonly guide: TypeGuide;
  readonly matchedViaAlias?: boolean;
  readonly aliasUsed?: string;
  readonly isGeneric?: boolean;
  readonly mode?: "adaptive";
}

export interface TypeGuideMtimeIndex {
  readonly [filePath: string]: number;
}
