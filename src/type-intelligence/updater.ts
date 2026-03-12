// src/type-intelligence/updater.ts — Living Type Guides
// Auto-updates type guide suggested_extensions and suggested_ontologies
// when projects of that type evolve. Forks bundled/community guides
// as user_edited copies rather than modifying originals.

import path from "node:path";
import { getConfigDir } from "../config/config.js";
import { acquireLock, atomicWriteFile } from "../io/file-io.js";
import { readBriefMetadata } from "../io/project-state.js";
import type {
  SuggestedExtension,
  SuggestedOntology,
} from "../types/type-intelligence.js";
import { buildSuggestedExtension } from "./creation.js"; // check-rules-ignore
import { buildGuide, getTypeGuide, registerGuide } from "./loading.js"; // check-rules-ignore

// ─── YAML Frontmatter Rewriting ──────────────────────────────────────────────

/**
 * Rewrite a scalar field in YAML frontmatter.
 * E.g., change `source: bundled` → `source: user_edited`.
 */
function rewriteFrontmatterField(
  content: string,
  key: string,
  newValue: string,
): string {
  const re = new RegExp(`^(${key}:\\s*).*$`, "m");
  if (re.test(content)) {
    return content.replace(re, `$1${newValue}`);
  }
  // Key not found — insert before closing ---
  return content.replace(/^---\s*$/m, `${key}: ${newValue}\n---`);
}

/**
 * Serialize a SuggestedExtension to YAML lines.
 */
function serializeExtension(ext: SuggestedExtension): string {
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
  return lines.join("\n");
}

/**
 * Serialize a SuggestedOntology to YAML lines.
 */
function serializeOntology(ont: SuggestedOntology): string {
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
  return lines.join("\n");
}

/**
 * Rewrite the entire suggested_extensions or suggested_ontologies block
 * in YAML frontmatter. Handles both replacement and insertion.
 */
function rewriteFrontmatterBlock(
  content: string,
  key: string,
  serializedEntries: string[],
): string {
  const lines = content.split("\n");
  const result: string[] = [];
  let i = 0;
  let replaced = false;
  let insideFrontmatter = false;
  let closingDashIdx = -1;

  // Find frontmatter boundaries
  if (lines[0]?.trim() === "---") {
    insideFrontmatter = true;
    for (let j = 1; j < lines.length; j++) {
      if (lines[j].trim() === "---") {
        closingDashIdx = j;
        break;
      }
    }
  }

  if (!insideFrontmatter || closingDashIdx === -1) return content;

  while (i < lines.length) {
    const trimmed = lines[i].trim();

    // Check if this line starts our target key block
    if (i > 0 && i < closingDashIdx && trimmed === `${key}:`) {
      // Skip the old block (key line + all indented/item lines)
      i++;
      while (i < closingDashIdx) {
        const nextTrimmed = lines[i].trim();
        if (
          !nextTrimmed ||
          nextTrimmed.startsWith("- ") ||
          lines[i].startsWith("  ")
        ) {
          i++;
        } else {
          break;
        }
      }
      // Write new block if entries exist
      if (serializedEntries.length > 0) {
        result.push(`${key}:`);
        result.push(...serializedEntries);
      }
      replaced = true;
      continue;
    }

    // Insert before closing --- if key was not found
    if (i === closingDashIdx && !replaced && serializedEntries.length > 0) {
      result.push(`${key}:`);
      result.push(...serializedEntries);
    }

    result.push(lines[i]);
    i++;
  }

  return result.join("\n");
}

// ─── Fork Logic ──────────────────────────────────────────────────────────────

/**
 * Fork a bundled/community guide to a user_edited copy in ~/.brief/type-guides/.
 * Returns the file path of the forked guide.
 */
async function forkGuide(guideContent: string, type: string): Promise<string> {
  const forkedContent = rewriteFrontmatterField(
    guideContent,
    "source",
    "user_edited",
  );

  const configDir = getConfigDir();
  const forkedPath = path.join(configDir, "type-guides", `${type}.md`);

  await atomicWriteFile(forkedPath, forkedContent);

  // Re-register — user_edited (4) wins over bundled (1) / community (2)
  const guide = buildGuide(type, forkedContent, forkedPath);
  registerGuide(guide);

  return forkedPath;
}

// ─── Main Function ───────────────────────────────────────────────────────────

/**
 * Update a type guide's suggested_extensions or suggested_ontologies
 * when a project of that type changes. Best-effort — call sites should
 * wrap in try/catch.
 *
 * Fork behaviour: if the guide is bundled/community or at a fixture path,
 * it's forked as a user_edited copy before modification.
 */
export async function updateTypeGuideSuggestions(options: {
  projectPath: string;
  action: "add_extension" | "remove_extension" | "add_ontology";
  value: string; // extension slug or ontology pack name
  ontologyMeta?: {
    description?: string;
    origin?: "bundled" | "url" | "custom";
    version?: string;
    url?: string;
    generated_from?: string;
  };
}): Promise<void> {
  const { projectPath, action, value } = options;

  // 1. Read project type
  const meta = await readBriefMetadata(projectPath);
  if (!meta.type) return;

  // 2. Load type guide
  const result = await getTypeGuide({ type: meta.type });
  if (result.isGeneric) return;

  const guide = result.guide;
  const source = guide.metadata.source;

  // 3. Determine if we need to fork
  const needsFork =
    source === "bundled" ||
    source === "community" ||
    guide.path.startsWith("<builtin>") ||
    guide.path.startsWith("<injected>");

  // 4. Get current guide content and path
  let guideContent = guide.content;
  let guidePath = guide.path;

  // Acquire lock on the guide file
  const lockPath = needsFork
    ? path.join(getConfigDir(), "type-guides", `${guide.metadata.type}.md`)
    : guidePath;
  const release = await acquireLock(lockPath);

  try {
    // 5. Fork if needed
    if (needsFork) {
      guidePath = await forkGuide(guideContent, guide.metadata.type);
      guideContent = rewriteFrontmatterField(
        guideContent,
        "source",
        "user_edited",
      );
    }

    // 6. Compute new arrays
    const currentExtensions = guide.metadata.suggestedExtensions ?? [];
    const currentOntologies = guide.metadata.suggestedOntologies ?? [];

    let newContent = guideContent;

    if (action === "add_extension") {
      // Check if already present
      if (currentExtensions.some((e) => e.slug === value)) return;

      const newExt = buildSuggestedExtension(value);
      const allExtensions = [...currentExtensions, newExt];
      const serialized = allExtensions.map((e) => serializeExtension(e));
      newContent = rewriteFrontmatterBlock(
        newContent,
        "suggested_extensions",
        serialized,
      );
    } else if (action === "remove_extension") {
      const filtered = currentExtensions.filter((e) => e.slug !== value);
      if (filtered.length === currentExtensions.length) return; // not found
      const serialized = filtered.map((e) => serializeExtension(e));
      newContent = rewriteFrontmatterBlock(
        newContent,
        "suggested_extensions",
        serialized,
      );
    } else if (action === "add_ontology") {
      // Check if already present
      if (currentOntologies.some((o) => o.name === value)) return;

      const newOnt: SuggestedOntology = {
        name: value,
        description: options.ontologyMeta?.description ?? "",
        origin: options.ontologyMeta?.origin ?? "bundled",
        version: options.ontologyMeta?.version ?? "1.0.0",
        ...(options.ontologyMeta?.url ? { url: options.ontologyMeta.url } : {}),
        ...(options.ontologyMeta?.generated_from
          ? { generated_from: options.ontologyMeta.generated_from }
          : {}),
      };
      const allOntologies = [...currentOntologies, newOnt];
      const serialized = allOntologies.map((o) => serializeOntology(o));
      newContent = rewriteFrontmatterBlock(
        newContent,
        "suggested_ontologies",
        serialized,
      );
    }

    // 7. Write updated content to disk
    if (newContent !== guideContent) {
      await atomicWriteFile(guidePath, newContent);

      // 8. Re-register guide in memory
      const updated = buildGuide(guide.metadata.type, newContent, guidePath);
      registerGuide(updated);
    }
  } finally {
    release();
  }
}
