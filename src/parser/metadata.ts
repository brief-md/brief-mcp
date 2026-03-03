// src/parser/metadata.ts — Parser metadata extraction (TASK-09)

import type { OntologyMetadataEntry, ParsedMetadata } from "../types/parser.js";

// Canonical field name map (lowercase key → canonical display name)
const CANONICAL_FIELD_MAP: Record<string, string> = {
  project: "Project",
  type: "Type",
  created: "Created",
  updated: "Updated",
  extensions: "Extensions",
  ontologies: "Ontologies",
  status: "Status",
  version: "Version",
  spec_version: "Version",
};

const REQUIRED_FIELDS = ["Project", "Type", "Created"] as const;

// Regex: bold markdown  **Field:** value  or  **Field :** value
// Uses " ?" (optional single space) after closing ** so a value that IS a space
// is captured correctly and not consumed by greedy whitespace matching.
const BOLD_META_RE = /^\*\*([^*:]+?)\s*:\*\* ?(.*)$/;
// Regex: plain text  Field: value  (non-empty value required)
const PLAIN_META_RE = /^([A-Za-z][A-Za-z0-9_ ]*):\s+(.+)$/;

/**
 * Normalize a field name for case-insensitive consistency checking.
 * Returns lowercase for ALL inputs so that any two casings of the same
 * name resolve to the same result (PARSE-04 case-insensitivity property).
 */
export function normalizeFieldName(name: string): string {
  return name.trim().toLowerCase();
}

/** Alias for stub compatibility */
export const normalizeMetadataField = normalizeFieldName;

/**
 * Resolve the Map storage key for a field name.
 * Known fields → canonical display name (e.g., "Project", "Type").
 * Unknown fields → original trimmed casing (preserved per COMPAT-01).
 * Uses hasOwnProperty to avoid prototype-chain pollution (e.g. "constructor").
 */
function getMapKey(name: string): string {
  const lower = name.trim().toLowerCase();
  if (Object.hasOwn(CANONICAL_FIELD_MAP, lower)) {
    return CANONICAL_FIELD_MAP[lower];
  }
  return name.trim();
}

/**
 * Normalize a Type value to lowercase-hyphen format.
 * "Software Library" → "software-library"  (COMPAT-06)
 */
export function normalizeType(typeValue: string): string {
  return typeValue
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Normalize a single extension name to lowercase_underscores.
 * Accepts heading format (ALL CAPS with spaces) or metadata format (snake_case).
 * PARSE-13
 */
function normalizeExtensionName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, "_");
}

/**
 * Parse a comma-delimited extensions list to snake_case slugs.
 * PARSE-22: split on commas, trim each item.
 * PARSE-13: accept heading format (SONIC ARTS) or metadata format (sonic_arts).
 */
export function parseExtensionsList(input: string): string[] {
  if (!input.trim()) return [];
  return input
    .split(",")
    .map((item) => normalizeExtensionName(item))
    .filter((item) => item.length > 0);
}

/** Alias for stub compatibility */
export const parseExtensionsField = parseExtensionsList;

/**
 * Split a string on commas that are NOT inside parentheses.
 * Used to split ontology lists where excludes clauses may contain commas.
 */
function splitTopLevelCommas(input: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of input) {
    if (ch === "(") {
      depth++;
      current += ch;
    } else if (ch === ")") {
      if (depth > 0) depth--;
      current += ch;
    } else if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim().length > 0) parts.push(current);
  return parts;
}

/**
 * Parse a single ontology entry string.
 * Format: name [(version)] [(excludes: name, ...)]
 * PARSE-23
 */
function parseOntologyEntry(raw: string): OntologyMetadataEntry {
  const trimmed = raw.trim();
  const firstParen = trimmed.indexOf("(");

  if (firstParen === -1) {
    return { name: trimmed };
  }

  const name = trimmed.slice(0, firstParen).trim();
  const rest = trimmed.slice(firstParen);

  let version: string | undefined;
  let excludes: string[] | undefined;

  const clauseRe = /\(([^)]*)\)/g;
  for (;;) {
    const m = clauseRe.exec(rest);
    if (m === null) break;
    const clause = m[1].trim();
    if (clause.toLowerCase().startsWith("excludes:")) {
      const excludeStr = clause.slice("excludes:".length).trim();
      excludes = excludeStr
        .split(",")
        .map((e) => e.trim())
        .filter((e) => e.length > 0);
    } else {
      // Any non-excludes parenthesized clause is a version annotation
      version = clause;
    }
  }

  const result: OntologyMetadataEntry = { name };
  if (version !== undefined) result.version = version;
  if (excludes !== undefined) result.excludes = excludes;
  return result;
}

/**
 * Parse a comma-delimited ontologies list.
 * PARSE-23: supports per-entry "name (version) (excludes: ...)" grammar.
 */
export function parseOntologiesList(input: string): OntologyMetadataEntry[] {
  if (!input.trim()) return [];
  return splitTopLevelCommas(input)
    .map((part) => parseOntologyEntry(part))
    .filter((entry) => entry.name.length > 0);
}

/** Alias for stub compatibility */
export const parseOntologiesField = parseOntologiesList;

/**
 * Parse a simple YAML frontmatter block (key: value pairs only).
 * Returns a Map of (raw field name → value) on success, null on parse failure.
 */
function parseSimpleYaml(yamlText: string): Map<string, string> | null {
  try {
    const result = new Map<string, string>();
    for (const line of yamlText.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const colonIdx = trimmed.indexOf(":");
      if (colonIdx === -1) continue;

      const key = trimmed.slice(0, colonIdx).trim();
      if (!key) continue;

      let value = trimmed.slice(colonIdx + 1).trim();
      // Strip surrounding quotes
      if (value.length >= 2) {
        const first = value[0];
        const last = value[value.length - 1];
        if (
          (first === '"' && last === '"') ||
          (first === "'" && last === "'")
        ) {
          value = value.slice(1, -1);
        }
      }
      result.set(key, value);
    }
    return result;
  } catch {
    return null;
  }
}

/**
 * Parse metadata from raw BRIEF.md content.
 *
 * Accepts:
 *   - YAML frontmatter (--- delimited)
 *   - Bold markdown: **Field:** value or **Field :** value
 *   - Plain text: Field: value
 *
 * Inline metadata takes precedence over YAML for duplicate fields.
 *
 * Key design:
 *   - Map keys use getMapKey(): canonical display names for known fields (e.g.
 *     "Project"), original casing for unknown fields (e.g. "CustomField").
 *   - normalizeFieldName() returns lowercase for ALL inputs — this is a separate
 *     case-insensitivity utility, not used as the Map key.
 *
 * PARSE-01: Never throws. Returns whatever can be extracted.
 * PARSE-04: Accepts all three metadata formats.
 */
export function parseMetadata(input: string): ParsedMetadata {
  const warnings: string[] = [];
  const fields = new Map<string, string>();
  const fieldOrder: string[] = [];
  let consumedRange = { start: 0, end: 0 };

  const lines = input.split("\n");
  let bodyStartLine = 0;

  // ── YAML frontmatter detection ────────────────────────────────────────────
  let yamlParsed: Map<string, string> | null = null;

  if (lines.length > 0 && lines[0].trim() === "---") {
    let closingLine = -1;
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === "---") {
        closingLine = i;
        break;
      }
    }

    if (closingLine !== -1) {
      const yamlText = lines.slice(1, closingLine).join("\n");
      yamlParsed = parseSimpleYaml(yamlText);
      if (yamlParsed === null) {
        warnings.push(
          "Malformed YAML frontmatter; falling back to inline metadata extraction",
        );
      }
      bodyStartLine = closingLine + 1;
      // Compute consumed range as character offsets
      let charOffset = 0;
      for (let i = 0; i <= closingLine; i++) {
        charOffset += lines[i].length + 1; // +1 for '\n'
      }
      consumedRange = { start: 0, end: charOffset };
    } else {
      warnings.push(
        "Unclosed YAML frontmatter block; treating content as inline metadata",
      );
    }
  }

  // ── Inline metadata scanning ──────────────────────────────────────────────
  // Scan from body start to first section heading.
  // Use lowercase dedup keys internally; store with getMapKey() in final Map.
  const inlineLowerToMapKey = new Map<string, string>(); // dedup: lowercase → first-seen display key
  const inlineLowerToValue = new Map<string, string>(); // dedup: lowercase → latest value
  const inlineLowerOrder: string[] = []; // insertion order (lowercase keys)

  for (let i = bodyStartLine; i < lines.length; i++) {
    const line = lines[i];

    // Stop scanning at first section heading
    if (/^#{1,6}\s/.test(line)) break;

    let rawName: string | null = null;
    let rawValue: string | null = null;

    // Bold format: **Field:** value or **Field :** value
    let m = BOLD_META_RE.exec(line);
    if (m) {
      rawName = m[1];
      rawValue = m[2];
    } else {
      // Plain format: Field: value
      m = PLAIN_META_RE.exec(line);
      if (m) {
        rawName = m[1];
        rawValue = m[2];
      }
    }

    if (rawName !== null && rawValue !== null) {
      const lowerKey = rawName.trim().toLowerCase();
      const mapKey = getMapKey(rawName);
      if (!inlineLowerToMapKey.has(lowerKey)) {
        inlineLowerOrder.push(lowerKey);
        inlineLowerToMapKey.set(lowerKey, mapKey);
      }
      // Value captured as-is (no trim) — COMPAT-01 exact preservation
      inlineLowerToValue.set(lowerKey, rawValue);
    }
  }

  // ── Merge: YAML base, inline overrides ───────────────────────────────────
  if (yamlParsed) {
    for (const [rawKey, value] of yamlParsed) {
      const mapKey = getMapKey(rawKey);
      if (!fields.has(mapKey)) fieldOrder.push(mapKey);
      fields.set(mapKey, value);
    }
  }

  for (const lowerKey of inlineLowerOrder) {
    const mapKey = inlineLowerToMapKey.get(lowerKey) ?? lowerKey;
    const value = inlineLowerToValue.get(lowerKey) ?? "";
    if (!fields.has(mapKey)) fieldOrder.push(mapKey);
    // Inline always wins — overwrite even if set by YAML
    fields.set(mapKey, value);
  }

  // ── Post-process known fields ─────────────────────────────────────────────

  // Type normalization: "Software Library" → "software-library" (COMPAT-06)
  const typeVal = fields.get("Type");
  if (typeVal !== undefined) {
    fields.set("Type", normalizeType(typeVal));
  }

  // Version compatibility check (COMPAT-03)
  const versionVal = fields.get("Version");
  if (versionVal) {
    const majorMatch = /^v?(\d+)\./.exec(versionVal);
    const major = majorMatch ? parseInt(majorMatch[1], 10) : null;
    if (major !== null && major >= 2) {
      warnings.push(
        `BRIEF.md spec version ${versionVal} may not be fully supported; expected v1.x`,
      );
    }
    // v1.x: accepted silently
  }

  // ── Required field warnings ───────────────────────────────────────────────
  for (const req of REQUIRED_FIELDS) {
    if (!fields.has(req)) {
      warnings.push(`Missing required metadata field: ${req}`);
    }
  }

  return { fields, warnings, fieldOrder, consumedRange };
}

/** Alias for stub compatibility */
export const extractMetadata = parseMetadata;
