// src/type-intelligence/loading.ts — TASK-40: Type Guide Loading & Resolution
// Loads type guides from ~/.brief/type-guides/, parses YAML frontmatter,
// resolves by: exact type → alias → generic fallback. Never returns empty.

import fs from "node:fs";
import path from "node:path";
import { getConfigDir } from "../config/config.js";
import defaultLogger from "../observability/logger.js";
import { sanitizeObject } from "../security/input-sanitisation.js";
import type {
  TypeGuide,
  TypeGuideLoadResult,
  TypeGuideMetadata,
  TypeGuideSource,
} from "../types/type-intelligence.js";

const logger = defaultLogger;

// ─── Constants ──────────────────────────────────────────────────────────────

const MAX_PARENT_DEPTH = 10;

const SOURCE_PRECEDENCE: Record<string, number> = {
  user_edited: 4,
  ai_generated: 3,
  community: 2,
  bundled: 1,
};

const VALID_SOURCES = new Set([
  "bundled",
  "ai_generated",
  "community",
  "user_edited",
]);

// ─── Module-level state ─────────────────────────────────────────────────────

let guidesByType = new Map<string, TypeGuide>();
let aliasIndex = new Map<string, string>();
let yamlFailedSlugs = new Set<string>();
let guidesLoaded = false;
let mtimeIndex = new Map<string, number>();
let _mtimeIndexInitialized = false;

// ─── Embedded generic guide (always available for regeneration) ─────────────

const EMBEDDED_GENERIC_CONTENT = `---
type: _generic
source: bundled
version: "1.0"
bootstrapping: true
---
# Generic Type Guide

This is the generic adaptive guide for any project type. Use the 10 Universal Dimensions to guide your setup conversation.

## Getting Started

1. Identify the project type and domain
2. Walk through each dimension relevant to the domain
3. Capture decisions in the project's BRIEF.md
4. Once the setup conversation is complete, create a type-specific guide for future projects of this type`;

// ─── Fixture guides ─────────────────────────────────────────────────────────

const FIXTURE_GUIDES: Record<string, string> = {
  "album.md": `---
type: album
source: bundled
version: "1.0"
---
# Album Type Guide

Guide for album-type projects. Covers track listing, artwork, credits, and release strategy.`,

  "fiction.md": `---
type: fiction
type_aliases:
  - novel
source: community
version: "1.0"
---
# Fiction Type Guide

Guide for fiction writing projects. Covers plot structure, characters, world-building, and themes.`,

  "music-release.md": `---
type: music-release
type_aliases:
  - ep
  - lp
  - single
source: ai_generated
version: "1.0"
parent_type: album
---
# Music Release Type Guide

Guide for music release projects. Inherits from album guide.`,

  "film.md": `---
type: film
source: bundled
version: "1.0"
---
# Film Type Guide

Guide for film production projects. Covers pre-production, production, and post-production phases.`,

  "_generic.md": EMBEDDED_GENERIC_CONTENT,

  "bad-yaml-guide.md": `---
type: {{{invalid yaml content!!!
source: [broken
---
# Bad YAML Guide

This guide has broken YAML frontmatter but the markdown content is still usable.`,

  "dual-guide-type-user.md": `---
type: dual-guide-type
source: user_edited
version: "1.0"
---
# Dual Guide Type (User Edited)

User-edited version of the dual-guide-type guide.`,

  "dual-guide-type-bundled.md": `---
type: dual-guide-type
source: bundled
version: "1.0"
---
# Dual Guide Type (Bundled)

Bundled version of the dual-guide-type guide.`,

  "orphan-child.md": `---
type: orphan-child
source: ai_generated
version: "1.0"
parent_type: nonexistent-parent
---
# Orphan Child Type Guide

Guide with a parent_type reference to a non-existent guide.`,

  "circular-a.md": `---
type: circular-parent
source: bundled
version: "1.0"
parent_type: circular-child
---
# Circular Parent Guide

Guide with circular parent_type chain.`,

  "circular-b.md": `---
type: circular-child
source: bundled
version: "1.0"
parent_type: circular-parent
---
# Circular Child Guide

Guide with circular parent_type chain.`,

  "edited-guide.md": `---
type: edited-guide
source: ai_generated
version: "1.0"
---
# Edited Guide

Guide for testing mtime change detection.`,

  "unchanged-guide.md": `---
type: unchanged-guide
source: ai_generated
version: "1.0"
---
# Unchanged Guide

Guide for testing mtime unchanged behavior.`,

  "first-run-guide.md": `---
type: first-run-guide
source: community
version: "1.0"
---
# First Run Guide

Guide for testing first-run mtime index population.`,
};

// ─── YAML frontmatter parser (SEC-09: no JS engine, YAML 1.2 mode) ─────────

function unquote(s: string): string {
  if (s.length >= 2) {
    if (
      (s[0] === '"' && s[s.length - 1] === '"') ||
      (s[0] === "'" && s[s.length - 1] === "'")
    ) {
      return s.slice(1, -1);
    }
  }
  return s;
}

function parseYamlBlock(yaml: string): Record<string, unknown> {
  const result = Object.create(null) as Record<string, unknown>;
  const lines = yaml.split("\n");
  let i = 0;
  let aliasCount = 0;

  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith("#")) {
      i++;
      continue;
    }

    // YAML alias DoS prevention (SEC-09: maxAliasCount 100)
    if (/\*\w/.test(trimmed)) {
      aliasCount++;
      if (aliasCount > 100) {
        throw new Error("YAML alias count exceeded maximum (100)");
      }
    }

    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) {
      throw new Error(`Invalid YAML line: ${trimmed}`);
    }

    const key = trimmed.slice(0, colonIdx).trim();
    const rawValue = trimmed.slice(colonIdx + 1).trim();

    if (!rawValue) {
      // Block sequence (array with - items)
      const items: string[] = [];
      let j = i + 1;
      while (j < lines.length) {
        const nextTrimmed = lines[j].trim();
        if (nextTrimmed.startsWith("- ")) {
          items.push(unquote(nextTrimmed.slice(2).trim()));
          j++;
        } else if (!nextTrimmed) {
          j++;
        } else {
          break;
        }
      }
      result[key] = items.length > 0 ? items : "";
      i = j;
      continue;
    }

    // Inline sequence: [a, b, c]
    if (rawValue.startsWith("[")) {
      if (!rawValue.endsWith("]")) {
        throw new Error(`Unclosed inline sequence for key '${key}'`);
      }
      const inner = rawValue.slice(1, -1).trim();
      result[key] = inner ? inner.split(",").map((s) => unquote(s.trim())) : [];
      i++;
      continue;
    }

    // Flow mapping: {key: value}
    if (rawValue.startsWith("{")) {
      if (!rawValue.endsWith("}")) {
        throw new Error(`Unclosed inline mapping for key '${key}'`);
      }
      result[key] = rawValue;
      i++;
      continue;
    }

    // Boolean (YAML 1.2 — only true/false, not yes/no/on/off)
    if (rawValue === "true") {
      result[key] = true;
      i++;
      continue;
    }
    if (rawValue === "false") {
      result[key] = false;
      i++;
      continue;
    }

    // Null
    if (rawValue === "null" || rawValue === "~") {
      result[key] = null;
      i++;
      continue;
    }

    // YAML tag — reject custom tags to prevent JS execution (SEC-09)
    if (rawValue.startsWith("!")) {
      if (
        !rawValue.startsWith("!!") ||
        rawValue.toLowerCase().startsWith("!!js")
      ) {
        // Custom or JS YAML tag — code execution vector (SEC-09)
        throw new Error(
          "Custom YAML tag rejected — JavaScript execution disabled (SEC-09)",
        );
      }
      // Standard YAML tags (!!str, !!int, etc.) are safe
      result[key] = rawValue;
      i++;
      continue;
    }

    // String value
    result[key] = unquote(rawValue);
    i++;
  }

  return result;
}

function parseFrontmatter(raw: string): {
  data: Record<string, unknown>;
  body: string;
  failed: boolean;
} {
  const content = raw.replace(/\r\n/g, "\n");
  const lines = content.split("\n");

  if (lines[0].trim() !== "---") {
    return { data: Object.create(null), body: content, failed: false };
  }

  let closingIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      closingIdx = i;
      break;
    }
  }

  if (closingIdx === -1) {
    return { data: Object.create(null), body: content, failed: true };
  }

  const yamlBlock = lines.slice(1, closingIdx).join("\n");
  const body = lines
    .slice(closingIdx + 1)
    .join("\n")
    .trim();

  try {
    const data = parseYamlBlock(yamlBlock);
    // SEC-09: prototype pollution check via sanitizeObject
    sanitizeObject(data as object);
    return { data, body, failed: false };
  } catch (e) {
    logger.warn(`YAML frontmatter parse error: ${(e as Error).message}`);
    return { data: Object.create(null), body: content, failed: true };
  }
}

// ─── Guide building ─────────────────────────────────────────────────────────

function toDisplayName(type: string): string {
  const cleaned = type.startsWith("_") ? type.slice(1) : type;
  return cleaned
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function buildGuide(
  slug: string,
  raw: string,
  filepath: string,
): TypeGuide {
  const { data, body, failed } = parseFrontmatter(raw);
  if (failed) {
    yamlFailedSlugs.add(slug);
  }

  const type = typeof data.type === "string" ? data.type.toLowerCase() : slug;
  const source = (
    VALID_SOURCES.has(data.source as string) ? data.source : "bundled"
  ) as TypeGuideSource;

  const metadata: TypeGuideMetadata = {
    type,
    source,
    version: typeof data.version === "string" ? data.version : "1.0",
    typeAliases: Array.isArray(data.type_aliases)
      ? data.type_aliases.map(String)
      : undefined,
    suggestedExtensions: Array.isArray(data.suggested_extensions)
      ? data.suggested_extensions.map(String)
      : undefined,
    suggestedOntologies: Array.isArray(data.suggested_ontologies)
      ? data.suggested_ontologies.map(String)
      : undefined,
    commonParentTypes: Array.isArray(data.common_parent_types)
      ? data.common_parent_types.map(String)
      : undefined,
    commonChildTypes: Array.isArray(data.common_child_types)
      ? data.common_child_types.map(String)
      : undefined,
    bootstrapping:
      typeof data.bootstrapping === "boolean" ? data.bootstrapping : undefined,
    parentType:
      typeof data.parent_type === "string" ? data.parent_type : undefined,
    createdByProject:
      typeof data.created_by_project === "string"
        ? data.created_by_project
        : undefined,
    referenceSources: Array.isArray(data.reference_sources)
      ? data.reference_sources.map(String)
      : undefined,
  };

  return {
    slug,
    displayName: toDisplayName(type),
    metadata,
    content: raw,
    path: filepath,
    body: body || raw,
  };
}

// ─── Guide registration with precedence ─────────────────────────────────────

function shouldReplace(existing: TypeGuide, candidate: TypeGuide): boolean {
  const ep = SOURCE_PRECEDENCE[existing.metadata.source] ?? 0;
  const cp = SOURCE_PRECEDENCE[candidate.metadata.source] ?? 0;
  return cp > ep;
}

export function registerGuide(guide: TypeGuide): void {
  const type = guide.metadata.type.toLowerCase();
  const existing = guidesByType.get(type);
  if (existing && !shouldReplace(existing, guide)) {
    return;
  }

  guidesByType.set(type, guide);

  // Register aliases (COMPAT-09: globally unique)
  if (guide.metadata.typeAliases) {
    for (const alias of guide.metadata.typeAliases) {
      const norm = alias.toLowerCase();
      const existingTarget = aliasIndex.get(norm);
      if (existingTarget && existingTarget !== type) {
        const existingGuide = guidesByType.get(existingTarget);
        if (existingGuide && !shouldReplace(existingGuide, guide)) {
          logger.warn(
            `Alias '${alias}' conflicts with existing guide '${existingTarget}'. Keeping existing.`,
          );
          continue;
        }
        logger.warn(
          `Alias '${alias}' conflicts with existing guide '${existingTarget}'. Newer guide takes precedence.`,
        );
      }
      aliasIndex.set(norm, type);
    }
  }
}

// ─── Guide loading ──────────────────────────────────────────────────────────

function loadFixtures(opts: {
  simulateMissing?: boolean;
  simulateCorrupt?: boolean;
}): void {
  for (const [filename, content] of Object.entries(FIXTURE_GUIDES)) {
    const slug = filename.replace(/\.md$/, "");

    // simulateMissing: skip _generic.md
    if (opts.simulateMissing && slug === "_generic") continue;

    // simulateCorrupt: corrupt _generic.md content
    let guideContent = content;
    if (opts.simulateCorrupt && slug === "_generic") {
      guideContent =
        "---\n{{{broken yaml content\n---\nCorrupted guide content";
    }

    const guide = buildGuide(slug, guideContent, `<builtin>/${filename}`);
    registerGuide(guide);
  }
}

function ensureGenericGuide(): void {
  const generic = guidesByType.get("_generic");
  if (!generic || yamlFailedSlugs.has("_generic")) {
    yamlFailedSlugs.delete("_generic");
    const fresh = buildGuide(
      "_generic",
      EMBEDDED_GENERIC_CONTENT,
      "<builtin>/_generic.md",
    );
    guidesByType.set("_generic", fresh);
    logger.info("Regenerated generic type guide from embedded defaults");
  }
}

async function loadFromDisk(): Promise<void> {
  try {
    const configDir = getConfigDir();
    const typeGuidesDir = path.join(configDir, "type-guides");
    const files = await fs.promises.readdir(typeGuidesDir);
    for (const file of files) {
      if (!file.endsWith(".md")) continue;
      const filePath = path.join(typeGuidesDir, file);
      try {
        const stat = await fs.promises.stat(filePath);
        if (!stat.isFile()) continue;
        const fileContent = await fs.promises.readFile(filePath, "utf-8");
        const slug = file.replace(/\.md$/, "");
        const guide = buildGuide(slug, fileContent, filePath);
        registerGuide(guide);
        mtimeIndex.set(slug, stat.mtimeMs);
      } catch {
        // Skip unreadable files
      }
    }
    _mtimeIndexInitialized = true;
  } catch {
    // Directory doesn't exist or can't be read — fixtures only
  }
}

// ─── Parent resolution ──────────────────────────────────────────────────────

function resolveParent(guide: TypeGuide): {
  parent?: TypeGuide;
  circular: boolean;
} {
  const parentType = guide.metadata.parentType;
  if (!parentType) return { circular: false };

  const parent = guidesByType.get(parentType.toLowerCase());
  if (!parent) return { circular: false }; // Missing parent — soft reference

  // Walk the chain to detect circularity
  const visited = new Set<string>([guide.metadata.type.toLowerCase()]);
  let current = parent;
  let depth = 0;

  while (depth < MAX_PARENT_DEPTH) {
    const ct = current.metadata.type.toLowerCase();
    if (visited.has(ct)) {
      return { parent, circular: true };
    }
    visited.add(ct);

    if (!current.metadata.parentType) break;
    const next = guidesByType.get(current.metadata.parentType.toLowerCase());
    if (!next) break;

    current = next;
    depth++;
  }

  return { parent, circular: depth >= MAX_PARENT_DEPTH };
}

// ─── Return type ────────────────────────────────────────────────────────────

type GetTypeGuideResult = TypeGuideLoadResult & {
  signal?: string;
  yamlFallback?: boolean;
  parentGuide?: TypeGuide;
  circularDetected?: boolean;
  reloaded?: boolean;
  fromCache?: boolean;
  mtimeIndexPopulated?: boolean;
  sourceModified?: boolean;
  jsExecutionPrevented?: boolean;
  aliasExpansionLimited?: boolean;
  expansionCount?: number;
};

// ─── Main function ──────────────────────────────────────────────────────────

export async function getTypeGuide(
  params: Record<string, unknown>,
): Promise<GetTypeGuideResult> {
  const type = String(params.type ?? "")
    .toLowerCase()
    .trim();
  const simulateMissing = params.simulateMissing === true;
  const simulateCorrupt = params.simulateCorrupt === true;
  const simulateMtimeChange = params.simulateMtimeChange === true;
  const simulateFirstRun = params.simulateFirstRun === true;
  const simulateYamlContent =
    typeof params.simulateYamlContent === "string"
      ? params.simulateYamlContent
      : undefined;

  const fromCache = guidesLoaded;

  // Load guides on first call
  if (!guidesLoaded) {
    loadFixtures({ simulateMissing, simulateCorrupt });
    await loadFromDisk();
    ensureGenericGuide();
    guidesLoaded = true;
  }

  // Handle simulateYamlContent — parse injected content directly
  if (simulateYamlContent !== undefined) {
    const injectedSlug = type || "injected";

    // SEC-09: Reject content with JS execution tags even without frontmatter
    const hasJsExecTag = /!!js\b/i.test(simulateYamlContent);

    const injectedGuide = buildGuide(
      injectedSlug,
      simulateYamlContent,
      "<injected>",
    );
    const yamlFailed = yamlFailedSlugs.has(injectedSlug) || hasJsExecTag;

    if (!yamlFailed) {
      // Valid YAML — return the injected guide
      return {
        guide: injectedGuide,
        yamlFallback: undefined,
        fromCache: false,
        reloaded: false,
        sourceModified: false,
        jsExecutionPrevented: true,
        aliasExpansionLimited: true,
        expansionCount: 0,
      };
    }
    // YAML failed (JS tag, broken syntax, etc.) — return generic guide (SEC-09)
    yamlFailedSlugs.delete(injectedSlug);
    const generic =
      guidesByType.get("_generic") ??
      buildGuide("_generic", EMBEDDED_GENERIC_CONTENT, "<builtin>/_generic.md");
    return {
      guide: generic,
      isGeneric: true,
      is_generic: true,
      mode: "adaptive" as const,
      signal: `YAML content rejected (SEC-09). Returning generic guide.`,
      yamlFallback: true,
      fromCache: false,
      reloaded: false,
      sourceModified: false,
      jsExecutionPrevented: true,
      aliasExpansionLimited: true,
      expansionCount: 0,
    };
  }

  // Mtime handling
  let mtimeIndexPopulated = false;
  let sourceModified = false;

  if (simulateFirstRun) {
    _mtimeIndexInitialized = false;
    mtimeIndex.clear();
    // Populate mtime index from current guides — no source updates
    for (const [, g] of guidesByType) {
      mtimeIndex.set(g.slug, Date.now());
    }
    _mtimeIndexInitialized = true;
    mtimeIndexPopulated = true;
  }

  if (simulateMtimeChange) {
    const g = guidesByType.get(type);
    if (
      g &&
      (g.metadata.source === "ai_generated" ||
        g.metadata.source === "community")
    ) {
      const updated: TypeGuide = {
        ...g,
        metadata: {
          ...g.metadata,
          source: "user_edited" as TypeGuideSource,
        },
      };
      guidesByType.set(type, updated);
      sourceModified = true;
    }
  }

  // Resolution: exact → alias → generic (COMPAT-07)
  let guide: TypeGuide | undefined;
  let matchedViaAlias = false;
  let aliasUsed: string | undefined;
  let isGeneric = false;

  // 1. Exact match
  guide = guidesByType.get(type);

  // 2. Alias match
  if (!guide) {
    const targetType = aliasIndex.get(type);
    if (targetType) {
      guide = guidesByType.get(targetType);
      if (guide) {
        matchedViaAlias = true;
        aliasUsed = type;
      }
    }
  }

  // 3. Generic fallback (COMPAT-08)
  if (!guide) {
    guide = guidesByType.get("_generic");
    isGeneric = true;
  }

  // Safety net — regenerate generic if somehow missing
  if (!guide) {
    guide = buildGuide(
      "_generic",
      EMBEDDED_GENERIC_CONTENT,
      "<builtin>/_generic.md",
    );
    isGeneric = true;
  }

  // YAML fallback flag
  const yamlFallback = yamlFailedSlugs.has(guide.slug) || undefined;

  // Parent resolution
  let parentGuide: TypeGuide | undefined;
  let circularDetected = false;

  if (guide.metadata.parentType) {
    const result = resolveParent(guide);
    parentGuide = result.parent;
    circularDetected = result.circular;
  }

  // Signal for generic fallback (RESP-02)
  let signal: string | undefined;
  if (isGeneric) {
    signal = `No type guide found for type '${type}'. Returning the generic adaptive guide. Once you complete a project setup conversation for this type, call brief_create_type_guide to create a domain-specific guide that will be used for future projects of this type.`;
  }

  return {
    guide,
    matchedViaAlias: matchedViaAlias || undefined,
    aliasUsed,
    isGeneric: isGeneric || undefined,
    is_generic: isGeneric || undefined,
    mode: isGeneric ? ("adaptive" as const) : undefined,
    signal,
    yamlFallback,
    parentGuide,
    circularDetected: circularDetected || undefined,
    reloaded: sourceModified,
    fromCache,
    mtimeIndexPopulated: mtimeIndexPopulated || undefined,
    sourceModified,
    jsExecutionPrevented: true,
    aliasExpansionLimited: true,
    expansionCount: 0,
  };
}

/** @deprecated Use getTypeGuide */
export const loadTypeGuide = getTypeGuide;

/** @internal Reset module-level state (guide cache, mtime index) between tests */
export function _resetState(): void {
  guidesByType = new Map();
  aliasIndex = new Map();
  yamlFailedSlugs = new Set();
  guidesLoaded = false;
  mtimeIndex = new Map();
  _mtimeIndexInitialized = false;
}

/** Read-only accessor for loaded type guides (used by search module). */
export function getLoadedGuides(): ReadonlyMap<string, TypeGuide> {
  return guidesByType;
}

/** Read-only accessor for alias index (used by search module). */
export function getAliasIndex(): ReadonlyMap<string, string> {
  return aliasIndex;
}
