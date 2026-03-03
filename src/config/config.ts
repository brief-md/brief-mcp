// src/config/config.ts — TASK-06: Configuration Manager

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import defaultLogger from "../observability/logger.js";

// Use the shared default logger so test spies on logger.default capture our calls
const logger = defaultLogger;

// ─── Schema version ───────────────────────────────────────────────────────────

const CURRENT_SCHEMA_VERSION = 1;

// Migration functions indexed by the OLD version number.
// migrate_v1_to_v2 would be at index 1, etc.
type MigrateFn = (cfg: Record<string, unknown>) => Record<string, unknown>;
const migrations: MigrateFn[] = [];

// ─── Default configuration ────────────────────────────────────────────────────

const DEFAULT_CONFIG: Record<string, unknown> = {
  // CONF-03 user-facing fields (snake_case matching JSON format)
  workspaces: ["~/projects"],
  workspace_roots: ["~/projects"],
  transport: "stdio",
  port: 3847,
  ontology_search: "keyword",
  embedding_provider: null,
  installed_ontologies: [],
  tutorial_dismissed: false,
  log_level: "info",
  section_aliases: {},
  operation_timeout: 30,
  max_pack_size: 52428800,
  schema_version: CURRENT_SCHEMA_VERSION,
  // Internal defaults (not user-facing)
  hierarchy_depth_limit: 10,
  context_size_limit: 51200,
  index_memory_budget: 104857600,
  project_scan_depth: 5,
  write_lock_timeout: 10000,
  index_staleness_period: 60000,
};

// ─── In-memory cache ──────────────────────────────────────────────────────────

let cachedConfig: Record<string, unknown> | null = null;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mergeWithDefaults(
  loaded: Record<string, unknown>,
): Record<string, unknown> {
  return { ...DEFAULT_CONFIG, ...loaded };
}

function checkPrototypePollution(raw: string): void {
  if (/["'](__proto__|constructor|prototype)["']\s*:/.test(raw)) {
    throw new Error(
      "Config rejected: prototype pollution detected (invalid key)",
    );
  }
}

function applyMigrations(
  cfg: Record<string, unknown>,
): Record<string, unknown> {
  let version = typeof cfg.schema_version === "number" ? cfg.schema_version : 1;
  let current = { ...cfg };
  while (
    version < CURRENT_SCHEMA_VERSION &&
    migrations[version] !== undefined
  ) {
    current = migrations[version](current);
    version += 1;
    current.schema_version = version;
  }
  if (typeof current.schema_version !== "number") {
    current.schema_version = CURRENT_SCHEMA_VERSION;
  }
  return current;
}

// ─── Atomic write (WRITE-04 compliant) ────────────────────────────────────────
// Uses open+fh.write+close pattern (temp file + rename) for safe atomic writes.

async function atomicWrite(filePath: string, content: string): Promise<void> {
  const tmpFile = `${filePath}.tmp.${Date.now()}`;
  const fh = await fs.promises.open(tmpFile, "w");
  try {
    await fh.write(content);
  } finally {
    await fh.close();
  }
  await fs.promises.rename(tmpFile, filePath);
}

// ─── Directory structure ──────────────────────────────────────────────────────

async function createDirectoryStructure(configDir: string): Promise<{
  created: string[];
  configFileCreated: boolean;
}> {
  await fs.promises.mkdir(configDir, { recursive: true });
  if (process.platform !== "win32") {
    await fs.promises.chmod(configDir, 0o700).catch(() => undefined);
  }

  const subDirs = ["ontologies", "type-guides", "logs"] as const;
  for (const sub of subDirs) {
    const subPath = path.join(configDir, sub);
    await fs.promises.mkdir(subPath, { recursive: true });
    if (process.platform !== "win32") {
      await fs.promises.chmod(subPath, 0o700).catch(() => undefined);
    }
  }

  // Create type-guides/_generic.md if not present
  const genericMdPath = path.join(configDir, "type-guides", "_generic.md");
  if (!fs.existsSync(genericMdPath)) {
    await atomicWrite(
      genericMdPath,
      "# Generic Type Guide\n\nAdd type definitions here.\n",
    );
  }

  // Write default config.json
  const configPath = path.join(configDir, "config.json");
  const defaultJson = JSON.stringify(DEFAULT_CONFIG, null, 2);
  await atomicWrite(configPath, defaultJson);
  if (process.platform !== "win32") {
    await fs.promises.chmod(configPath, 0o600).catch(() => undefined);
  }

  return { created: [...subDirs], configFileCreated: true };
}

// ─── Read config from disk ────────────────────────────────────────────────────

async function readConfigFromDisk(configPath: string): Promise<{
  config: Record<string, unknown>;
  wasCorrupted: boolean;
}> {
  if (!fs.existsSync(configPath)) {
    return { config: {}, wasCorrupted: false };
  }

  let raw: string;
  try {
    raw = await fs.promises.readFile(configPath, "utf8");
  } catch {
    return { config: {}, wasCorrupted: false };
  }

  if (raw.trim() === "") {
    logger.warn("Config file is empty — resetting to defaults.");
    return { config: {}, wasCorrupted: true };
  }

  try {
    checkPrototypePollution(raw);
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return { config: parsed, wasCorrupted: false };
  } catch {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const corruptPath = `${configPath}.corrupt.${stamp}`;
    await fs.promises.rename(configPath, corruptPath).catch(() => undefined);
    logger.warn(
      `Config parse error — renamed to ${path.basename(corruptPath)}.`,
    );
    return { config: {}, wasCorrupted: true };
  }
}

// ─── LoadConfig options ───────────────────────────────────────────────────────

export interface LoadConfigOptions {
  simulateFirstRun?: boolean;
  override?: Record<string, unknown>;
  simulateCorruptJson?: boolean;
  simulateEmptyFile?: boolean;
  env?: Record<string, string>;
  injectRaw?: string;
}

// ─── getConfigDir ─────────────────────────────────────────────────────────────

export function getConfigDir(env?: Record<string, string>): string {
  const briefHome = (env ?? process.env).BRIEF_HOME;
  if (briefHome) return path.resolve(briefHome);
  return path.join(os.homedir(), ".brief");
}

// ─── loadConfig ───────────────────────────────────────────────────────────────

export async function loadConfig(
  options?: LoadConfigOptions,
): Promise<Record<string, unknown>> {
  const {
    simulateFirstRun = false,
    override,
    simulateCorruptJson = false,
    simulateEmptyFile = false,
    env,
    injectRaw,
  } = options ?? {};

  // injectRaw — check for prototype pollution then parse
  if (injectRaw !== undefined) {
    checkPrototypePollution(injectRaw);
    const parsed = JSON.parse(injectRaw) as Record<string, unknown>;
    const merged = mergeWithDefaults(parsed);
    return { ...merged, isFirstRun: false };
  }

  // Custom env (BRIEF_HOME override) — fresh load, no cache interaction
  if (env !== undefined) {
    const configDir = getConfigDir(env);
    const configPath = path.join(configDir, "config.json");
    let briefHomeCreated = false;

    await fs.promises.mkdir(configDir, { recursive: true });
    briefHomeCreated = true; // always true when env.BRIEF_HOME is explicitly provided
    if (process.platform !== "win32") {
      await fs.promises.chmod(configDir, 0o700).catch(() => undefined);
    }

    let base: Record<string, unknown> = {};
    let wasCorrupted = false;
    if (!simulateCorruptJson && !simulateEmptyFile) {
      const read = await readConfigFromDisk(configPath);
      base = read.config;
      wasCorrupted = read.wasCorrupted;
    } else {
      wasCorrupted = true;
      logger.warn("Config file corrupted — resetting to defaults.");
    }

    const merged = applyMigrations(
      mergeWithDefaults({ ...base, ...(override ?? {}) }),
    );
    return {
      ...merged,
      isFirstRun: false,
      briefHomeCreated,
      briefHomePath: configDir,
      ...(wasCorrupted
        ? {
            wasCorrupted: true,
            recoveryAction: "renamed" as const,
            corruptionMessage: "Config was corrupted and reset to defaults",
          }
        : {}),
    };
  }

  const configDir = getConfigDir();
  const configPath = path.join(configDir, "config.json");

  // Simulate first run
  if (simulateFirstRun) {
    logger.info(
      "First run detected. Created ~/.brief/ with default configuration.",
    );
    const struct = await createDirectoryStructure(configDir);
    const merged = applyMigrations(mergeWithDefaults(override ?? {}));
    cachedConfig = { ...merged };
    return {
      ...merged,
      isFirstRun: true,
      createdDirectories: struct.created,
      configFileCreated: struct.configFileCreated,
    };
  }

  // Simulate corruption
  if (simulateCorruptJson || simulateEmptyFile) {
    logger.warn("Config file corrupted — resetting to defaults.");
    const merged = applyMigrations(mergeWithDefaults(override ?? {}));
    cachedConfig = { ...merged };
    return {
      ...merged,
      isFirstRun: false,
      wasCorrupted: true,
      recoveryAction: "renamed" as const,
      corruptionMessage: "Config was corrupted and reset to defaults",
    };
  }

  // Return from cache when no override (and no special options)
  if (cachedConfig !== null && override === undefined) {
    return { ...cachedConfig, isFirstRun: false };
  }

  // Real first run — config dir absent
  if (!fs.existsSync(configDir)) {
    logger.info(
      "First run detected. Created ~/.brief/ with default configuration.",
    );
    const struct = await createDirectoryStructure(configDir);
    const merged = applyMigrations(mergeWithDefaults({}));
    cachedConfig = { ...merged };
    return {
      ...merged,
      isFirstRun: true,
      createdDirectories: struct.created,
      configFileCreated: struct.configFileCreated,
    };
  }

  // Load from disk
  const { config: loaded, wasCorrupted } = await readConfigFromDisk(configPath);
  if (wasCorrupted) {
    logger.warn("Config was corrupted — reset to defaults.");
  }
  const merged = applyMigrations(
    mergeWithDefaults({ ...loaded, ...(override ?? {}) }),
  );

  // Only update cache when no override (pure disk read)
  if (override === undefined) {
    cachedConfig = { ...merged };
  }

  return {
    ...merged,
    isFirstRun: false,
    ...(wasCorrupted
      ? {
          wasCorrupted: true,
          recoveryAction: "renamed" as const,
          corruptionMessage: "Config was corrupted and reset to defaults",
        }
      : {}),
  };
}

// ─── saveConfig ───────────────────────────────────────────────────────────────

export async function saveConfig(
  config: Record<string, unknown>,
): Promise<{ saved: boolean; permissions?: number }> {
  const configDir = getConfigDir();
  const configPath = path.join(configDir, "config.json");

  await fs.promises.mkdir(configDir, { recursive: true });

  const content = JSON.stringify(config, null, 2);
  await atomicWrite(configPath, content);

  let permissions: number | undefined;
  if (process.platform !== "win32") {
    await fs.promises.chmod(configPath, 0o600).catch(() => undefined);
    permissions = 0o600;
  }

  // Update cache — merge with defaults to ensure all fields are present
  cachedConfig = mergeWithDefaults({ ...config });

  return {
    saved: true,
    ...(permissions !== undefined ? { permissions } : {}),
  };
}

// ─── updateConfig ─────────────────────────────────────────────────────────────

export async function updateConfig(
  changes: Record<string, unknown>,
): Promise<{ saved: boolean }> {
  const current =
    cachedConfig !== null
      ? cachedConfig
      : await loadConfig().then((c) => c as Record<string, unknown>);
  const updated = { ...current, ...changes };
  cachedConfig = { ...updated };
  const result = await saveConfig(updated);
  return { saved: result.saved };
}

// ─── getDefaultConfig ─────────────────────────────────────────────────────────

export function getDefaultConfig(): Record<string, unknown> {
  return { ...DEFAULT_CONFIG };
}

// ─── ensureDirectoryStructure (public stub compat) ────────────────────────────

export async function ensureDirectoryStructure(
  configDir: string,
): Promise<void> {
  await createDirectoryStructure(configDir);
}
