// src/ontology/conversion.ts — Freeform-to-structured section conversion

import {
  linkSectionDataset,
  readBrief,
  readSection,
  writeBrief,
} from "../io/project-state.js"; // check-rules-ignore
import { getPackIndex } from "./management.js";
import { searchOntology } from "./search.js";
import { renderFullTable } from "./table-render.js";

export interface ConvertToStructuredParams {
  projectPath: string;
  section: string;
  ontology: string;
  columns: string[];
  matchThreshold?: number;
}

export interface ConvertToStructuredResult {
  converted: boolean;
  matchedEntries: Array<{
    entryId: string;
    label: string;
    matchScore: number;
  }>;
  unmatchedText: string[];
  tableWritten: boolean;
}

/**
 * Convert a freeform section to structured by matching existing text
 * against ontology entries and rendering matched entries as a visible table.
 * Unmatched text is preserved below the table.
 */
export async function convertToStructured(
  params: ConvertToStructuredParams,
): Promise<ConvertToStructuredResult> {
  const {
    projectPath,
    section,
    ontology,
    columns,
    matchThreshold = 0.5,
  } = params;

  // Validate pack exists
  const packIndex = getPackIndex(ontology);
  if (!packIndex) {
    throw new Error(`Pack '${ontology}' not found`);
  }

  // Read the section content
  const sectionContent = await readSection(projectPath, section);
  if (!sectionContent && sectionContent !== "") {
    throw new Error(`Section '${section}' not found`);
  }

  // Split into meaningful text chunks (non-empty lines, skip comments/markers)
  const lines = sectionContent.split("\n");
  const textChunks = lines.filter(
    (l) =>
      l.trim() &&
      !l.trim().startsWith("<!--") &&
      !l.trim().startsWith("|") &&
      !l.trim().startsWith("*") &&
      !l.trim().startsWith("---"),
  );

  // Search each chunk against the ontology
  const matchedEntries: Array<{
    entryId: string;
    label: string;
    matchScore: number;
    entryData: Record<string, unknown>;
  }> = [];
  const matchedIds = new Set<string>();
  const unmatchedText: string[] = [];

  for (const chunk of textChunks) {
    try {
      const results = await searchOntology({
        query: chunk.trim(),
        ontology,
        maxResults: 1,
      });
      const top = results.results?.[0];
      const topId = top?.id ?? top?.entryId;
      if (
        top &&
        topId &&
        top.score >= matchThreshold &&
        !matchedIds.has(topId)
      ) {
        const entry = packIndex.entries.get(topId);
        if (entry) {
          matchedIds.add(topId);
          matchedEntries.push({
            entryId: topId,
            label: top.label ?? topId,
            matchScore: top.score,
            entryData: entry as Record<string, unknown>,
          });
        }
      } else {
        unmatchedText.push(chunk.trim());
      }
    } catch {
      unmatchedText.push(chunk.trim());
    }
  }

  // Build the table from matched entries
  const entryRecords = matchedEntries.map((m) => m.entryData);
  const table = renderFullTable(entryRecords, columns);

  // Build tag comments for matched entries
  const tagLines = matchedEntries
    .map((m) => `<!-- brief:ontology ${ontology} ${m.entryId} "${m.label}" -->`)
    .join("\n");

  // Compose the new section content
  const parts: string[] = [];
  if (table) parts.push(table);
  if (tagLines) parts.push(tagLines);
  if (unmatchedText.length > 0) {
    parts.push("", ...unmatchedText);
  }
  const newContent = parts.join("\n");

  // Write section-dataset marker and updated content
  let briefContent = await readBrief(projectPath);

  // Find and replace the section content
  const sectionHeadingRe = new RegExp(
    `(## ${section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\n)([\\s\\S]*?)(?=\\n## |\\n# |$)`,
  );
  const sectionMatch = briefContent.match(sectionHeadingRe);
  if (sectionMatch) {
    const colSuffix = columns.length ? ` columns:${columns.join(",")}` : "";
    const marker = `<!-- brief:section-dataset ${ontology}${colSuffix} -->`;
    briefContent = briefContent.replace(
      sectionHeadingRe,
      `$1${marker}\n\n${newContent}\n`,
    );
    await writeBrief(projectPath, briefContent);
  } else {
    // Section not found — link and write at end
    await linkSectionDataset(projectPath, section, ontology, columns);
  }

  return {
    converted: true,
    matchedEntries: matchedEntries.map((m) => ({
      entryId: m.entryId,
      label: m.label,
      matchScore: m.matchScore,
    })),
    unmatchedText,
    tableWritten: matchedEntries.length > 0,
  };
}
