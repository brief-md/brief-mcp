// src/types/config.ts

export type TransportMode = "stdio" | "http";
export type OntologySearchMode = "keyword" | "vector";
export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

export interface PackConfig {
  readonly packId: string;
  readonly path: string;
  readonly enabled: boolean;
  readonly excludes?: string[];
  readonly id?: string;
}

export interface BriefConfig {
  readonly workspaces: string[];
  readonly transport: TransportMode;
  readonly port: number;
  readonly ontologySearch: OntologySearchMode;
  readonly embeddingProvider: string | null;
  readonly installedOntologies: PackConfig[];
  readonly tutorialDismissed: boolean;
  readonly logLevel: LogLevel;
  readonly sectionAliases: Record<string, string[]>;
  readonly operationTimeout: number;
  readonly maxPackSize: number;
  readonly maxResponseSize?: number;
  readonly configVersion: number;
  readonly activeProjectPath?: string;
  readonly setupState?: Partial<SetupState>;
  [key: string]: unknown;
}

export interface SetupState {
  readonly aiClientSelected: boolean;
  readonly workspacesConfigured: boolean;
  readonly toolsSelected: boolean;
  readonly directoryCreated: boolean;
}

export interface InternalConfig {
  readonly hierarchyDepthLimit: number;
  readonly contextSizeLimit: number;
  readonly indexMemoryBudget: number;
  readonly projectScanDepth: number;
  readonly writeLockTimeout: number;
  readonly indexStalenessPeriod: number;
}
