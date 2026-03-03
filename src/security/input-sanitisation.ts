// src/security/input-sanitisation.ts — TASK-05b
// Unicode normalisation, parameter validation, input sanitisation,
// prototype-pollution prevention, and entry-ID validation.

import type { OntologyPackSchema, ParameterType } from "../types/security.js";

// ─────────────────────────────────────────────
// Internal error helper
// ─────────────────────────────────────────────

interface BriefValidationError extends Error {
  type: string;
  param?: string;
  limit?: number;
  conflicting?: string[];
  dangerousKey?: string;
  id?: string;
}

function makeError(
  type: string,
  message: string,
  extra?: Partial<
    Pick<
      BriefValidationError,
      "param" | "limit" | "conflicting" | "dangerousKey" | "id"
    >
  >,
): BriefValidationError {
  return Object.assign(
    new Error(message),
    { type },
    extra,
  ) as BriefValidationError;
}

// ─────────────────────────────────────────────
// Character-class regex constants
// ─────────────────────────────────────────────

// Zero-width / invisible formatting characters (SEC-20, OQ-236-238).
// Use alternation to avoid noMisleadingCharacterClass lint warning for ZWJ/ZWNJ.
// U+180E MONGOLIAN VOWEL SEPARATOR, U+200B ZERO WIDTH SPACE,
// U+200C ZERO WIDTH NON-JOINER, U+200D ZERO WIDTH JOINER,
// U+2060 WORD JOINER, U+FEFF ZERO WIDTH NO-BREAK SPACE (BOM)
const ZERO_WIDTH_RE = /\u180E|\u200B|\u200C|\u200D|\u2060|\uFEFF/g;

// Bidirectional control characters (Trojan Source — CVE-2021-42574)
// U+200E/200F marks; U+202A-202E embedding controls; U+2066-2069 isolates
const BIDI_RE = /[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;

// ─────────────────────────────────────────────
// 6. stripBidiCharacters
// ─────────────────────────────────────────────

/**
 * Remove all bidirectional control characters (SEC-20).
 * Standalone version — also called by normalizeForMatching.
 */
export function stripBidiCharacters(text: string): string {
  return text.replace(BIDI_RE, "");
}

// ─────────────────────────────────────────────
// 1. normalizeForMatching
// ─────────────────────────────────────────────

/**
 * Single choke-point for all text matching across the codebase.
 * Strips zero-width chars, bidi overrides, then applies NFC.
 * Does NOT lowercase (preserve original case).
 */
export function normalizeForMatching(input: string): string {
  return input.replace(ZERO_WIDTH_RE, "").replace(BIDI_RE, "").normalize("NFC");
}

// ─────────────────────────────────────────────
// 2. validateRequiredString
// ─────────────────────────────────────────────

/**
 * Throw a user_error if the value is null/undefined/empty/whitespace-only.
 */
export function validateRequiredString(
  value: unknown,
  paramName: string,
): void {
  if (
    value === null ||
    value === undefined ||
    (typeof value === "string" && value.trim() === "")
  ) {
    throw makeError(
      "user_error",
      `Parameter '${paramName}' is required and cannot be empty or whitespace-only`,
      { param: paramName },
    );
  }
}

// ─────────────────────────────────────────────
// 3. validateParameterLimits
// ─────────────────────────────────────────────

const PARAM_LIMITS: Record<ParameterType, number> = {
  title: 500,
  content: 102_400,
  query: 1_000,
  label: 200,
  path: 4_096,
};

/**
 * Enforce per-parameter-type length limits (SEC-19).
 * Throws user_error on exceeding limits.
 */
export function validateParameterLimits(
  value: string,
  paramName: string,
  type: ParameterType,
): void {
  const limit = PARAM_LIMITS[type];
  if (value.length > limit) {
    throw makeError(
      "user_error",
      `Parameter '${paramName}' exceeds the ${type} limit of ${limit} characters (received ${value.length})`,
      { param: paramName, limit },
    );
  }
}

// ─────────────────────────────────────────────
// 4. validateMutualExclusion
// ─────────────────────────────────────────────

/**
 * Reject conflicting parameter pairs and enforce dependencies.
 *
 * @param params       - object of resolved parameters
 * @param exclusions   - groups where at most one may be present
 * @param dependencies - "A requires B" rules
 */
export function validateMutualExclusion(
  params: Record<string, unknown>,
  exclusions: string[][],
  dependencies?: Array<{ if: string; requires: string }>,
): void {
  for (const group of exclusions) {
    const present = group.filter(
      (k) => params[k] !== undefined && params[k] !== null,
    );
    if (present.length > 1) {
      throw makeError(
        "user_error",
        `Conflicting parameters: ${present.join(" and ")} cannot be used together`,
        { conflicting: present },
      );
    }
  }

  if (dependencies) {
    for (const dep of dependencies) {
      const ifPresent = params[dep.if] !== undefined && params[dep.if] !== null;
      const reqPresent =
        params[dep.requires] !== undefined && params[dep.requires] !== null;
      if (ifPresent && !reqPresent) {
        throw makeError(
          "user_error",
          `Parameter '${dep.if}' requires '${dep.requires}' to also be specified`,
          { param: dep.if },
        );
      }
    }
  }
}

// ─────────────────────────────────────────────
// 5. sanitizeObject
// ─────────────────────────────────────────────

const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function sanitizeRecursive(obj: unknown, depth: number): void {
  if (depth > 100) return; // guard against circular refs / deep nesting
  if (obj === null || typeof obj !== "object") return;

  if (Array.isArray(obj)) {
    for (const item of obj as unknown[]) {
      sanitizeRecursive(item, depth + 1);
    }
    return;
  }

  // Detect __proto__ injection via object-literal notation:
  // { __proto__: X } sets the prototype chain rather than creating an
  // enumerable key. Resulting object has proto != Object.prototype — flag it.
  const proto = Object.getPrototypeOf(obj as object) as unknown;
  if (proto !== null && proto !== Object.prototype) {
    throw makeError(
      "security_error",
      "Security violation: object has a modified prototype chain (__proto__ pollution detected)",
      { dangerousKey: "__proto__" },
    );
  }

  // Detect dangerous string keys (covers constructor/prototype and
  // __proto__ on null-prototype objects where it appears as a plain key).
  for (const key of Object.keys(obj as Record<string, unknown>)) {
    if (DANGEROUS_KEYS.has(key)) {
      throw makeError(
        "security_error",
        `Security violation: dangerous prototype key '${key}' detected in object`,
        { dangerousKey: key },
      );
    }
    sanitizeRecursive((obj as Record<string, unknown>)[key], depth + 1);
  }
}

/**
 * Recursively validate an object tree for prototype-pollution keys (OQ-235).
 * Throws security_error on __proto__, constructor, or prototype at any depth.
 * Also detects __proto__ pollution via object-literal prototype-chain modification.
 */
export function sanitizeObject(obj: object): void {
  sanitizeRecursive(obj, 0);
}

// ─────────────────────────────────────────────
// 7. validateEntryId
// ─────────────────────────────────────────────

const ENTRY_ID_RE = /^[a-zA-Z0-9_-]+$/;

/**
 * Validate ontology pack entry IDs (SEC-18).
 * Allowed: alphanumeric, hyphens, underscores. No dots, slashes, spaces.
 */
export function validateEntryId(id: string): void {
  if (!ENTRY_ID_RE.test(id)) {
    throw makeError(
      "user_error",
      `Invalid entry ID '${id}': only alphanumeric, hyphens (-) and underscores (_) are allowed`,
      { id },
    );
  }
}

// ─────────────────────────────────────────────
// 8. detectHomoglyphs
// ─────────────────────────────────────────────

// Known Cyrillic characters that look like Latin equivalents
const SCRIPT_HOMOGLYPH_MAP = new Map<string, string>([
  ["\u0430", "a"],
  ["\u0435", "e"],
  ["\u043E", "o"],
  ["\u0440", "p"],
  ["\u0441", "c"],
  ["\u0445", "x"],
  ["\u0443", "y"],
  ["\u0456", "i"],
  ["\u0454", "e"],
  ["\u0410", "A"],
  ["\u0412", "B"],
  ["\u0415", "E"],
  ["\u041A", "K"],
  ["\u041C", "M"],
  ["\u041D", "H"],
  ["\u041E", "O"],
  ["\u0420", "P"],
  ["\u0421", "C"],
  ["\u0422", "T"],
  ["\u0425", "X"],
  ["\u0423", "Y"],
]);

function applyScriptNormalization(text: string): string {
  return [...text].map((ch) => SCRIPT_HOMOGLYPH_MAP.get(ch) ?? ch).join("");
}

/** Kept for backwards compatibility with internal callers that imported the type. */
export interface HomoglyphWarning {
  detected: boolean;
  warning?: string;
}

/**
 * Detect whether text1 and text2 are visually confusable due to homoglyphs.
 * Checks NFKD compatibility equivalents and cross-script substitutions.
 */
export function detectHomoglyphs(
  text1: string,
  text2: string,
): { hasHomoglyphs: boolean; warning?: string } {
  if (text1 === text2) return { hasHomoglyphs: false };

  const nfkd1 = text1.normalize("NFKD");
  const nfkd2 = text2.normalize("NFKD");

  if (nfkd1 === nfkd2) {
    return {
      hasHomoglyphs: true,
      warning:
        "Strings contain compatibility-equivalent characters that appear identical",
    };
  }

  if (applyScriptNormalization(nfkd1) === applyScriptNormalization(nfkd2)) {
    return {
      hasHomoglyphs: true,
      warning:
        "Strings may contain visually identical characters from different Unicode scripts",
    };
  }

  return { hasHomoglyphs: false };
}

// ─────────────────────────────────────────────
// 9. validateOntologyPackSchema
// ─────────────────────────────────────────────

const SCRIPT_TAG_RE = /<script[\s>]/i;
const MAX_ENTRIES = 50_000;
const MAX_KEYWORDS = 100;
const MAX_SYNONYMS = 50;
const MAX_REFERENCES = 500;
const MAX_LABEL_LEN = 500;
const MAX_DESC_LEN = 5_000;
const MAX_KEYWORD_LEN = 100;

function rejectScript(value: string, field: string): void {
  if (SCRIPT_TAG_RE.test(value)) {
    throw makeError(
      "user_error",
      `${field} contains disallowed HTML/script content`,
    );
  }
}

/**
 * Strict schema validation for ontology packs (SEC-07, SEC-08).
 * Throws user_error describing the first validation failure.
 */
export function validateOntologyPackSchema(
  data: unknown,
): asserts data is OntologyPackSchema {
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    throw makeError("user_error", "Ontology pack must be a non-null object");
  }

  const pack = data as Record<string, unknown>;

  if (typeof pack.name !== "string" || (pack.name as string).trim() === "") {
    throw makeError(
      "user_error",
      "Ontology pack missing required field 'name'",
    );
  }
  if (
    typeof pack.version !== "string" ||
    (pack.version as string).trim() === ""
  ) {
    throw makeError(
      "user_error",
      "Ontology pack missing required field 'version'",
    );
  }
  if (!Array.isArray(pack.entries)) {
    throw makeError(
      "user_error",
      "Ontology pack missing required field 'entries'",
    );
  }

  const entries = pack.entries as unknown[];

  if (entries.length > MAX_ENTRIES) {
    throw makeError(
      "user_error",
      `Ontology pack exceeds maximum entry count of ${MAX_ENTRIES} (has ${entries.length})`,
    );
  }

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      throw makeError(
        "user_error",
        `Ontology pack entries[${i}] must be a non-null object`,
      );
    }

    const e = entry as Record<string, unknown>;

    if (typeof e.id !== "string" || (e.id as string).trim() === "") {
      throw makeError(
        "user_error",
        `Ontology pack entries[${i}] missing required field 'id'`,
      );
    }
    if (typeof e.label !== "string" || (e.label as string).trim() === "") {
      throw makeError(
        "user_error",
        `Ontology pack entries[${i}] missing required field 'label'`,
      );
    }

    const label = e.label as string;
    if (label.length > MAX_LABEL_LEN) {
      throw makeError(
        "user_error",
        `Ontology pack entries[${i}].label exceeds ${MAX_LABEL_LEN} char limit`,
      );
    }
    rejectScript(label, `entries[${i}].label`);

    if (e.description !== undefined) {
      if (typeof e.description !== "string") {
        throw makeError(
          "user_error",
          `Ontology pack entries[${i}].description must be a string`,
        );
      }
      const desc = e.description as string;
      if (desc.length > MAX_DESC_LEN) {
        throw makeError(
          "user_error",
          `Ontology pack entries[${i}].description exceeds ${MAX_DESC_LEN} char limit`,
        );
      }
      rejectScript(desc, `entries[${i}].description`);
    }

    if (e.keywords !== undefined) {
      if (!Array.isArray(e.keywords)) {
        throw makeError(
          "user_error",
          `Ontology pack entries[${i}].keywords must be an array`,
        );
      }
      const kws = e.keywords as unknown[];
      if (kws.length > MAX_KEYWORDS) {
        throw makeError(
          "user_error",
          `Ontology pack entries[${i}].keywords exceeds ${MAX_KEYWORDS} item limit`,
        );
      }
      for (let ki = 0; ki < kws.length; ki++) {
        if (typeof kws[ki] !== "string") {
          throw makeError(
            "user_error",
            `Ontology pack entries[${i}].keywords[${ki}] must be a string`,
          );
        }
        if ((kws[ki] as string).length > MAX_KEYWORD_LEN) {
          throw makeError(
            "user_error",
            `Ontology pack entries[${i}].keywords[${ki}] exceeds ${MAX_KEYWORD_LEN} char limit`,
          );
        }
      }
    }

    if (e.synonyms !== undefined) {
      if (!Array.isArray(e.synonyms)) {
        throw makeError(
          "user_error",
          `Ontology pack entries[${i}].synonyms must be an array`,
        );
      }
      if ((e.synonyms as unknown[]).length > MAX_SYNONYMS) {
        throw makeError(
          "user_error",
          `Ontology pack entries[${i}].synonyms exceeds ${MAX_SYNONYMS} item limit`,
        );
      }
    }

    if (e.references !== undefined) {
      if (!Array.isArray(e.references)) {
        throw makeError(
          "user_error",
          `Ontology pack entries[${i}].references must be an array`,
        );
      }
      if ((e.references as unknown[]).length > MAX_REFERENCES) {
        throw makeError(
          "user_error",
          `Ontology pack entries[${i}].references exceeds ${MAX_REFERENCES} item limit`,
        );
      }
    }
  }
}
