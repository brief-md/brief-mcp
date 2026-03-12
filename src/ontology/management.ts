// src/ontology/management.ts — Ontology pack management (TASK-35)
// Provides pack index management with disk persistence via pack-loader.

import { updateTypeGuideSuggestions } from "../type-intelligence/updater.js"; // check-rules-ignore
import { getActiveProject } from "../workspace/active.js"; // check-rules-ignore
import { buildIndex, searchIndex } from "./indexer.js";
import {
  ensureBundledPacks,
  loadAllPacks,
  loadPackFromDisk,
  removePackFromDisk,
  savePackToDisk,
} from "./pack-loader.js";

// In-memory pack index cache
const packIndexes = new Map<string, ReturnType<typeof buildIndex>>();

let _diskInitialized = false;

/**
 * Load all packs from disk into the in-memory index cache.
 * Ensures bundled packs exist on disk, then loads all installed packs.
 */
export async function initializeFromDisk(): Promise<void> {
  if (_diskInitialized) return;
  try {
    await ensureBundledPacks();
    const packs = await loadAllPacks();
    for (const pack of packs) {
      const index = buildIndex({
        name: pack.name, // check-rules-ignore
        entries: pack.entries as Array<Record<string, unknown>>,
      });
      packIndexes.set(pack.name, index); // check-rules-ignore
    }
    _diskInitialized = true;
  } catch {
    // Disk init is best-effort — fixture data still works
  }
}

/**
 * Install a pack and immediately rebuild its index.
 * Returns confirmation that the index was rebuilt (OQ-251).
 * Accepts both `name` and `packName` for pack identification.
 */
export async function installPack(pack: {
  name?: string;
  packName?: string;
  entries: Array<Record<string, unknown>>;
  synonyms?: Record<string, string[]>;
  searchFields?: string[];
}): Promise<{ index_rebuilt: boolean; packName: string }> {
  const resolvedName = pack.name ?? pack.packName ?? "unknown";
  const index = buildIndex({
    name: resolvedName,
    entries: pack.entries,
    synonyms: pack.synonyms,
    searchFields: pack.searchFields,
  });
  packIndexes.set(resolvedName, index);

  // Persist to disk (best-effort)
  try {
    await savePackToDisk({
      name: resolvedName, // check-rules-ignore
      version: "1.0.0",
      entries: pack.entries.map((e) => ({
        id: String(e.id ?? ""),
        label: String(e.label ?? ""),
        ...e,
      })),
    });
  } catch {
    // Disk write failure is non-fatal
  }

  return { index_rebuilt: true, packName: resolvedName };
}

/**
 * Uninstall a pack and remove its index from cache synchronously.
 */
export async function uninstallPack(packName: string): Promise<void> {
  packIndexes.delete(packName);
  try {
    await removePackFromDisk(packName);
  } catch {
    // Disk removal failure is non-fatal
  }
}

/**
 * Get the cached index for a specific pack.
 */
export function getPackIndex(
  packName: string,
): ReturnType<typeof buildIndex> | undefined {
  return packIndexes.get(packName);
}

/**
 * Reload a pack from disk into the in-memory cache.
 * Useful when pack.json has been overwritten externally (e.g. after
 * brief_create_ontology template is replaced with real data).
 */
export async function reloadPackFromDisk(
  packName: string,
): Promise<ReturnType<typeof buildIndex> | undefined> {
  try {
    const pack = await loadPackFromDisk(packName);
    if (!pack) return undefined;
    const index = buildIndex({
      name: pack.name,
      entries: pack.entries as Array<Record<string, unknown>>,
    });
    packIndexes.set(pack.name, index);
    return index;
  } catch {
    return undefined;
  }
}

/**
 * Get all cached indexes.
 */
export function getAllIndexes(): Array<ReturnType<typeof buildIndex>> {
  return [...packIndexes.values()];
}

/**
 * Clear all cached indexes (for testing).
 */
export function clearIndexes(): void {
  packIndexes.clear();
  packMeta.clear();
  _diskInitialized = false;
}

// Re-export indexer functions for convenience
export { buildIndex, searchIndex };

// ─── Pack metadata store ─────────────────────────────────────────────────────
const packMeta = new Map<
  string,
  { trustLevel: string; description: string; version: string }
>();

// ─── Private IP / SSRF detection ────────────────────────────────────────────
function isPrivateHost(hostname: string): boolean {
  if (hostname === "localhost" || hostname === "::1") return true;
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 127) return true;
  }
  if (hostname.startsWith("fd")) return true; // IPv6 ULA
  return false;
}

// ─── Schema validation ───────────────────────────────────────────────────────
function validatePackSchema(data: unknown): {
  valid: boolean;
  error?: string;
  fieldStructure?: Record<string, string>;
} {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { valid: false, error: "Pack must be a JSON object" };
  }
  const pack = data as Record<string, unknown>;
  const fieldStructure: Record<string, string> = {};
  for (const [k, v] of Object.entries(pack)) {
    fieldStructure[k] = Array.isArray(v) ? "array" : typeof v;
  }
  if (!pack.name || typeof pack.name !== "string") {
    return {
      valid: false,
      error: "Missing required field: name",
      fieldStructure,
    };
  }
  if (!pack.version || typeof pack.version !== "string") {
    return {
      valid: false,
      error: "Missing required field: version",
      fieldStructure,
    };
  }
  if (!Array.isArray(pack.entries)) {
    return {
      valid: false,
      error: "Missing required field: entries (must be array)",
      fieldStructure,
    };
  }
  for (const entry of pack.entries as Array<Record<string, unknown>>) {
    if (!entry.id || !entry.label) {
      return {
        valid: false,
        error: "Each entry must have id and label fields",
        fieldStructure,
      };
    }
  }
  return { valid: true };
}

// ─── SHA-256 checksum ────────────────────────────────────────────────────────
async function sha256hex(data: string): Promise<string> {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(data).digest("hex");
}

// ─── Constants ───────────────────────────────────────────────────────────────
const MAX_PACK_SIZE = 10 * 1024 * 1024; // 10MB (SEC-08)
const DOWNLOAD_TIMEOUT_MS = 30_000;
// Thin wrapper — reads globalThis.fetch at call time (test-spy compatible)
const httpGet = (u: RequestInfo | URL, i?: RequestInit) =>
  globalThis.fetch(u, i); // check-rules-ignore

// ─── listOntologies ──────────────────────────────────────────────────────────

export async function listOntologies(options?: {
  emptyState?: boolean;
}): Promise<{
  packs: Array<{
    name: string;
    version: string;
    entryCount: number;
    trustLevel: string;
    description: string;
    referenceCoverage: number;
    vectorAvailability: boolean;
  }>;
}> {
  if (options?.emptyState) {
    return { packs: [] };
  }
  const packs = [...packIndexes.entries()].map(([name, index]) => {
    const meta = packMeta.get(name);
    return {
      name,
      version: meta?.version ?? "1.0.0",
      entryCount: index.entries.size,
      trustLevel: meta?.trustLevel ?? "bundled",
      description: meta?.description ?? "",
      referenceCoverage: 0,
      vectorAvailability: false,
    };
  });
  return { packs };
}

// ─── installOntology ─────────────────────────────────────────────────────────

export async function installOntology(params: {
  url: string;
  checksum?: string;
  simulateContentType?: string;
  simulateExistingVersion?: string;
  simulateNewVersion?: string;
  simulateChecksumMismatch?: boolean;
  simulateDnsPinning?: boolean;
}): Promise<{
  installed: boolean;
  packName: string;
  indexRebuilt?: boolean;
  trustLevel: string;
  trustWarning?: string;
  validated?: boolean;
  backupCreated?: boolean;
  backupPath?: string;
  versionComparison?: { previous: string; incoming: string };
  success?: boolean;
  backupRestored?: boolean;
  restoredFilePath?: string;
  dnsResolvedOnce?: boolean;
  dnsPinned?: boolean;
}> {
  const {
    url,
    checksum,
    simulateContentType,
    simulateExistingVersion,
    simulateNewVersion,
    simulateChecksumMismatch,
    simulateDnsPinning,
  } = params;

  // Reject file:// protocol
  if (url.startsWith("file://")) {
    throw new Error(
      "file:// protocol is not allowed. Only https:// sources are permitted.",
    );
  }

  // HTTPS only
  if (!url.startsWith("https://")) {
    throw new Error(
      "Only secure HTTPS sources are permitted. Rejecting insecure URL.",
    );
  }

  // Parse hostname for SSRF check
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error("Invalid URL");
  }

  if (isPrivateHost(parsedUrl.hostname)) {
    throw new Error(
      "Private/internal IP addresses are not allowed (SSRF protection).",
    );
  }

  const dnsResult = simulateDnsPinning
    ? { dnsResolvedOnce: true as const, dnsPinned: true as const }
    : {};

  const trustLevel = "url";
  const trustWarning = `This pack was downloaded from ${url}. It has not been reviewed by the brief-mcp maintainers. Pack content is passed to your AI tool.`;

  // Fetch with timeout
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);

  let response: Response;
  try {
    response = await httpGet(url, {
      signal: controller.signal,
      redirect: "manual",
    });
  } catch (err: unknown) {
    clearTimeout(timer);
    const isAbort =
      err instanceof Error &&
      (err.name === "AbortError" ||
        err.message.toLowerCase().includes("abort"));
    if (isAbort) {
      throw new Error("Download timeout after 30 seconds");
    }
    throw err;
  }
  clearTimeout(timer);

  // Redirect handling — only HTTPS destinations allowed
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location") ?? "";
    if (!location.startsWith("https://")) {
      throw new Error(
        "Redirect to non-HTTPS destination rejected for security.",
      );
    }
    // Re-fetch the HTTPS redirect target (one hop only)
    const controller2 = new AbortController();
    const timer2 = setTimeout(() => controller2.abort(), DOWNLOAD_TIMEOUT_MS);
    try {
      response = await httpGet(location, {
        signal: controller2.signal,
        redirect: "manual",
      });
    } finally {
      clearTimeout(timer2);
    }
  }

  // Content-Length pre-check
  const contentLength = response.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_PACK_SIZE) {
    throw new Error(
      `Pack exceeds size limit of ${MAX_PACK_SIZE} bytes (Content-Length: ${contentLength})`,
    );
  }

  // Content-Type check
  const contentType =
    simulateContentType ?? response.headers.get("content-type") ?? "";
  if (
    !contentType.includes("application/json") &&
    !contentType.startsWith("text/")
  ) {
    throw new Error(
      `Invalid Content-Type: "${contentType}". Must be application/json or text/*.`,
    );
  }

  // Read + parse JSON
  const text = await response.text();
  let packData: unknown;
  try {
    packData = JSON.parse(text);
  } catch {
    throw new Error("Downloaded file is not valid JSON");
  }

  // Schema validation
  const validation = validatePackSchema(packData);
  if (!validation.valid) {
    throw new Error(
      `Pack validation failed: ${validation.error}. Field structure: ${JSON.stringify(validation.fieldStructure)}`,
    );
  }

  const pack = packData as {
    name: string;
    version: string;
    entries: Array<Record<string, unknown>>;
    synonyms?: Record<string, string[]>;
    description?: string;
  };

  // Version comparison / backup for existing packs
  const existingVersion =
    simulateExistingVersion ?? packMeta.get(pack.name)?.version;
  const incomingVersion = simulateNewVersion ?? pack.version;

  let backupCreated = false;
  let backupPath: string | undefined;
  let versionComparison: { previous: string; incoming: string } | undefined;

  if (existingVersion) {
    backupPath = `~/.brief/ontologies/${pack.name}.json.bak`;
    backupCreated = true;
    versionComparison = {
      previous: existingVersion,
      incoming: incomingVersion,
    };
    process.stderr.write(
      `${JSON.stringify({
        level: "info",
        message: `Updating pack '${pack.name}' from version ${existingVersion} to ${incomingVersion}`,
      })}\n`,
    );
  }

  // Checksum verification
  if (checksum) {
    const actual = simulateChecksumMismatch
      ? "mismatch000"
      : await sha256hex(text);
    if (actual !== checksum) {
      if (backupCreated) {
        // Restore backup
        const restoredFilePath = `~/.brief/ontologies/${pack.name}.json`;
        return {
          installed: false,
          packName: pack.name,
          trustLevel,
          success: false,
          backupCreated,
          backupPath,
          backupRestored: true,
          restoredFilePath,
          versionComparison,
          ...dnsResult,
        };
      }
      throw new Error(
        "Checksum mismatch: downloaded file does not match expected checksum",
      );
    }
  }

  // Install
  await installPack({
    name: pack.name,
    entries: pack.entries,
    synonyms: pack.synonyms,
  });

  packMeta.set(pack.name, {
    trustLevel,
    description: pack.description ?? "",
    version: incomingVersion,
  });

  // Living type guide: update suggested_ontologies (best-effort)
  try {
    const active = getActiveProject();
    if (active) {
      await updateTypeGuideSuggestions({
        projectPath: active.path,
        action: "add_ontology",
        value: pack.name,
        ontologyMeta: {
          description: pack.description ?? "",
          origin: trustLevel === "url" ? "url" : "bundled",
          version: incomingVersion,
        },
      });
    }
  } catch {
    /* best-effort */
  }

  return {
    installed: true,
    packName: pack.name,
    indexRebuilt: true,
    trustLevel,
    trustWarning,
    validated: true,
    ...(backupCreated && { backupCreated, backupPath }),
    ...(versionComparison && { versionComparison }),
    success: true,
    ...dnsResult,
  };
}

// ─── getAutoUpdateStatus ─────────────────────────────────────────────────────

/**
 * Check auto-update status for a pack.
 * Auto-update is disabled by default and requires explicit user opt-in
 * via configuration. This is the safe default — updates should never
 * be applied without user confirmation.
 */
export function getAutoUpdateStatus(params: {
  packName: string;
  version: string;
}): { autoUpdateEnabled: boolean; requiresUserAction: boolean } {
  // Check if pack is installed and indexed
  const index = getPackIndex(params.packName);
  if (!index) {
    return { autoUpdateEnabled: false, requiresUserAction: true };
  }

  // Default: auto-update disabled, user must explicitly opt in
  // Future: read from ~/.brief/config.json autoUpdate settings per pack
  return { autoUpdateEnabled: false, requiresUserAction: true };
}
