// src/cli/setup-wizard.ts — stub for TASK-48

export async function initWizard(_params?: Record<string, unknown>): Promise<{
  completed: boolean;
  [key: string]: unknown;
}> {
  return { completed: false };
}

export function getSetupState(_params?: Record<string, unknown>): {
  configured: boolean;
  lastCompletedStep?: number;
  [key: string]: unknown;
} {
  return { configured: false };
}

export function generateClientConfig(_params?: Record<string, unknown>): {
  config: Record<string, unknown>;
  format?: string;
  [key: string]: unknown;
} {
  const client = _params?.client as string | undefined;
  return { config: {}, format: client };
}

export function mergeConfig(
  _existing?: Record<string, unknown>,
  _incoming?: Record<string, unknown>,
): {
  merged: boolean;
  existingTool?: unknown;
  newTool?: unknown;
  [key: string]: unknown;
} {
  return {
    merged: true,
    existingTool: _existing,
    newTool: _incoming,
  };
}

export async function getToolInstallCommand(
  _params?: Record<string, unknown>,
): Promise<{
  executable: string;
  args: string[];
  [key: string]: unknown;
}> {
  return { executable: "npx", args: [] };
}

export async function runSetupWizard(
  _params?: Record<string, unknown>,
): Promise<{
  completed: boolean;
  childProcessStdioConfig?: string;
  [key: string]: unknown;
}> {
  return { completed: false, childProcessStdioConfig: "pipe" };
}
