// src/types/cli.ts

export type ExitCode = 0 | 1 | 2 | 130;

export interface GlobalFlags {
  readonly verbose: boolean;
  readonly quiet: boolean;
  readonly noColor: boolean;
  readonly yes: boolean;
  readonly version: boolean;
  readonly help: boolean;
}

export interface CliContext {
  readonly flags: GlobalFlags;
  readonly isTty: boolean;
  readonly colorEnabled: boolean;
  readonly logLevel: string;
}

export interface RegistryEntry {
  readonly name: string;
  readonly displayName: string;
  readonly description: string;
  readonly type: "ontology" | "type-guide";
  readonly installCommand: string[];
  readonly configBlock: Record<string, unknown>;
  readonly requiresToolSetup?: boolean;
  readonly relevantProjectTypes?: string[];
  readonly typeGuideNotes?: string;
  readonly trustLevel: "bundled" | "community" | "external";
}

export interface RegistrySearchResult {
  readonly entry: RegistryEntry;
  readonly matchedOn: string;
}

export interface SetupWizardState {
  readonly aiClientSelected: boolean;
  readonly workspacesConfigured: boolean;
  readonly toolsSelected: boolean;
  readonly directoryCreated: boolean;
  readonly completedAt?: number;
}

export interface ProgressIndicator {
  readonly start: (message: string) => void;
  readonly update: (message: string) => void;
  readonly stop: (message?: string) => void;
}
