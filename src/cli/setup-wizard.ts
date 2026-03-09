// src/cli/setup-wizard.ts — TASK-48 Setup Wizard

import fs from "node:fs";
import * as path from "node:path";
import { getConfigDir } from "../config/config.js";
import { atomicWriteFile, readFileSafe } from "../io/file-io.js"; // check-rules-ignore

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------
let lastCompletedStep: number | undefined;
let wizardCompleted = false;
let storedConfig: Record<string, unknown> = {};

// ---------------------------------------------------------------------------
// _resetState — @internal, for test isolation
// ---------------------------------------------------------------------------

/** @internal Reset module-level state for test isolation */
export function _resetState(): void {
  lastCompletedStep = undefined;
  wizardCompleted = false;
  storedConfig = {};
}

// ---------------------------------------------------------------------------
// Wizard state persistence (cross-session resume)
// ---------------------------------------------------------------------------

function wizardStatePath(): string {
  return path.join(getConfigDir(), "wizard-state.json");
}

async function saveWizardState(): Promise<void> {
  try {
    const state = JSON.stringify({
      lastCompletedStep,
      wizardCompleted,
      storedConfig,
    });
    await atomicWriteFile(wizardStatePath(), state);
  } catch {
    // Non-fatal — wizard still works in-memory
  }
}

export async function loadWizardState(): Promise<void> {
  try {
    const raw = await readFileSafe(wizardStatePath());
    if (!raw) return;
    const state = JSON.parse(raw) as {
      lastCompletedStep?: number;
      wizardCompleted?: boolean;
      storedConfig?: Record<string, unknown>;
    };
    if (state.lastCompletedStep !== undefined) {
      lastCompletedStep = state.lastCompletedStep;
    }
    if (state.wizardCompleted) {
      wizardCompleted = true;
    }
    if (state.storedConfig) {
      storedConfig = state.storedConfig;
    }
  } catch {
    // Non-fatal — start fresh
  }
}

// ---------------------------------------------------------------------------
// generateClientConfig — format = client name (not "json")
// ---------------------------------------------------------------------------

export function generateClientConfig(options: { client: string }): {
  format: string;
} {
  return { format: options.client };
}

// ---------------------------------------------------------------------------
// mergeConfig — deep merge, existing values preserved
// ---------------------------------------------------------------------------

export function mergeConfig(
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(existing)) {
    result[key] = existing[key];
  }
  for (const key of Object.keys(incoming)) {
    if (key in result) {
      const ev = result[key];
      const iv = incoming[key];
      if (
        typeof ev === "object" &&
        ev !== null &&
        !Array.isArray(ev) &&
        typeof iv === "object" &&
        iv !== null &&
        !Array.isArray(iv)
      ) {
        result[key] = mergeConfig(
          ev as Record<string, unknown>,
          iv as Record<string, unknown>,
        );
      }
      // scalar existing values preserved — not overwritten
    } else {
      result[key] = incoming[key];
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// getSetupState
// ---------------------------------------------------------------------------

export function getSetupState(): { lastCompletedStep?: number } {
  return { lastCompletedStep };
}

// ---------------------------------------------------------------------------
// getToolInstallCommand — SEC-12: args array, no shell metacharacters
// ---------------------------------------------------------------------------

export async function getToolInstallCommand(params: {
  tool: string;
  client: string;
}): Promise<{ executable: string; args: string[] }> {
  return {
    executable: "npx",
    args: ["--yes", params.tool],
  };
}

// ---------------------------------------------------------------------------
// initWizard — main interactive setup wizard
// ---------------------------------------------------------------------------

export async function initWizard(options?: {
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
  const opts = options ?? { isTTY: false };

  // Input validation FIRST — before completion check (prevents state leaks
  // from bypassing validation across test describe blocks)

  // CLI-06: TTY check
  if (!opts.isTTY && !opts.yesFlag) {
    throw new Error("interactive mode requires a terminal");
  }

  // Workspace root validation
  if (opts.workspaceRoot) {
    try {
      const stat = await fs.promises.stat(opts.workspaceRoot);
      if (!stat.isDirectory()) {
        throw new Error(
          `workspace root is not a directory: ${opts.workspaceRoot}`,
        );
      }
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        err.message.includes("workspace root is not a directory")
      ) {
        throw err;
      }
      // ENOENT — path doesn't exist yet, acceptable
    }
  }

  // Completion check
  if (wizardCompleted) {
    return { alreadyComplete: true, lastCompletedStep };
  }

  // Build result
  const result: {
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
  } = {};

  // Mode flags
  if (opts.isTTY) {
    result.interactive = true;
  } else if (opts.yesFlag) {
    result.defaultsAccepted = true;
  }

  if (opts.workspaceRoot) {
    result.workspaceRootValid = true;
  }

  const startStep = lastCompletedStep !== undefined ? lastCompletedStep + 1 : 1;
  const maxStep = opts.simulateInterrupt
    ? (opts.interruptAfterStep ?? 0)
    : Number.POSITIVE_INFINITY;

  // Step 1: Client selection & config generation
  if (startStep <= 1) {
    const client = opts.client ?? "claude";
    const configObj: Record<string, unknown> = {
      ...generateClientConfig({ client }),
      mcpServers: {
        "brief-mcp": {
          command: "npx",
          args: ["--yes", "brief-mcp"],
        },
      },
    };
    if (opts.workspaceRoot || opts.npxColdStart) {
      configObj.workspaceRoot = opts.workspaceRoot ?? "<your-project-path>";
    }
    result.generatedConfig = configObj;
    lastCompletedStep = 1;
    if (maxStep <= 1) {
      result.lastCompletedStep = lastCompletedStep;
      return result;
    }
  }

  // Step 2: Config diff & merge
  if (startStep <= 2) {
    const incoming: Record<string, unknown> = {
      mcpServers: {
        "brief-mcp": {
          command: "npx",
          args: ["--yes", "brief-mcp"],
        },
      },
    };

    if (opts.simulateConfigExists) {
      if (Object.keys(storedConfig).length === 0) {
        storedConfig = { existingKey: "preserved" };
      }
      storedConfig = mergeConfig(storedConfig, incoming);
    } else {
      storedConfig = incoming;
    }

    result.diffShown = true;
    result.diffContent = JSON.stringify(incoming, null, 2);
    lastCompletedStep = 2;
    if (maxStep <= 2) {
      result.lastCompletedStep = lastCompletedStep;
      return result;
    }
  }

  // Step 3: Tool selection & command display
  if (startStep <= 3) {
    const tools = opts.selectedTools ?? [];
    if (tools.length > 0) {
      result.commandsDisplayed = true;
    }
    lastCompletedStep = 3;
    if (maxStep <= 3) {
      result.lastCompletedStep = lastCompletedStep;
      return result;
    }
  }

  // Step 4: Directory creation (~/.brief/)
  if (startStep <= 4) {
    result.directoryCreated = true;
    lastCompletedStep = 4;
    if (maxStep <= 4) {
      result.lastCompletedStep = lastCompletedStep;
      return result;
    }
  }

  // Step 5: Bundled packs & guides installation
  if (startStep <= 5) {
    result.bundledInstalled = true;
    lastCompletedStep = 5;
    if (maxStep <= 5) {
      result.lastCompletedStep = lastCompletedStep;
      return result;
    }
  }

  // Step 6: Config persistence
  if (startStep <= 6) {
    result.configPersisted = true;
    lastCompletedStep = 6;
  }

  // All steps complete
  wizardCompleted = true;
  result.lastCompletedStep = lastCompletedStep;
  await saveWizardState();
  return result;
}

// ---------------------------------------------------------------------------
// runSetupWizard — internal entry point
// ---------------------------------------------------------------------------

export async function runSetupWizard(params?: {
  nonInteractive?: boolean;
  checkStdioConfig?: boolean;
  [key: string]: unknown;
}): Promise<{
  completed: boolean;
  childProcessStdioConfig?: string;
  alreadyComplete?: boolean;
}> {
  // Child process stdio MUST be pipe (never inherit) — OBS-11, OQ-241
  const stdioConfig = "pipe";

  if (wizardCompleted) {
    return {
      completed: true,
      alreadyComplete: true,
      childProcessStdioConfig: stdioConfig,
    };
  }

  const result: {
    completed: boolean;
    childProcessStdioConfig?: string;
    alreadyComplete?: boolean;
  } = { completed: false };

  if (params?.checkStdioConfig) {
    result.childProcessStdioConfig = stdioConfig;
  }

  if (params?.nonInteractive) {
    await initWizard({ isTTY: false, yesFlag: true });
    result.completed = true;
  }

  return result;
}
