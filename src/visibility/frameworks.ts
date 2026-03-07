// src/visibility/frameworks.ts — stub for TASK-44

import type {
  OntologyRemovalResult,
  ProjectFrameworks,
} from "../types/visibility.js";

export async function getProjectFrameworks(_params: {
  project: string;
}): Promise<ProjectFrameworks> {
  throw new Error("Not implemented");
}

export async function detectOrphanedTags(_params: {
  content: string;
}): Promise<{
  orphanedTags: string[];
}> {
  throw new Error("Not implemented");
}

export async function removeOntology(_params: {
  ontology: string;
  removeTags?: boolean;
  noActiveProject?: boolean;
}): Promise<OntologyRemovalResult> {
  throw new Error("Not implemented");
}
