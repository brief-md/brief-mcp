// src/cli/registry-tools.ts — stub for TASK-49
// Replace with real implementation during build loop.

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------
let _registryCache: {
  entries: unknown[];
  timestamp: number;
} | null = null;

// ---------------------------------------------------------------------------
// _resetState — @internal, for test isolation
// ---------------------------------------------------------------------------

/** @internal Reset module-level state for test isolation */
export function _resetState(): void {
  _registryCache = null;
}

export async function searchRegistry(_params: {
  query: string;
  typeFilter?: "ontology" | "type-guide" | "all";
  simulateUntrusted?: boolean;
}): Promise<{
  entries: Array<{
    name: string;
    description: string;
    type: string;
    trustLevel: string;
    requiresConfirmation?: boolean;
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
  commandDisplayed?: boolean;
  warningShown?: boolean;
  warningMessage?: string;
  existingPreserved?: boolean;
}> {
  return { configMerged: false };
}

export async function listTools(): Promise<{
  tools: Array<{ name: string; status: string }>;
  installed?: string[];
  notInstalled?: string[];
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
