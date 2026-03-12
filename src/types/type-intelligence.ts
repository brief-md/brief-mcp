// src/types/type-intelligence.ts

export type TypeGuideSource =
  | "bundled"
  | "ai_generated"
  | "community"
  | "user_edited";

export interface SuggestedExtensionSubsection {
  readonly name: string;
  readonly mode: "ontology" | "freeform";
  readonly ontology?: string; // pack name, required when mode === "ontology"
}

export interface SuggestedExtension {
  readonly slug: string;
  readonly description: string;
  readonly subsections: SuggestedExtensionSubsection[];
}

export interface SuggestedOntology {
  readonly name: string;
  readonly description: string;
  readonly origin: "bundled" | "url" | "custom";
  readonly version: string;
  readonly url?: string; // required when origin === "url"
  readonly generated_from?: string; // extension slug, set when origin === "custom"
}

export interface TypeGuideMetadata {
  readonly type: string;
  readonly typeAliases?: string[];
  readonly source: TypeGuideSource;
  readonly version: string;
  readonly suggestedExtensions?: SuggestedExtension[];
  readonly suggestedOntologies?: SuggestedOntology[];
  readonly commonParentTypes?: string[];
  readonly commonChildTypes?: string[];
  readonly bootstrapping?: boolean;
  readonly createdByProject?: string;
  readonly parentType?: string;
  readonly conflictPatterns?: ReadonlyArray<readonly [string, string]>;
  readonly referenceSources?: string[];
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
  readonly is_generic?: boolean;
  readonly mode?: "adaptive";
}

export interface TypeGuideMtimeIndex {
  readonly [filePath: string]: number;
}
