// src/io/project-state.ts — Central BRIEF.md read/write manager
// Wraps writer/core.ts and file-io.ts into project-level operations.

import * as fsp from "node:fs/promises";
import path from "node:path";
import {
  createNewFile,
  readBriefSection,
  writeBriefSection,
} from "../writer/core.js"; // check-rules-ignore
import { syncUpdatedTimestamp } from "../writer/metadata-sync.js"; // check-rules-ignore
import { atomicWriteFile, readFileSafe } from "./file-io.js";

// ── Constants ────────────────────────────────────────────────────────────────

const BRIEF_FILENAME = "BRIEF.md";

// ── Helpers ──────────────────────────────────────────────────────────────────

function briefPath(projectPath: string): string {
  return path.join(projectPath, BRIEF_FILENAME);
}

// ── Metadata parsing ─────────────────────────────────────────────────────────

export interface BriefMetadata {
  project: string;
  type: string;
  status: string;
  created: string;
  updated: string;
  extensions: string[];
  ontologies: string[]; // backward compat — empty for new files
  version: number;
  [key: string]: unknown;
}

/** Parse **Key:** Value metadata lines from BRIEF.md content. */
export function parseMetadata(content: string): BriefMetadata {
  const meta: Record<string, string> = {};
  // Bold format: **Key:** value  OR  **Key**: value
  const boldRegex = /^\*\*(\w[\w\s]*):\*\*\s*(.*)$/gm;
  // Plain text format: Key: value (for lenient/non-canonical files)
  const plainRegex = /^(\w[\w\s]*):\s+(.+)$/gm;

  let match = boldRegex.exec(content);
  while (match !== null) {
    const key = match[1].trim().toLowerCase();
    meta[key] = match[2].trim();
    match = boldRegex.exec(content);
  }

  // Fall back to plain text format for fields not already found
  match = plainRegex.exec(content);
  while (match !== null) {
    const key = match[1].trim().toLowerCase();
    if (!(key in meta)) {
      meta[key] = match[2].trim();
    }
    match = plainRegex.exec(content);
  }

  const parseList = (val: string | undefined): string[] => {
    if (!val) return [];
    return val
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  };

  return {
    project: meta.project ?? "",
    type: meta.type ?? "",
    status: meta.status ?? "active",
    created: meta.created ?? "",
    updated: meta.updated ?? "",
    extensions: parseList(meta.extensions),
    ontologies: parseList(meta.ontologies),
    version: Number.parseInt(meta.version ?? "1", 10) || 1,
  };
}

// ── Project-level operations ─────────────────────────────────────────────────

/** Check whether a BRIEF.md exists at the given project path. */
export async function projectExists(projectPath: string): Promise<boolean> {
  try {
    await fsp.stat(briefPath(projectPath));
    return true;
  } catch {
    return false;
  }
}

/** Create the project directory if it doesn't exist. */
export async function ensureProjectDir(projectPath: string): Promise<void> {
  await fsp.mkdir(projectPath, { recursive: true });
}

/** Read the raw content of a project's BRIEF.md. */
export async function readBrief(projectPath: string): Promise<string> {
  return readFileSafe(briefPath(projectPath));
}

/** Read and parse a project's BRIEF.md metadata. */
export async function readBriefMetadata(
  projectPath: string,
): Promise<BriefMetadata> {
  const content = await readBrief(projectPath);
  return parseMetadata(content);
}

/** Write raw content to a project's BRIEF.md atomically.
 *  Auto-updates the **Updated:** timestamp on every write. */
export async function writeBrief(
  projectPath: string,
  content: string,
): Promise<void> {
  await ensureProjectDir(projectPath);
  const updated = syncUpdatedTimestamp(content);
  await atomicWriteFile(briefPath(projectPath), updated);
}

/** Link an ontology dataset to a section via an HTML comment marker (WP7/GAP-G).
 *  Idempotent: replaces existing link if present, inserts if not.
 *  Optional `columns` array specifies which ontology fields to display as table columns. */
export async function linkSectionDataset(
  projectPath: string,
  section: string,
  ontologyName: string,
  columns?: string[],
): Promise<void> {
  let content = await readBrief(projectPath);
  const colSuffix = columns?.length ? ` columns:${columns.join(",")}` : "";
  const marker = `<!-- brief:section-dataset ${ontologyName}${colSuffix} -->`;
  const oldMarkerRe = new RegExp(
    `(## ${section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\n)(?:<!-- brief:section-dataset [^>]*-->\\s*\\n)?`,
  );

  if (oldMarkerRe.test(content)) {
    content = content.replace(oldMarkerRe, `$1${marker}\n`);
  } else {
    // Section heading not found — append at end
    content = `${content.trimEnd()}\n\n## ${section}\n${marker}\n`;
  }

  await writeBrief(projectPath, content);
}

/** Parse section-dataset comments from BRIEF.md content (WP7/GAP-G). */
export function parseSectionDatasets(
  content: string,
): Array<{ section: string; ontologyName: string; columns?: string[] }> {
  const results: Array<{
    section: string;
    ontologyName: string;
    columns?: string[];
  }> = [];
  const lines = content.split("\n");
  let currentSection = "";

  for (const line of lines) {
    const headingMatch = line.match(/^## (.+)$/);
    if (headingMatch) {
      currentSection = headingMatch[1].trim();
      continue;
    }
    const datasetMatch = line.match(
      /<!-- brief:section-dataset (.+?)(?:\s+columns:([^\s]+))? -->/,
    );
    if (datasetMatch && currentSection) {
      results.push({
        section: currentSection,
        ontologyName: datasetMatch[1],
        columns: datasetMatch[2]?.split(","),
      });
    }
  }
  return results;
}

/** Create a new BRIEF.md for a project and write it to disk. */
export async function createProject(params: {
  projectPath: string;
  project: string;
  type: string;
  sectionContent?: Record<string, string>;
}): Promise<string> {
  const content = await createNewFile({
    project: params.project,
    type: params.type,
    sectionContent: params.sectionContent,
  });
  await writeBrief(params.projectPath, content);
  return content;
}

/** Read a specific section from a project's BRIEF.md. */
export async function readSection(
  projectPath: string,
  sectionName: string,
): Promise<string> {
  const { content } = await readBriefSection(
    briefPath(projectPath),
    sectionName,
  );
  return content;
}

/** Write a specific section to a project's BRIEF.md. */
export async function writeSection(
  projectPath: string,
  sectionName: string,
  content: string,
): Promise<boolean> {
  const result = await writeBriefSection(
    briefPath(projectPath),
    sectionName,
    content,
  );
  return result.success;
}

/** Append a line to a section, creating it if needed. */
export async function appendToSection(
  projectPath: string,
  sectionName: string,
  line: string,
): Promise<boolean> {
  const existing = await readSection(projectPath, sectionName);
  const updated = existing ? `${existing}\n${line}` : line;
  return writeSection(projectPath, sectionName, updated);
}

/** Get the resolved path to BRIEF.md for a project. */
export function getBriefPath(projectPath: string): string {
  return briefPath(projectPath);
}
