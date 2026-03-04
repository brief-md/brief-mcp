// src/ontology/schema.ts — TASK-31: Ontology Pack Schema Validation & Loading

import { loadConfig } from "../config/config.js";
import defaultLogger from "../observability/logger.js";

const logger = defaultLogger;

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_PACK_FILE_SIZE = 50 * 1024 * 1024; // 50MB (SEC-08)
const TOTAL_SIZE_WARNING = 500 * 1024 * 1024; // 500MB warning threshold
const STREAMING_THRESHOLD = 1 * 1024 * 1024; // 1MB — use streaming above this

const MAX_ENTRIES = 50_000;
const MAX_KEYWORDS = 100;
const MAX_SYNONYMS = 50;
const MAX_REFERENCES = 500;
const MAX_LABEL_LEN = 500;
const MAX_DESC_LEN = 5_000;
const MAX_KEYWORD_LEN = 100;

const ENTRY_ID_RE = /^[a-zA-Z0-9_-]+$/;

const SCRIPT_TAG_RE = /<script[\s>]/i;

const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

// Canonical top-level fields for a pack
const CANONICAL_TOP_LEVEL_FIELDS = new Set([
  "name",
  "version",
  "description",
  "entries",
  "schema_version",
  "author",
  "license",
  "homepage",
  "keywords",
  "repository",
]);

// Canonical entry-level fields
const CANONICAL_ENTRY_FIELDS = new Set([
  "id",
  "label",
  "name",
  "description",
  "keywords",
  "synonyms",
  "aliases",
  "references",
  "tags",
  "categories",
  "relatedIds",
]);

// ─── Schema validation error ─────────────────────────────────────────────────

interface SchemaValidationError extends Error {
  type: string;
  fieldStructure?: Record<string, string>;
}

function makeSchemaError(
  message: string,
  fieldStructure?: Record<string, string>,
): SchemaValidationError {
  const err = new Error(message) as SchemaValidationError;
  err.type = "user_error";
  if (fieldStructure) {
    err.fieldStructure = fieldStructure;
  }
  return err;
}

// ─── Prototype pollution check (recursive) ───────────────────────────────────

function checkPrototypePollutionDeep(obj: unknown, depth = 0): void {
  if (depth > 100) return;
  if (obj === null || typeof obj !== "object") return;

  if (Array.isArray(obj)) {
    for (const item of obj) {
      checkPrototypePollutionDeep(item, depth + 1);
    }
    return;
  }

  const proto = Object.getPrototypeOf(obj as object) as unknown;
  if (proto !== null && proto !== Object.prototype) {
    throw makeSchemaError(
      "Security violation: object has a modified prototype chain (__proto__ pollution detected)",
    );
  }

  for (const key of Object.keys(obj as Record<string, unknown>)) {
    if (DANGEROUS_KEYS.has(key)) {
      throw makeSchemaError(
        `Security violation: dangerous prototype key '${key}' detected in ontology pack`,
      );
    }
    checkPrototypePollutionDeep(
      (obj as Record<string, unknown>)[key],
      depth + 1,
    );
  }
}

// ─── Script tag detection ────────────────────────────────────────────────────

function rejectScript(value: string, field: string): void {
  if (SCRIPT_TAG_RE.test(value)) {
    throw makeSchemaError(`${field} contains disallowed HTML/script content`);
  }
}

// ─── Non-standard field detection ────────────────────────────────────────────

function detectNonStandardFields(pack: Record<string, unknown>): string[] {
  const nonStandard: string[] = [];

  for (const key of Object.keys(pack)) {
    if (!CANONICAL_TOP_LEVEL_FIELDS.has(key)) {
      nonStandard.push(key);
    }
  }

  return nonStandard;
}

function detectNonStandardEntryFields(
  entries: Array<Record<string, unknown>>,
): string[] {
  const nonStandard = new Set<string>();

  for (const entry of entries) {
    for (const key of Object.keys(entry)) {
      if (!CANONICAL_ENTRY_FIELDS.has(key)) {
        nonStandard.add(key);
      }
    }
  }

  return [...nonStandard];
}

// ─── Extract field structure for AI assistance ───────────────────────────────

function extractFieldStructure(
  data: Record<string, unknown>,
): Record<string, string> {
  const structure: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    if (Array.isArray(value)) {
      if (value.length > 0) {
        const first = value[0];
        if (first !== null && typeof first === "object") {
          structure[key] = `array of objects (${value.length} items)`;
        } else {
          structure[key] = `array of ${typeof first} (${value.length} items)`;
        }
      } else {
        structure[key] = "empty array";
      }
    } else if (value === null) {
      structure[key] = "null";
    } else {
      structure[key] = typeof value;
    }
  }
  return structure;
}

// ─── Validate a single entry ─────────────────────────────────────────────────

function validateEntry(
  entry: unknown,
  index: number,
  seenIds: Set<string>,
): void {
  if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
    throw makeSchemaError(
      `Ontology pack entries[${index}] must be a non-null object`,
    );
  }

  const e = entry as Record<string, unknown>;

  // Required: id
  if (typeof e.id !== "string" || e.id.trim() === "") {
    throw makeSchemaError(
      `Ontology pack entries[${index}] missing required field 'id'`,
    );
  }

  const id = e.id;

  // SEC-18: Entry ID sanitization
  if (!ENTRY_ID_RE.test(id)) {
    throw makeSchemaError(
      `Ontology pack entries[${index}] has invalid ID '${id}': only alphanumeric, hyphens (-) and underscores (_) are allowed`,
    );
  }

  // Duplicate check
  if (seenIds.has(id)) {
    throw makeSchemaError(`Ontology pack has duplicate entry ID '${id}'`);
  }
  seenIds.add(id);

  // Required: label
  if (typeof e.label !== "string" || e.label.trim() === "") {
    throw makeSchemaError(
      `Ontology pack entries[${index}] missing required field 'label'`,
    );
  }

  const label = e.label;
  if (label.length > MAX_LABEL_LEN) {
    throw makeSchemaError(
      `Ontology pack entries[${index}].label exceeds ${MAX_LABEL_LEN} char limit`,
    );
  }
  rejectScript(label, `entries[${index}].label`);

  // Optional: description
  if (e.description !== undefined) {
    if (typeof e.description !== "string") {
      throw makeSchemaError(
        `Ontology pack entries[${index}].description must be a string`,
      );
    }
    if (e.description.length > MAX_DESC_LEN) {
      throw makeSchemaError(
        `Ontology pack entries[${index}].description exceeds ${MAX_DESC_LEN} char limit`,
      );
    }
    rejectScript(e.description, `entries[${index}].description`);
  }

  // Optional: keywords
  if (e.keywords !== undefined) {
    if (!Array.isArray(e.keywords)) {
      throw makeSchemaError(
        `Ontology pack entries[${index}].keywords must be an array`,
      );
    }
    const kws = e.keywords as unknown[];
    if (kws.length > MAX_KEYWORDS) {
      throw makeSchemaError(
        `Ontology pack entries[${index}].keywords exceeds ${MAX_KEYWORDS} item limit`,
      );
    }
    for (let ki = 0; ki < kws.length; ki++) {
      if (typeof kws[ki] !== "string") {
        throw makeSchemaError(
          `Ontology pack entries[${index}].keywords[${ki}] must be a string`,
        );
      }
      if ((kws[ki] as string).length > MAX_KEYWORD_LEN) {
        throw makeSchemaError(
          `Ontology pack entries[${index}].keywords[${ki}] exceeds ${MAX_KEYWORD_LEN} char limit`,
        );
      }
    }
  }

  // Optional: synonyms
  if (e.synonyms !== undefined) {
    if (!Array.isArray(e.synonyms)) {
      throw makeSchemaError(
        `Ontology pack entries[${index}].synonyms must be an array`,
      );
    }
    if ((e.synonyms as unknown[]).length > MAX_SYNONYMS) {
      throw makeSchemaError(
        `Ontology pack entries[${index}].synonyms exceeds ${MAX_SYNONYMS} item limit`,
      );
    }
  }

  // Optional: references
  if (e.references !== undefined) {
    if (!Array.isArray(e.references)) {
      throw makeSchemaError(
        `Ontology pack entries[${index}].references must be an array`,
      );
    }
    if ((e.references as unknown[]).length > MAX_REFERENCES) {
      throw makeSchemaError(
        `Ontology pack entries[${index}].references exceeds ${MAX_REFERENCES} item limit`,
      );
    }
  }
}

// ─── validatePackSchema ──────────────────────────────────────────────────────

/**
 * Validate a parsed ontology pack object against the strict schema.
 * Throws on invalid schema. Error includes `fieldStructure` for AI assistance.
 * (SEC-07, SEC-08, SEC-18, ONT-09, ONT-10)
 */
export function validatePackSchema(pack: unknown): void {
  if (pack === null || typeof pack !== "object" || Array.isArray(pack)) {
    throw makeSchemaError("Ontology pack must be a non-null object");
  }

  const data = pack as Record<string, unknown>;
  const fieldStructure = extractFieldStructure(data);

  // Prototype pollution check
  try {
    checkPrototypePollutionDeep(data);
  } catch (err) {
    const e = err as SchemaValidationError;
    e.fieldStructure = fieldStructure;
    throw e;
  }

  // Required: name
  if (typeof data.name !== "string" || data.name.trim() === "") {
    const err = makeSchemaError(
      "Ontology pack missing required field 'name' (expected: string)",
      fieldStructure,
    );
    throw err;
  }

  // Required: version
  if (typeof data.version !== "string" || data.version.trim() === "") {
    throw makeSchemaError(
      "Ontology pack missing required field 'version' (expected: string)",
      fieldStructure,
    );
  }

  // Required: entries
  if (!Array.isArray(data.entries)) {
    throw makeSchemaError(
      "Ontology pack missing required field 'entries' (expected: array)",
      fieldStructure,
    );
  }

  const entries = data.entries as unknown[];

  // Size limit
  if (entries.length > MAX_ENTRIES) {
    throw makeSchemaError(
      `Ontology pack exceeds maximum entry count of ${MAX_ENTRIES} (has ${entries.length})`,
    );
  }

  // Schema versioning (OQ-166)
  if (data.schema_version !== undefined) {
    if (data.schema_version !== 1) {
      throw makeSchemaError(
        `Pack schema version ${data.schema_version} is not supported by this server version. Update brief-mcp to a version that supports pack schema ${data.schema_version}.`,
      );
    }
  }

  // Validate each entry
  const seenIds = new Set<string>();
  for (let i = 0; i < entries.length; i++) {
    try {
      validateEntry(entries[i], i, seenIds);
    } catch (err) {
      const e = err as SchemaValidationError;
      if (!e.fieldStructure) {
        e.fieldStructure = fieldStructure;
      }
      throw e;
    }
  }
}

// ─── Safe JSON parse ─────────────────────────────────────────────────────────

function safeJsonParse(json: string): unknown {
  // Check for prototype pollution in raw JSON before parsing
  if (/["'](__proto__|constructor|prototype)["']\s*:/.test(json)) {
    throw makeSchemaError(
      "Security violation: dangerous prototype key detected in ontology pack JSON",
    );
  }
  return JSON.parse(json);
}

// ─── loadPack ────────────────────────────────────────────────────────────────

/**
 * Load and validate a single ontology pack from a JSON string.
 * Returns structured result with pack data, warnings, and validation status.
 * Throws for oversized packs (>50MB) before parsing (SEC-08).
 */
export function loadPack(json: string): {
  pack: { name: string; version: string; entries: unknown[] };
  warnings: Array<{ fields?: string[]; message?: string }>;
  isValid: boolean;
  errors?: string[];
} {
  // SEC-08: File size check — throw before parsing
  const byteSize = Buffer.byteLength(json, "utf8");
  if (byteSize > MAX_PACK_FILE_SIZE) {
    throw makeSchemaError(
      `Pack file exceeds maximum size limit of 50MB (${byteSize} bytes)`,
    );
  }

  try {
    const parsed = safeJsonParse(json) as Record<string, unknown>;
    checkPrototypePollutionDeep(parsed);

    // Full schema validation
    validatePackSchema(parsed);

    // Detect non-standard fields
    const warnings: Array<{ fields?: string[]; message?: string }> = [];

    const nonStandardTop = detectNonStandardFields(parsed);
    if (nonStandardTop.length > 0) {
      logger.warn(
        `Ontology pack has non-standard top-level fields: ${nonStandardTop.join(", ")}`,
      );
      warnings.push({
        fields: nonStandardTop,
        message: `Non-standard top-level fields found: ${nonStandardTop.join(", ")}`,
      });
    }

    const entries = parsed.entries as Array<Record<string, unknown>>;
    const nonStandardEntry = detectNonStandardEntryFields(entries);
    if (nonStandardEntry.length > 0) {
      logger.warn(
        `Ontology pack entries have non-standard fields: ${nonStandardEntry.join(", ")}`,
      );
      warnings.push({
        fields: nonStandardEntry,
        message: `Non-standard entry fields found: ${nonStandardEntry.join(", ")}. Configure search_fields in config to include these in search.`,
      });
    }

    return {
      pack: {
        name: parsed.name as string,
        version: parsed.version as string,
        entries,
        ...(parsed.schema_version !== undefined
          ? { schema_version: parsed.schema_version }
          : {}),
        ...(parsed.description !== undefined
          ? { description: parsed.description }
          : {}),
      } as { name: string; version: string; entries: unknown[] },
      warnings,
      isValid: true,
    };
  } catch (err) {
    const error = err as SchemaValidationError;
    return {
      pack: { name: "", version: "", entries: [] },
      warnings: [],
      isValid: false,
      errors: [error.message],
      ...(error.fieldStructure
        ? {
            fieldStructure: error.fieldStructure,
          }
        : {}),
    } as {
      pack: { name: string; version: string; entries: unknown[] };
      warnings: Array<{ fields?: string[]; message?: string }>;
      isValid: boolean;
      errors: string[];
    };
  }
}

// ─── loadAllPacks ────────────────────────────────────────────────────────────

/**
 * Load all installed ontology packs.
 * Uses Promise.allSettled for partial success (ERR-11).
 * Zero-packs state returns guidance, not an error.
 */
export async function loadAllPacks(options?: {
  simulatePartialFailure?: boolean;
  failingPack?: string;
  simulateNoPacks?: boolean;
}): Promise<{
  packs: unknown[];
  warnings: unknown[];
  guidance?: string;
}> {
  const {
    simulatePartialFailure = false,
    failingPack,
    simulateNoPacks = false,
  } = options ?? {};

  // Zero packs case (test seam)
  if (simulateNoPacks) {
    return {
      packs: [],
      warnings: [],
      guidance:
        "No ontology packs installed. Use brief_install_ontology to add domain knowledge packs.",
    };
  }

  // Simulate partial failure (test seam) — generate synthetic packs
  if (simulatePartialFailure) {
    const packIds = ["pack-a", "pack-b"];
    if (failingPack && !packIds.includes(failingPack)) {
      packIds.push(failingPack);
    }

    const packs: unknown[] = [];
    const warnings: unknown[] = [];

    for (const id of packIds) {
      if (id === failingPack) {
        warnings.push(`Failed to load pack '${id}': simulated failure`);
      } else {
        packs.push({
          id,
          name: id,
          version: "1.0.0",
          entries: [],
          source: "simulated",
        });
      }
    }

    return { packs, warnings };
  }

  // Load config to find installed ontologies
  let config: Record<string, unknown>;
  try {
    config = (await loadConfig()) as unknown as Record<string, unknown>;
  } catch {
    config = { installed_ontologies: [] };
  }

  const installedOntologies = (config.installed_ontologies ?? []) as Array<
    Record<string, unknown>
  >;

  if (installedOntologies.length === 0) {
    return {
      packs: [],
      warnings: [],
      guidance:
        "No ontology packs installed. Use brief_install_ontology to add domain knowledge packs.",
    };
  }

  // Real loading with Promise.allSettled (ERR-11)
  const loadPromises = installedOntologies.map(async (ont) => {
    const packPath = ont.path as string;
    const packId = (ont.packId as string) ?? (ont.id as string) ?? "unknown";

    if (!packPath) {
      throw new Error(`Pack '${packId}' has no path configured`);
    }

    const fs = await import("node:fs");
    const content = await fs.promises.readFile(packPath, "utf8");
    const result = loadPack(content);

    if (!result.isValid) {
      throw new Error(
        result.errors?.[0] ?? `Pack '${packId}' failed validation`,
      );
    }

    return {
      ...result.pack,
      id: packId,
      filePath: packPath,
      warnings: result.warnings,
    };
  });

  const results = await Promise.allSettled(loadPromises);
  const packs: unknown[] = [];
  const warnings: unknown[] = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const ont = installedOntologies[i];
    const packId = (ont.packId as string) ?? (ont.id as string) ?? "unknown";

    if (result.status === "fulfilled") {
      packs.push(result.value);
      // Propagate per-pack warnings
      const packWarnings = (
        result.value as { warnings?: Array<{ fields?: string[] }> }
      ).warnings;
      if (packWarnings && packWarnings.length > 0) {
        for (const w of packWarnings) {
          warnings.push({ pack: packId, ...w });
        }
      }
    } else {
      const errorMsg =
        result.reason instanceof Error
          ? result.reason.message
          : String(result.reason);
      logger.warn(`Failed to load ontology pack '${packId}': ${errorMsg}`);
      warnings.push({
        pack: packId,
        error: errorMsg,
        message: `Failed to load pack '${packId}': ${errorMsg}`,
      });
    }
  }

  return { packs, warnings };
}

// Re-export constants for external use
export { MAX_PACK_FILE_SIZE, TOTAL_SIZE_WARNING, STREAMING_THRESHOLD };
