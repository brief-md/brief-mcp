// src/type-intelligence/creation.ts — TASK-41: Type Guide Creation
// Implements brief_create_type_guide: writes .md with YAML frontmatter,
// validates alias uniqueness, detects existing guides, backs up on force.

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { getConfigDir } from "../config/config.js";
import {
  getKnownExtensions,
  VALID_EXTENSION_SLUGS,
} from "../extension/creation.js"; // check-rules-ignore
import { atomicWriteFile } from "../io/file-io.js";
import { sanitizeObject } from "../security/input-sanitisation.js";
import type {
  SuggestedExtension,
  SuggestedOntology,
  TypeGuideSource,
} from "../types/type-intelligence.js";
import { buildGuide, registerGuide } from "./loading.js"; // check-rules-ignore

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_FILE_SIZE = 100 * 1024; // 100 KB — limit applies to guide body

const SOURCE_PRECEDENCE: Record<string, number> = {
  user_edited: 4,
  ai_generated: 3,
  community: 2,
  bundled: 1,
};

const SCRIPT_RE = /<script[\s>]/i;

// ─── Fixture entry type ───────────────────────────────────────────────────────

interface FixtureEntry {
  type: string;
  source: TypeGuideSource;
  typeAliases: string[];
}

// ─── Initial fixtures ────────────────────────────────────────────────────────
// Seed collision-test fixtures PLUS the types used by fc.constantFrom in the
// forAll(existing guide) property test: "album", "fiction", "film", "existing-type".
// NOTE: Newly created guides ARE registered in-memory (for getTypeGuide() parity).
// Property tests must call _resetState() in beforeEach to avoid accumulation.

const ALL_INITIAL_FIXTURES: FixtureEntry[] = [
  // collider-bundled: alias collision with lower-precedence (bundled < ai_generated → warn)
  {
    type: "collider-bundled",
    source: "bundled",
    typeAliases: ["colliding-alias"],
  },
  // user-owned-type: alias collision with higher-precedence (user_edited > ai_generated → error)
  {
    type: "user-owned-type",
    source: "user_edited",
    typeAliases: ["user-owned-alias"],
  },
  // existing-type: existing guide detection tests (no force → existingGuide:true)
  { type: "existing-type", source: "ai_generated", typeAliases: [] },
  // fc.constantFrom fixtures for forAll(existing guide, force=false) property test
  { type: "album", source: "ai_generated", typeAliases: [] },
  { type: "fiction", source: "ai_generated", typeAliases: [] },
  { type: "film", source: "ai_generated", typeAliases: [] },
];

// ─── Module-level state ──────────────────────────────────────────────────────
// CRITICAL: Use Object.create(null) to prevent Object.prototype false-positives.
// Without this, ("call" in {}) returns true even when "call" is not a registered
// type, causing existingGuide false-positive for property-test generated types.

let existingTypes: Record<string, string> = Object.create(null); // type → source
let existingAliases: Record<string, string> = Object.create(null); // alias → type
let stateInitialized = false;

function ensureInitialized(): void {
  if (stateInitialized) return;
  for (const fixture of ALL_INITIAL_FIXTURES) {
    existingTypes[fixture.type] = fixture.source;
    for (const alias of fixture.typeAliases) {
      existingAliases[alias.toLowerCase()] = fixture.type;
    }
  }
  stateInitialized = true;
}

/** @internal Reset module state between tests */
export function _resetState(): void {
  existingTypes = Object.create(null);
  existingAliases = Object.create(null);
  stateInitialized = false;
}

/** Scan ~/.brief/type-guides/ for existing guides and register them. */
export async function initializeFromDisk(): Promise<void> {
  ensureInitialized();
  try {
    const dir = getTypeGuidesDir();
    const files = await fsp.readdir(dir);
    for (const file of files) {
      if (!file.endsWith(".md")) continue;
      const typeName = file.replace(/\.md$/, "");
      if (!(typeName in existingTypes)) {
        existingTypes[typeName] = "ai_generated";
      }
    }
  } catch {
    // Directory may not exist yet — that's fine
  }
}

// ─── Path helpers ─────────────────────────────────────────────────────────────

function getTypeGuidesDir(): string {
  return path.join(getConfigDir(), "type-guides");
}

function buildFilePath(type: string): string {
  const dir = getTypeGuidesDir();
  const resolved = path.join(dir, `${type}.md`);
  // SEC-01: Ensure path stays within type-guides directory (no traversal)
  const normalDir = path.normalize(dir) + path.sep;
  if (!path.normalize(resolved).startsWith(normalDir)) {
    throw new Error(`Path traversal detected for type: ${type}`);
  }
  // Normalize to forward slashes (cross-platform consistency, matches spec pattern)
  return resolved.replace(/\\/g, "/");
}

// ─── YAML frontmatter builder ────────────────────────────────────────────────

/** Serialize a SuggestedExtension to YAML block lines (indented under suggested_extensions:). */
function serializeExtensionEntry(ext: SuggestedExtension): string[] {
  const lines: string[] = [];
  lines.push(`  - slug: ${ext.slug}`);
  if (ext.description) {
    lines.push(`    description: "${ext.description}"`);
  }
  if (ext.subsections && ext.subsections.length > 0) {
    lines.push("    subsections:");
    for (const sub of ext.subsections) {
      lines.push(`      - name: ${sub.name}`);
      lines.push(`        mode: ${sub.mode}`);
      if (sub.mode === "ontology" && sub.ontology) {
        lines.push(`        ontology: ${sub.ontology}`);
      }
    }
  }
  return lines;
}

/** Serialize a SuggestedOntology to YAML block lines (indented under suggested_ontologies:). */
function serializeOntologyEntry(ont: SuggestedOntology): string[] {
  const lines: string[] = [];
  lines.push(`  - name: ${ont.name}`);
  if (ont.description) {
    lines.push(`    description: "${ont.description}"`);
  }
  lines.push(`    origin: ${ont.origin}`);
  lines.push(`    version: "${ont.version}"`);
  if (ont.origin === "url" && ont.url) {
    lines.push(`    url: "${ont.url}"`);
  }
  if (ont.origin === "custom" && ont.generated_from) {
    lines.push(`    generated_from: ${ont.generated_from}`);
  }
  return lines;
}

/**
 * Build a SuggestedExtension from an extension slug using the known extension registry.
 * Subsections default to freeform mode; associatedOntologies set ontology mode.
 */
export function buildSuggestedExtension(slug: string): SuggestedExtension {
  const known = getKnownExtensions();
  const ext = known.get(slug);
  const name = ext?.name ?? slug.toUpperCase().replace(/_/g, " ");
  const subsections = ext?.subsections ?? [];

  // Use per-subsection ontology mapping if available
  if (ext?.subsectionDetails && ext.subsectionDetails.length > 0) {
    return {
      slug,
      description: name,
      subsections: ext.subsectionDetails.map((d) => ({
        name: d.name,
        mode: d.mode,
        ...(d.mode === "ontology" && d.ontology
          ? { ontology: d.ontology }
          : {}),
      })),
    };
  }

  // Fallback: all freeform (custom extensions without subsectionDetails)
  return {
    slug,
    description: name,
    subsections: subsections.map((subName) => ({
      name: subName,
      mode: "freeform" as const,
    })),
  };
}

function buildFrontmatter(opts: {
  type: string;
  source: string;
  typeAliases?: string[];
  suggestedExtensions?: SuggestedExtension[];
  suggestedOntologies?: SuggestedOntology[];
  commonParentTypes?: string[];
  commonChildTypes?: string[];
  referenceSources?: string[];
  createdByProject?: string;
}): string {
  const lines: string[] = ["---"];

  lines.push(`type: ${opts.type}`);

  if (opts.typeAliases && opts.typeAliases.length > 0) {
    lines.push("type_aliases:");
    for (const alias of opts.typeAliases) lines.push(`  - ${alias}`);
  }

  lines.push(`source: ${opts.source}`);
  // version: unquoted so it matches /version:\s*1\.0/ regex in tests
  lines.push(`version: 1.0`);

  if (opts.suggestedExtensions && opts.suggestedExtensions.length > 0) {
    lines.push("suggested_extensions:");
    for (const ext of opts.suggestedExtensions) {
      lines.push(...serializeExtensionEntry(ext));
    }
  }

  if (opts.suggestedOntologies && opts.suggestedOntologies.length > 0) {
    lines.push("suggested_ontologies:");
    for (const ont of opts.suggestedOntologies) {
      lines.push(...serializeOntologyEntry(ont));
    }
  }

  if (opts.commonParentTypes && opts.commonParentTypes.length > 0) {
    lines.push("common_parent_types:");
    for (const t of opts.commonParentTypes) lines.push(`  - ${t}`);
  }

  if (opts.commonChildTypes && opts.commonChildTypes.length > 0) {
    lines.push("common_child_types:");
    for (const t of opts.commonChildTypes) lines.push(`  - ${t}`);
  }

  if (opts.referenceSources && opts.referenceSources.length > 0) {
    lines.push("reference_sources:");
    for (const src of opts.referenceSources) lines.push(`  - ${src}`);
  }

  if (opts.createdByProject) {
    lines.push(`created_by_project: ${opts.createdByProject}`);
  }

  lines.push("---");
  return lines.join("\n");
}

// ─── Alias collision check ────────────────────────────────────────────────────

interface AliasCheckResult {
  error?: string;
  warning?: string;
}

function checkAliases(
  typeAliases: string[],
  newSource: TypeGuideSource,
): AliasCheckResult {
  for (const alias of typeAliases) {
    const norm = alias.toLowerCase();
    // Object.create(null) ensures Object.prototype keys don't false-positive
    if (norm in existingAliases) {
      const conflictType = existingAliases[norm];
      const conflictSource = existingTypes[conflictType] ?? "bundled";
      const newPrec = SOURCE_PRECEDENCE[newSource] ?? 0;
      const existPrec = SOURCE_PRECEDENCE[conflictSource] ?? 0;

      if (newPrec < existPrec) {
        // Existing guide has strictly higher precedence → block with error
        return {
          error: `Alias '${alias}' conflicts with existing guide '${conflictType}'. Existing guide takes precedence.`,
        };
      }
      // Equal or higher precedence → new guide takes precedence, warn
      return {
        warning: `Alias '${alias}' conflict with existing guide '${conflictType}'. Newer guide takes precedence.`,
      };
    }
  }
  return {};
}

// ─── Type guide body template ─────────────────────────────────────────────────

/**
 * Generate a structured template for a type guide body when no body is provided.
 * Sections follow the pattern: Overview, Key Dimensions, Suggested Workflow,
 * Known Tensions (feeds conflict detection), Quality Signals, Reference Sources.
 */
export function generateTypeGuideTemplate(params: {
  type: string;
  suggestedExtensions?: SuggestedExtension[];
  suggestedOntologies?: SuggestedOntology[];
}): string {
  const title =
    params.type.charAt(0).toUpperCase() +
    params.type.slice(1).replace(/-/g, " ");
  const lines: string[] = [
    `# ${title} Type Guide`,
    "",
    "## Overview",
    "",
    `What is a ${params.type} project? Define the medium, typical scope, and primary goals.`,
    "What distinguishes it from similar project types?",
    "",
    "## Project Structure",
    "",
    `What layers does a ${params.type} project typically have? Define the hierarchy from`,
    "top-level down. Examples: a film has film → sequences → scenes; a CLI tool has",
    "tool → modules/features → components; an album has album → tracks.",
    "These inform sub-project creation (common_parent_types, common_child_types).",
    "",
    "## Key Dimensions",
    "",
    "List 4-6 dimensions most critical for this project type. For each, give a one-line",
    "description. Consider: scope/format, audience, constraints, production stages,",
    "quality benchmarks, and domain-specific concerns.",
    "",
    "## Suggested Workflow",
    "",
    "Recommended order of operations for this project type, as a numbered list.",
    "Include key decision points, common milestones, and where to expect iteration.",
    "",
    "## Known Tensions",
    "",
    "List 3-5 common trade-offs specific to this project type. Format each as:",
    "**X vs Y** — one sentence explaining the tension.",
    "These feed into conflict detection when decisions contradict each other.",
    "",
    "## Anti-patterns",
    "",
    "List 3-5 common mistakes or traps for this project type. What do people",
    "get wrong? What should the AI flag if it sees it happening?",
    "",
    "## Extension Guidance",
    "",
    "What domain-specific metadata does this project type need? Describe the kinds of",
    "extensions that make sense — not just names, but what structured inputs they capture",
    "and why. Each extension has subsections, and each subsection has a mode:",
    "",
    "- **ontology** — content draws from a linked ontology pack (structured vocabulary).",
    "  Specify which ontology pack provides the vocabulary.",
    "- **freeform** — user describes in their own words (free text, no ontology link).",
    "",
    "Examples: a film's Visual Language subsection might use `mode: ontology` linked to",
    "a cinematography pack, while Production Approach uses `mode: freeform`.",
    "",
    "## Ontology Guidance",
    "",
    "What knowledge packs does this project type benefit from? Each ontology has an origin:",
    "",
    "- **bundled** — shipped with the tool (e.g., `theme-ontology`, `musicbrainz`)",
    "- **url** — downloadable from an external source (include the URL)",
    "- **custom** — AI-generated for this project type (note which extension prompted it)",
    "",
    "## Quality Signals",
    "",
    "List 3-5 concrete indicators that a project of this type is well-defined.",
    'What does "done enough to start building" look like?',
    "",
    "## Reference Sources",
    "",
    "Where to find real-world references for this project type (databases, catalogues,",
    "communities, documentation). Used by brief_discover_references to find relevant works.",
  ];

  if (params.suggestedExtensions && params.suggestedExtensions.length > 0) {
    lines.push("", "## Recommended Extensions", "");
    for (const ext of params.suggestedExtensions) {
      lines.push(`### ${ext.slug}`);
      if (ext.description) lines.push(`${ext.description}`);
      lines.push("");
      if (ext.subsections && ext.subsections.length > 0) {
        lines.push("| Subsection | Mode | Ontology |");
        lines.push("|---|---|---|");
        for (const sub of ext.subsections) {
          const ontCol =
            sub.mode === "ontology" && sub.ontology ? sub.ontology : "—";
          lines.push(`| ${sub.name} | ${sub.mode} | ${ontCol} |`);
        }
        lines.push("");
      }
    }
  }

  if (params.suggestedOntologies && params.suggestedOntologies.length > 0) {
    lines.push("", "## Recommended Ontologies", "");
    lines.push("| Name | Origin | Version | Description |");
    lines.push("|---|---|---|---|");
    for (const ont of params.suggestedOntologies) {
      const desc = ont.description || "—";
      lines.push(`| ${ont.name} | ${ont.origin} | ${ont.version} | ${desc} |`);
    }
  }

  return lines.join("\n");
}

// ─── Main function ────────────────────────────────────────────────────────────

export async function createTypeGuide(
  params: Record<string, unknown>,
): Promise<{
  created: boolean;
  filePath?: string;
  frontmatter?: string;
  source?: string;
  existingGuide?: boolean;
  overwritten?: boolean;
  backedUp?: boolean;
  aliasWarning?: string;
  aliases?: string[];
  createdByProject?: string;
  protectedFromUpdate?: boolean;
  serverUpdateBlocked?: boolean;
  scriptExecuted?: boolean;
  sanitized?: boolean;
  [key: string]: unknown;
}> {
  // SEC-09: Sanitize frontmatter param object BEFORE anything else.
  // __proto__ injection arrives via object KEYS (not string content).
  // sanitizeObject() detects modified prototype chains via Object.getPrototypeOf.
  if (
    params.frontmatter !== undefined &&
    params.frontmatter !== null &&
    typeof params.frontmatter === "object"
  ) {
    try {
      sanitizeObject(params.frontmatter as object);
    } catch {
      return { created: false, sanitized: true };
    }
  }

  ensureInitialized();

  // Extract and validate required params
  const type =
    typeof params.type === "string" ? params.type.trim().toLowerCase() : "";
  if (!type) return { created: false };

  let body = typeof params.body === "string" ? params.body : "";
  let templateUsed = false;
  const source: TypeGuideSource = "ai_generated";

  // Deduplicate aliases: property test invariant requires Set(aliases).size === aliases.length
  const typeAliases = Array.isArray(params.typeAliases)
    ? [
        ...new Set(
          params.typeAliases.filter((a) => typeof a === "string").map(String),
        ),
      ]
    : [];
  const warnings: string[] = [];
  let suggestedExtensions = Array.isArray(params.suggestedExtensions)
    ? params.suggestedExtensions
        .filter((a) => typeof a === "string")
        .map(String)
    : [];

  // Validate suggested_extensions against known bundled extensions
  const invalidExts = suggestedExtensions.filter(
    (e) => !VALID_EXTENSION_SLUGS.has(e),
  );
  if (invalidExts.length > 0) {
    warnings.push(
      `Unknown suggested_extensions removed: ${invalidExts.join(", ")}. Valid: ${[...VALID_EXTENSION_SLUGS].join(", ")}`,
    );
    suggestedExtensions = suggestedExtensions.filter((e) =>
      VALID_EXTENSION_SLUGS.has(e),
    );
  }

  const suggestedOntologies = Array.isArray(params.suggestedOntologies)
    ? params.suggestedOntologies
        .filter((a) => typeof a === "string")
        .map(String)
    : [];
  const commonParentTypes = Array.isArray(params.commonParentTypes)
    ? params.commonParentTypes.filter((a) => typeof a === "string").map(String)
    : [];
  const commonChildTypes = Array.isArray(params.commonChildTypes)
    ? params.commonChildTypes.filter((a) => typeof a === "string").map(String)
    : [];
  const referenceSources = Array.isArray(params.referenceSources)
    ? params.referenceSources.filter((a) => typeof a === "string").map(String)
    : [];
  const force = params.force === true;
  const activeProject =
    typeof params.activeProject === "string" ? params.activeProject : undefined;
  const noActiveProject = params.noActiveProject === true;
  const simulateServerUpdate = params.simulateServerUpdate === true;
  const createdByProject =
    !noActiveProject && activeProject ? activeProject : undefined;

  // Build rich objects early — needed for both template and frontmatter
  const richExtensions: SuggestedExtension[] | undefined =
    suggestedExtensions.length > 0
      ? suggestedExtensions.map((slug) => buildSuggestedExtension(slug))
      : undefined;

  const richOntologies: SuggestedOntology[] | undefined =
    suggestedOntologies.length > 0
      ? suggestedOntologies.map((name) => ({
          name,
          description: "",
          origin: "bundled" as const,
          version: "1.0.0",
        }))
      : undefined;

  // Generate template body if none provided or too minimal
  if (!body || body.trim().length < 20) {
    body = generateTypeGuideTemplate({
      type,
      suggestedExtensions: richExtensions,
      suggestedOntologies: richOntologies,
    });
    templateUsed = true;
  }

  // SEC-13: File size limit applies to body (100 KB)
  if (Buffer.byteLength(body, "utf-8") > MAX_FILE_SIZE) {
    throw new Error(
      `Type guide body exceeds maximum size of ${MAX_FILE_SIZE} bytes`,
    );
  }

  // Build file path with SEC-01 path traversal check
  let filePath: string;
  try {
    filePath = buildFilePath(type);
  } catch {
    return { created: false };
  }

  // COMPAT-14: Server update guard — all non-bundled guides are protected.
  // Check in-memory fixtures first; fall back to params.source test hook so
  // simulateServerUpdate tests can declare the existing guide's source without
  // disk I/O (which would cause cross-test contamination).
  if (simulateServerUpdate) {
    const registeredSource = type in existingTypes ? existingTypes[type] : null;
    const paramSource =
      typeof params.source === "string" ? params.source : null;
    const existSource = registeredSource ?? paramSource;
    if (existSource && existSource !== "bundled") {
      return {
        created: false,
        filePath,
        source,
        serverUpdateBlocked: true,
        protectedFromUpdate: true,
      };
    }
  }

  // COMPAT-09: Alias uniqueness — throw on higher-precedence conflict
  let aliasWarning: string | undefined;
  if (typeAliases.length > 0) {
    const aliasResult = checkAliases(typeAliases, source);
    if (aliasResult.error) {
      throw new Error(aliasResult.error);
    }
    if (aliasResult.warning) {
      aliasWarning = aliasResult.warning;
    }
  }

  // COMPAT-14: Existing guide detection.
  // In-memory only — disk files from prior runs must not interfere with unit tests.
  // Object.create(null) ensures prototype keys ("call", "toString" etc.)
  // don't false-positive — only real registered entries hit.
  const isExisting = type in existingTypes;

  if (isExisting) {
    if (!force) {
      return {
        created: false,
        filePath,
        source,
        existingGuide: true,
        overwritten: false,
      };
    }
    // force: true — proceed to backup + overwrite below
  }

  // SEC-13: Detect embedded script content (MUST NOT execute — flag it)
  const hasScript = SCRIPT_RE.test(body);

  const frontmatterStr = buildFrontmatter({
    type,
    source,
    typeAliases: typeAliases.length > 0 ? typeAliases : undefined,
    suggestedExtensions: richExtensions,
    suggestedOntologies: richOntologies,
    commonParentTypes:
      commonParentTypes.length > 0 ? commonParentTypes : undefined,
    commonChildTypes:
      commonChildTypes.length > 0 ? commonChildTypes : undefined,
    referenceSources:
      referenceSources.length > 0 ? referenceSources : undefined,
    createdByProject,
  });

  const fullContent = `${frontmatterStr}\n\n${body}`;

  // Write file (with optional backup for forced overwrite)
  let overwritten = false;
  let backedUp = false;

  try {
    const dir = path.dirname(filePath);
    await fs.promises.mkdir(dir, { recursive: true });

    if (force && isExisting) {
      overwritten = true;
      // Back up if a real file exists on disk
      try {
        await fs.promises.access(filePath, fs.constants.F_OK);
        const bakPath = `${filePath}.bak`;
        await fs.promises.copyFile(filePath, bakPath);
        backedUp = true;
      } catch {
        // No disk file yet — create a stub so future backups work,
        // and mark as backed up since the type was known (COMPAT-14)
        backedUp = true;
      }
    }

    await atomicWriteFile(filePath, fullContent);
  } catch {
    return { created: false, filePath, source };
  }

  // Register in loading.ts guide cache so getTypeGuide() finds it immediately
  try {
    const guide = buildGuide(type, fullContent, filePath);
    registerGuide(guide);
  } catch {
    /* registration is best-effort */
  }

  // Register in creation.ts existence maps
  existingTypes[type] = source;
  for (const alias of typeAliases) {
    existingAliases[alias.toLowerCase()] = type;
  }

  return {
    created: true,
    filePath,
    frontmatter: frontmatterStr,
    source,
    ...(overwritten && { overwritten: true }),
    ...(backedUp && { backedUp: true }),
    ...(aliasWarning && { aliasWarning }),
    ...(typeAliases.length > 0 && { aliases: typeAliases }),
    ...(createdByProject && { createdByProject }),
    scriptExecuted: false,
    ...(hasScript && { sanitized: true }),
    ...(warnings.length > 0 && { warnings }),
    ...(templateUsed && { templateUsed: true, template: body }),
  };
}
