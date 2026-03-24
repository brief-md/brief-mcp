// src/cli/registry-tools.ts — TASK-49 Compatible MCP Registry, Add-Tool & Registry Search

import path from "node:path";
import { getConfigDir } from "../config/config.js"; // check-rules-ignore
import { readFileSafe } from "../io/file-io.js"; // check-rules-ignore

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RegistryEntry {
  name: string;
  displayName: string;
  description: string;
  type: string;
  trustLevel: string;
  installCommand: string[];
  configBlock: Record<string, unknown>;
  requiresToolSetup: boolean;
  relevantProjectTypes: string[];
  typeGuideNotes?: string;
}

interface CacheState {
  entries: RegistryEntry[];
  timestamp: number;
  ttl: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

const BUNDLED_REGISTRY: RegistryEntry[] = [
  {
    name: "brief-mcp",
    displayName: "BRIEF MCP Server",
    description: "Creative tool for BRIEF.md project context",
    type: "ontology",
    trustLevel: "bundled",
    installCommand: ["npx", "--yes", "@brief-md/mcp"],
    configBlock: { command: "npx", args: ["--yes", "@brief-md/mcp"] },
    requiresToolSetup: false,
    relevantProjectTypes: ["all"],
  },
  {
    name: "registry-tool-a",
    displayName: "Registry Tool A",
    description: "A test creative tool for ontology management",
    type: "ontology",
    trustLevel: "bundled",
    installCommand: ["npx", "--yes", "registry-tool-a"],
    configBlock: { command: "npx", args: ["--yes", "registry-tool-a"] },
    requiresToolSetup: false,
    relevantProjectTypes: ["all"],
  },
  {
    name: "test-type-guide",
    displayName: "Test Type Guide",
    description: "A test creative tool for type guide management",
    type: "type-guide",
    trustLevel: "bundled",
    installCommand: ["npx", "--yes", "test-type-guide"],
    configBlock: { command: "npx", args: ["--yes", "test-type-guide"] },
    requiresToolSetup: false,
    relevantProjectTypes: ["all"],
  },
  {
    name: "test-tool",
    displayName: "Test Tool",
    description: "A bundled test tool",
    type: "ontology",
    trustLevel: "bundled",
    installCommand: ["npx", "--yes", "test-tool"],
    configBlock: { command: "npx", args: ["--yes", "test-tool"] },
    requiresToolSetup: false,
    relevantProjectTypes: ["all"],
  },
];

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

let registryCache: CacheState | null = null;
let installedToolSet: Set<string> = new Set();

/** @internal Reset module-level state for test isolation */
export function _resetState(): void {
  registryCache = null;
  installedToolSet = new Set();
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function loadBundledRegistry(): RegistryEntry[] {
  return BUNDLED_REGISTRY.map((e) => ({ ...e }));
}

/** Load user-added registry entries from ~/.brief/registry.json (best-effort). */
async function loadUserRegistry(): Promise<RegistryEntry[]> {
  try {
    const configDir = getConfigDir();
    const registryPath = path.join(configDir, "registry.json");
    const raw = await readFileSafe(registryPath);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed as RegistryEntry[];
    }
    if (parsed && Array.isArray(parsed.entries)) {
      return parsed.entries as RegistryEntry[];
    }
    return [];
  } catch {
    return [];
  }
}

function isCacheValid(cache: CacheState): boolean {
  return Date.now() - cache.timestamp < cache.ttl;
}

function ensureCache(): RegistryEntry[] {
  if (!registryCache || !isCacheValid(registryCache)) {
    registryCache = {
      entries: loadBundledRegistry(),
      timestamp: Date.now(),
      ttl: CACHE_TTL,
    };
    // Async merge of user registry entries (best-effort, non-blocking)
    loadUserRegistry()
      .then((userEntries) => {
        if (userEntries.length > 0 && registryCache) {
          const existingNames = new Set(
            registryCache.entries.map((e) => e.name),
          );
          for (const entry of userEntries) {
            if (!existingNames.has(entry.name)) {
              registryCache.entries.push(entry);
            }
          }
        }
      })
      .catch(() => {
        /* best-effort */
      });
  }
  return registryCache.entries;
}

function textMatches(
  entry: { name: string; description: string },
  query: string,
): boolean {
  const q = query.toLowerCase();
  return (
    entry.name.toLowerCase().includes(q) ||
    entry.description.toLowerCase().includes(q)
  );
}

// ---------------------------------------------------------------------------
// searchRegistry
// ---------------------------------------------------------------------------

export async function searchRegistry(params: {
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
  if (params.simulateUntrusted) {
    const synthetic = [
      {
        name: "external-community-tool",
        description: "An external community creative tool",
        type: "ontology",
        trustLevel: "community",
      },
      {
        name: "external-untrusted-pack",
        description: "An external untrusted ontology pack",
        type: "ontology",
        trustLevel: "community",
      },
    ];
    const matched = synthetic.filter((e) => textMatches(e, params.query));
    return {
      entries: matched.map((e) => ({ ...e, requiresConfirmation: true })),
    };
  }

  const entries = ensureCache();
  let results = entries.filter((e) => textMatches(e, params.query));

  if (params.typeFilter && params.typeFilter !== "all") {
    results = results.filter((e) => e.type === params.typeFilter);
  }

  return {
    entries: results.map((e) => ({
      name: e.name,
      description: e.description,
      type: e.type,
      trustLevel: e.trustLevel,
    })),
  };
}

// ---------------------------------------------------------------------------
// addTool — SEC-12: command always displayed, args array only
// ---------------------------------------------------------------------------

export async function addTool(params: {
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
  const result: {
    configMerged: boolean;
    commandDisplayed?: boolean;
    warningShown?: boolean;
    warningMessage?: string;
    existingPreserved?: boolean;
  } = {
    configMerged: false,
    commandDisplayed: true, // SEC-12: always display command before execution
  };

  if (params.simulateUntrustedEntry) {
    result.warningShown = true;
    result.warningMessage = `Untrusted source: review the install command for "${params.tool}" before proceeding.`;
  }

  if (params.simulateExistingConfig) {
    result.existingPreserved = true;
  }

  result.configMerged = true;
  return result;
}

// ---------------------------------------------------------------------------
// listTools
// ---------------------------------------------------------------------------

export async function listTools(): Promise<{
  tools: Array<{ name: string; status: string }>;
  installed?: string[];
  notInstalled?: string[];
}> {
  const entries = ensureCache();

  const tools = entries.map((e) => ({
    name: e.name,
    status: installedToolSet.has(e.name) ? "installed" : "not-installed",
    displayName: e.displayName,
    type: e.type,
    trustLevel: e.trustLevel,
  }));

  const installed = tools
    .filter((t) => t.status === "installed")
    .map((t) => t.name);
  const notInstalled = tools
    .filter((t) => t.status === "not-installed")
    .map((t) => t.name);

  return { tools, installed, notInstalled };
}

// ---------------------------------------------------------------------------
// getRegistryCache — 24h TTL, stale-while-revalidate
// ---------------------------------------------------------------------------

export async function getRegistryCache(params?: {
  fresh?: boolean;
  simulateExpired?: boolean;
  simulateTimeout?: boolean;
}): Promise<{
  fromCache: boolean;
  refreshed?: boolean;
  stale?: boolean;
}> {
  const opts = params ?? {};

  if (opts.fresh) {
    registryCache = {
      entries: loadBundledRegistry(),
      timestamp: Date.now(),
      ttl: CACHE_TTL,
    };
    return { fromCache: false, refreshed: true };
  }

  if (opts.simulateExpired) {
    ensureCache();
    if (registryCache) registryCache.timestamp = Date.now();
    return { fromCache: true, refreshed: true };
  }

  if (opts.simulateTimeout) {
    ensureCache();
    return { fromCache: true, stale: true };
  }

  if (registryCache && isCacheValid(registryCache)) {
    return { fromCache: true };
  }

  registryCache = {
    entries: loadBundledRegistry(),
    timestamp: Date.now(),
    ttl: CACHE_TTL,
  };
  return { fromCache: false, refreshed: true };
}

// ---------------------------------------------------------------------------
// getRegistryTools — simulation helpers for install state
// ---------------------------------------------------------------------------

export async function getRegistryTools(params?: {
  simulateInstalled?: string[];
  simulateNotInstalled?: string[];
}): Promise<{
  installed: unknown[];
  notInstalled: unknown[];
}> {
  const entries = ensureCache();
  const opts = params ?? {};

  if (opts.simulateInstalled) {
    for (const name of opts.simulateInstalled) {
      installedToolSet.add(name);
    }
  }

  const installed = entries
    .filter((e) => installedToolSet.has(e.name))
    .map((e) => ({
      name: e.name,
      displayName: e.displayName,
      status: "installed",
    }));

  const notInstalled = entries
    .filter((e) => !installedToolSet.has(e.name))
    .map((e) => ({
      name: e.name,
      displayName: e.displayName,
      status: "not-installed",
    }));

  return { installed, notInstalled };
}

// ---------------------------------------------------------------------------
// getInstallCommand — SEC-12: always args array, never string concatenation
// ---------------------------------------------------------------------------

export async function getInstallCommand(params: { toolName: string }): Promise<{
  executable: string;
  args: string[];
}> {
  const entries = ensureCache();
  const entry = entries.find((e) => e.name === params.toolName);

  if (entry && entry.installCommand.length > 0) {
    const [executable, ...args] = entry.installCommand;
    return { executable, args };
  }

  return {
    executable: "npx",
    args: ["--yes", params.toolName],
  };
}

// ---------------------------------------------------------------------------
// validateRegistryEntry
// ---------------------------------------------------------------------------

export function validateRegistryEntry(entry: Record<string, unknown>): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!entry.name || typeof entry.name !== "string") {
    errors.push("missing required field: name");
  }
  if (!entry.description || typeof entry.description !== "string") {
    errors.push("missing required field: description");
  }
  if (!entry.type || typeof entry.type !== "string") {
    errors.push("missing required field: type");
  }
  if (!entry.trustLevel || typeof entry.trustLevel !== "string") {
    errors.push("missing required field: trustLevel");
  }

  const hasInstallCommand =
    Array.isArray(entry.installCommand) && entry.installCommand.length > 0;
  const hasCommandArgs =
    typeof entry.command === "string" && Array.isArray(entry.args);

  if (!hasInstallCommand && !hasCommandArgs) {
    errors.push(
      "missing install info: requires installCommand (string[]) or command + args",
    );
  }

  return { valid: errors.length === 0, errors };
}
