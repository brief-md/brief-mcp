// src/config/config.ts — stub for TASK-06
// Replace with real implementation during build loop.

import type { BriefConfig } from "../types/config.js";

export interface ConfigLoadResult {
  config: BriefConfig;
  isFirstRun: boolean;
  corruptionNotice?: string;
  configPath: string;
}

export async function loadConfig(): Promise<ConfigLoadResult> {
  throw new Error("Not implemented: loadConfig");
}

export async function saveConfig(_config: BriefConfig): Promise<void> {
  throw new Error("Not implemented: saveConfig");
}

export async function updateConfig(
  _patch: Partial<BriefConfig>,
): Promise<BriefConfig> {
  throw new Error("Not implemented: updateConfig");
}

export function getConfigDir(): string {
  throw new Error("Not implemented: getConfigDir");
}

export function getDefaultConfig(): BriefConfig {
  throw new Error("Not implemented: getDefaultConfig");
}

export async function ensureDirectoryStructure(
  _configDir: string,
): Promise<void> {
  throw new Error("Not implemented: ensureDirectoryStructure");
}
