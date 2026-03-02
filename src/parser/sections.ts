// src/parser/sections.ts — stub for TASK-10
// Replace with real implementation during build loop.

import type { Section } from "../types/parser.js";

export function extractSections(
  _bodyContent: string,
  _config?: { sectionAliases?: Record<string, string[]> },
): Section[] {
  throw new Error("Not implemented: extractSections");
}

export function resolveHeadingToCanonical(
  _heading: string,
  _config?: { sectionAliases?: Record<string, string[]> },
): string | null {
  throw new Error("Not implemented: resolveHeadingToCanonical");
}

export function classifySection(
  _heading: string,
  _canonicalName: string | null,
): import("../types/parser.js").SectionClassification {
  throw new Error("Not implemented: classifySection");
}

export function detectCodeBlockRanges(
  _content: string,
): Array<[number, number]> {
  throw new Error("Not implemented: detectCodeBlockRanges");
}
