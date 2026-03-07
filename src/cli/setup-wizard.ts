// src/cli/setup-wizard.ts — stub for TASK-48

export async function initWizard(_options?: {
  isTTY: boolean;
  yesFlag?: boolean;
  simulateConfigExists?: boolean;
  selectedTools?: string[];
  npxColdStart?: boolean;
  workspaceRoot?: string;
  simulateInterrupt?: boolean;
  interruptAfterStep?: number;
  client?: string;
}): Promise<{
  interactive?: boolean;
  defaultsAccepted?: boolean;
  diffShown?: boolean;
  diffContent?: string;
  commandsDisplayed?: boolean;
  directoryCreated?: boolean;
  bundledInstalled?: boolean;
  generatedConfig?: unknown;
  workspaceRootValid?: boolean;
  lastCompletedStep?: number;
  alreadyComplete?: boolean;
  configPersisted?: boolean;
}> {
  throw new Error("Not implemented");
}

export function generateClientConfig(_options: { client: string }): {
  format: string;
} {
  throw new Error("Not implemented");
}

export function mergeConfig(
  _existing: Record<string, unknown>,
  _incoming: Record<string, unknown>,
): Record<string, unknown> {
  throw new Error("Not implemented");
}

export function getSetupState(): { lastCompletedStep?: number } {
  throw new Error("Not implemented");
}

export async function getToolInstallCommand(_params: {
  tool: string;
  client: string;
}): Promise<{ executable: string; args: string[] }> {
  throw new Error("Not implemented");
}

export async function runSetupWizard(_params?: {
  nonInteractive?: boolean;
  checkStdioConfig?: boolean;
  [key: string]: unknown;
}): Promise<{
  completed: boolean;
  childProcessStdioConfig?: string;
  alreadyComplete?: boolean;
}> {
  throw new Error("Not implemented");
}

/** @internal Reset module-level state for test isolation */
export function _resetState(): void {
  /* clear all module-level state — implementation will populate */
}
