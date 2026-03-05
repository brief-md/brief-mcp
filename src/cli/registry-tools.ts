// src/cli/registry-tools.ts — stub for TASK-49
// Replace with real implementation during build loop.

export async function searchRegistry(_params: {
  query: string;
  typeFilter?: string;
  simulateUntrusted?: boolean;
}): Promise<{
  entries: Array<{
    name: string;
    description: string;
    type?: string;
    trustLevel?: string;
    requiresConfirmation?: boolean;
    [key: string]: unknown;
  }>;
}> {
  return { entries: [] };
}

export async function addTool(_params: {
  tool: string;
  client: string;
  customConfig?: Record<string, unknown>;
  simulateUntrustedEntry?: boolean;
  simulateExistingConfig?: boolean;
}): Promise<{
  configMerged: boolean;
  commandDisplayed: boolean;
  warningShown?: boolean;
  warningMessage?: string;
  existingPreserved?: boolean;
}> {
  return { configMerged: false, commandDisplayed: false };
}

export async function listTools(): Promise<{
  tools: Array<{ name: string; status: string; [key: string]: unknown }>;
}> {
  return { tools: [] };
}

export async function getRegistryCache(_params?: {
  fresh?: boolean;
  simulateExpired?: boolean;
  simulateTimeout?: boolean;
}): Promise<{
  fromCache: boolean;
  refreshed?: boolean;
  stale?: boolean;
  [key: string]: unknown;
}> {
  return { fromCache: false };
}

export async function getRegistryTools(_params?: {
  simulateInstalled?: string[];
  simulateNotInstalled?: string[];
}): Promise<{
  installed: unknown[];
  notInstalled: unknown[];
}> {
  return { installed: [], notInstalled: [] };
}

export async function getInstallCommand(_params: {
  toolName: string;
}): Promise<{
  executable: string;
  args: string[];
}> {
  return { executable: "npx", args: [] };
}

export function validateRegistryEntry(_entry: Record<string, unknown>): {
  valid: boolean;
  errors: string[];
} {
  return { valid: false, errors: [] };
}
