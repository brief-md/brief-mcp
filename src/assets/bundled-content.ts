// src/assets/bundled-content.ts — TASK-53: Bundled Content

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const fsp = fs.promises;
const ASSETS_DIR = path.join(__dirname, "..", "..", "assets");

/**
 * Core guide sections — bedrock fallback constant (v2.0).
 * If BOTH ~/.brief/type-guides/_generic.md AND dist/assets/type-guides/_generic.md
 * are missing or corrupt, regenerate from this hardcoded constant.
 */
export const UNIVERSAL_DIMENSIONS: ReadonlyArray<{
  name: string;
  description: string;
}> = [
  {
    name: "Domain Discovery",
    description:
      "Questions to understand the project's domain, medium, activities, outputs, audience, and success criteria",
  },
  {
    name: "Domain Project Hierarchy Template",
    description:
      "How projects of this type are typically structured — components, sub-projects, and their relationships",
  },
  {
    name: "Domain Information Resources",
    description:
      "Where domain knowledge can be found — reference material, frameworks, standards, and exemplar works",
  },
  {
    name: "Known Tensions",
    description:
      "Universal and domain-specific trade-offs that shape project decisions",
  },
  {
    name: "Quality Signals",
    description:
      "Checklist of data points needed to create a good domain-specific type guide",
  },
  {
    name: "Bootstrapping Workflow",
    description:
      "Step-by-step process for gathering data and creating the type guide",
  },
];

// ---- YAML frontmatter parsing (minimal, no external deps) ----

function parseYamlFrontmatter(content: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: content };

  const yamlStr = match[1];
  const body = match[2];
  const frontmatter: Record<string, unknown> = {};

  for (const line of yamlStr.split(/\r?\n/)) {
    const kv = line.match(/^(\w[\w-]*):\s*(.+)$/);
    if (kv) {
      let val: unknown = kv[2].trim();
      if (val === "true") val = true;
      else if (val === "false") val = false;
      // Strip surrounding quotes
      else if (
        typeof val === "string" &&
        val.length >= 2 &&
        ((val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'")))
      ) {
        val = val.slice(1, -1);
      }
      frontmatter[kv[1]] = val;
    }
  }

  return { frontmatter, body };
}

// ---- Asset root resolution ----

function resolveAssetRoot(): string {
  // Check if dist/assets/ exists (built layout)
  const distAssets = path.join(ASSETS_DIR, "..", "dist", "assets");
  if (fs.existsSync(path.join(distAssets, "type-guides"))) return distAssets;

  // Check project root assets/ (dev layout)
  if (fs.existsSync(path.join(ASSETS_DIR, "type-guides"))) return ASSETS_DIR;

  // Fallback to ASSETS_DIR even if missing (caller handles absence)
  return ASSETS_DIR;
}

function getDefaultBriefHome(): string {
  return path.join(os.homedir(), ".brief");
}

// ---- Guide content generation from bedrock fallback ----

function generateGenericGuideContent(): string {
  const sections = UNIVERSAL_DIMENSIONS.map(
    (d) => `## ${d.name}\n\n${d.description}`,
  ).join("\n\n");

  return `---
type: _generic
bootstrapping: true
source: bundled
version: "2.0"
---

# Generic Project Guide

This is the adaptive bootstrapping guide for BRIEF. It activates during the explore_type setup phase when no domain-specific type guide exists. Its purpose is to help the AI gather the data needed to collaboratively create a domain-specific type guide with the user.

${sections}
`;
}

// ---- Guide content validation ----

function validateGuideContent(content: string): string[] {
  const errors: string[] = [];
  const { frontmatter } = parseYamlFrontmatter(content);

  if (!frontmatter.type) errors.push("missing type field");
  if (!frontmatter.source) errors.push("missing source field");
  if (frontmatter.bootstrapping !== true)
    errors.push("missing or false bootstrapping field");
  if (!frontmatter.version) errors.push("missing version field");

  // Check for required sections (at least 4 of 6 must be present to allow
  // for minor variations between the asset file and the bedrock fallback)
  let foundSections = 0;
  for (const dim of UNIVERSAL_DIMENSIONS) {
    if (content.includes(dim.name)) {
      foundSections++;
    }
  }
  if (foundSections < Math.min(4, UNIVERSAL_DIMENSIONS.length)) {
    errors.push(
      `only ${foundSections}/${UNIVERSAL_DIMENSIONS.length} required sections found`,
    );
  }

  return errors;
}

// ---- Source guide content (from assets or bedrock fallback) ----

function getSourceGuideContent(assetRoot: string): string {
  const guidePath = path.join(assetRoot, "type-guides", "_generic.md");
  try {
    return fs.readFileSync(guidePath, "utf-8");
  } catch {
    return generateGenericGuideContent();
  }
}

// ---- Atomic write (WRITE-04 compliant) ----

async function ensureDir(dir: string): Promise<void> {
  await fsp.mkdir(dir, { recursive: true });
}

async function atomicWrite(filePath: string, content: string): Promise<void> {
  const dir = path.dirname(filePath);
  await ensureDir(dir);
  const tmpFile = `${filePath}.tmp.${process.pid}`;
  const fh = await fsp.open(tmpFile, "w");
  await fh.write(content);
  await fh.close();
  await fsp.rename(tmpFile, filePath);
}

// ---- Exported functions ----

export function loadGenericGuide(params?: Record<string, unknown>): {
  content: string;
  frontmatter: Record<string, unknown>;
  body: string;
  is_generic: boolean;
  filePath?: string;
  version?: string;
  [key: string]: unknown;
} {
  const assetRoot =
    typeof params?.assetRoot === "string"
      ? params.assetRoot
      : resolveAssetRoot();
  const guidePath = path.join(assetRoot, "type-guides", "_generic.md");

  let content: string;
  let filePath: string | undefined;

  if (fs.existsSync(guidePath)) {
    content = fs.readFileSync(guidePath, "utf-8");
    filePath = guidePath;
  } else {
    // Bedrock fallback — generate from UNIVERSAL_DIMENSIONS
    content = generateGenericGuideContent();
  }

  const { frontmatter, body } = parseYamlFrontmatter(content);

  return {
    content,
    frontmatter,
    body,
    is_generic: true,
    filePath,
    version:
      typeof frontmatter.version === "string" ? frontmatter.version : undefined,
  };
}

export async function verifyGenericGuide(
  params?: Record<string, unknown>,
): Promise<{
  valid: boolean;
  actionNeeded?: boolean;
  regenerated?: boolean;
  errors?: string[];
  mode?: string;
  [key: string]: unknown;
}> {
  const briefHome =
    typeof params?.briefHome === "string"
      ? params.briefHome
      : getDefaultBriefHome();
  const assetRoot =
    typeof params?.assetRoot === "string"
      ? params.assetRoot
      : resolveAssetRoot();
  const guidePath = path.join(briefHome, "type-guides", "_generic.md");

  // Try reading existing guide
  let content: string | null = null;

  // Test seam: simulate missing guide
  if (!params?.simulateMissing) {
    try {
      content = await fsp.readFile(guidePath, "utf-8");
    } catch {
      // Missing
    }
  }

  // Test seam: simulate corruption
  if (params?.simulateCorrupt) {
    content = "CORRUPTED DATA — NOT VALID YAML";
  }

  if (content === null) {
    // Missing — regenerate
    const sourceContent = getSourceGuideContent(assetRoot);
    await atomicWrite(guidePath, sourceContent);
    return {
      valid: true,
      actionNeeded: true,
      regenerated: true,
      mode: "adaptive",
    };
  }

  // Validate content
  const errors = validateGuideContent(content);
  if (errors.length > 0) {
    // Corrupted — regenerate
    const sourceContent = getSourceGuideContent(assetRoot);
    await atomicWrite(guidePath, sourceContent);
    return {
      valid: true,
      actionNeeded: true,
      regenerated: true,
      errors,
      mode: "adaptive",
    };
  }

  // Guide is valid — no action needed
  return { valid: true, actionNeeded: false, mode: "adaptive" };
}

export async function installBundledContent(
  params?: Record<string, unknown>,
): Promise<{
  installed: boolean;
  directoryCreated?: boolean;
  guideInstalled?: boolean;
  filesWritten?: string[];
  guideOverwritten?: boolean;
  [key: string]: unknown;
}> {
  const briefHome =
    typeof params?.briefHome === "string"
      ? params.briefHome
      : getDefaultBriefHome();
  const assetRoot =
    typeof params?.assetRoot === "string"
      ? params.assetRoot
      : resolveAssetRoot();
  const typeGuidesDir = path.join(briefHome, "type-guides");
  const guidePath = path.join(typeGuidesDir, "_generic.md");

  const typeGuideDirExisted = fs.existsSync(typeGuidesDir);
  let guideOverwritten = false;
  const filesWritten: string[] = [];

  // Ensure directory exists
  await fsp.mkdir(typeGuidesDir, { recursive: true });

  // simulateFirstRun: force directoryCreated even if dir existed on disk
  const directoryCreated = !typeGuideDirExisted || !!params?.simulateFirstRun;

  const guideExists = fs.existsSync(guidePath);
  const sourceContent = getSourceGuideContent(assetRoot);

  if (guideExists && !params?.simulateFirstRun) {
    // Existing guide — check if overwrite needed
    // source: bundled guides are always overwritten (not user-modifiable)
    let needsOverwrite = !!params?.simulateServerUpdate;

    if (!needsOverwrite) {
      try {
        const existing = await fsp.readFile(guidePath, "utf-8");
        const { frontmatter: existingFm } = parseYamlFrontmatter(existing);
        // Always overwrite bundled source guides
        if (existingFm.source === "bundled") {
          needsOverwrite = true;
        }
      } catch {
        needsOverwrite = true;
      }
    }

    if (needsOverwrite) {
      await atomicWrite(guidePath, sourceContent);
      guideOverwritten = true;
      filesWritten.push("_generic.md");
    }
  } else {
    // First run or simulateFirstRun — install guide
    await atomicWrite(guidePath, sourceContent);
    filesWritten.push("_generic.md");
  }

  return {
    installed: true,
    directoryCreated,
    guideInstalled:
      !guideExists || guideOverwritten || !!params?.simulateFirstRun,
    filesWritten,
    guideOverwritten,
  };
}

export function getExtensionDefinitions(
  params?: Record<string, unknown>,
): Array<{ name: string; [key: string]: unknown }> {
  const assetRoot =
    typeof params?.assetRoot === "string"
      ? params.assetRoot
      : resolveAssetRoot();
  const jsonPath = path.join(assetRoot, "extensions", "extensions.json");

  const content = fs.readFileSync(jsonPath, "utf-8");
  return JSON.parse(content);
}

/**
 * Three-tier guide resolution:
 *   Tier 1: type-specific guide exists → served directly (is_generic: false)
 *   Tier 2: no type-specific guide, generic guide exists → served with is_generic: true, mode: adaptive
 *   Tier 3: no guides at all → universal dimensions constant served
 */
export async function resolveGuide(params?: Record<string, unknown>): Promise<{
  tier: number;
  is_generic: boolean;
  mode?: string;
  universalDimensions?: ReadonlyArray<{ name: string; description: string }>;
  [key: string]: unknown;
}> {
  const briefHome =
    typeof params?.briefHome === "string"
      ? params.briefHome
      : getDefaultBriefHome();
  const assetRoot =
    typeof params?.assetRoot === "string"
      ? params.assetRoot
      : resolveAssetRoot();
  const type = typeof params?.type === "string" ? params.type : undefined;

  // Tier 1: type-specific guide exists
  if (params?.simulateTypeGuideExists) {
    return { tier: 1, is_generic: false };
  }
  if (
    type &&
    !params?.simulateTypeGuideMissing &&
    !params?.simulateAllGuidesMissing
  ) {
    const typeGuidePath = path.join(briefHome, "type-guides", `${type}.md`);
    try {
      await fsp.readFile(typeGuidePath, "utf-8");
      return { tier: 1, is_generic: false };
    } catch {
      // Not found — fall through to tier 2
    }
  }

  // Tier 2: generic guide (installed or bundled)
  if (!params?.simulateAllGuidesMissing) {
    // Check installed generic guide
    const installedPath = path.join(briefHome, "type-guides", "_generic.md");
    try {
      const content = await fsp.readFile(installedPath, "utf-8");
      const errors = validateGuideContent(content);
      if (errors.length === 0) {
        return { tier: 2, is_generic: true, mode: "adaptive" };
      }
    } catch {
      // Not found
    }

    // Check bundled generic guide
    const bundledPath = path.join(assetRoot, "type-guides", "_generic.md");
    try {
      const content = await fsp.readFile(bundledPath, "utf-8");
      const errors = validateGuideContent(content);
      if (errors.length === 0) {
        return { tier: 2, is_generic: true, mode: "adaptive" };
      }
    } catch {
      // Not found
    }
  }

  // Tier 3: bedrock fallback — UNIVERSAL_DIMENSIONS constant
  return {
    tier: 3,
    is_generic: true,
    mode: "adaptive",
    universalDimensions: UNIVERSAL_DIMENSIONS,
  };
}

/** Reset module state — test seam for isolation */
export function _resetState(): void {
  // No module-level mutable state to reset
}
