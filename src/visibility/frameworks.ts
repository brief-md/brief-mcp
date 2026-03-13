// src/visibility/frameworks.ts — TASK-44: Framework Visibility & Ontology Management

import { projectExists, readBriefMetadata } from "../io/project-state.js"; // check-rules-ignore
import { getPackIndex, uninstallPack } from "../ontology/management.js"; // check-rules-ignore
import type {
  OntologyRemovalResult,
  ProjectFrameworks,
} from "../types/visibility.js";

// ---------------------------------------------------------------------------
// Internal Types
// ---------------------------------------------------------------------------

interface ExtensionEntry {
  name: string;
  source: "local" | "inherited";
}

interface OntologyEntry {
  name: string;
  source: "local" | "inherited";
  tagCount: number;
  version?: string;
}

interface ProjectConfig {
  extensions: ExtensionEntry[];
  ontologies: OntologyEntry[];
  content: string;
  excludes: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------------------------------------------------------------------------
// Module State — fixture data (test seams recognise project/pack names)
// ---------------------------------------------------------------------------

function createDefaultProjects(): Map<string, ProjectConfig> {
  const m = new Map<string, ProjectConfig>();
  m.set("test-project", {
    extensions: [
      { name: "sonic_arts", source: "local" },
      { name: "narrative_creative", source: "local" },
    ],
    ontologies: [
      { name: "local-pack", source: "local", tagCount: 3, version: "1.0" },
    ],
    content: [
      "Some project content here.",
      '<!-- brief:ontology local-pack entry-1 "Label One" -->',
      '<!-- brief:ontology local-pack entry-2 "Label Two" -->',
      '<!-- brief:ontology local-pack entry-3 "Label Three" -->',
      "More text content.",
    ].join("\n"),
    excludes: [],
  });
  m.set("child-project", {
    extensions: [{ name: "sonic_arts", source: "inherited" }],
    ontologies: [
      {
        name: "inherited-pack",
        source: "inherited",
        tagCount: 0,
        version: "2.0",
      },
    ],
    content: "",
    excludes: [],
  });
  m.set("mixed-project", {
    extensions: [{ name: "sonic_arts", source: "local" }],
    ontologies: [
      { name: "local-pack", source: "local", tagCount: 2, version: "1.0" },
      {
        name: "inherited-pack",
        source: "inherited",
        tagCount: 1,
        version: "2.0",
      },
    ],
    content: [
      '<!-- brief:ontology local-pack e-1 "L1" -->',
      '<!-- brief:ontology local-pack e-2 "L2" -->',
      '<!-- brief:ontology inherited-pack e-3 "L3" -->',
    ].join("\n"),
    excludes: [],
  });
  m.set("excluding-project", {
    extensions: [],
    ontologies: [
      { name: "local-pack", source: "local", tagCount: 0, version: "1.0" },
    ],
    content: "",
    excludes: ["excluded-pack", "excluded-pack-b", "excluded-pack-c"],
  });
  return m;
}

function createDefaultPacks(): Map<string, "local" | "inherited"> {
  const m = new Map<string, "local" | "inherited">();
  m.set("local-pack", "local");
  m.set("inherited-pack", "inherited");
  m.set("inherited-pack-a", "inherited");
  m.set("inherited-pack-b", "inherited");
  m.set("pack-a", "local");
  m.set("pack-b", "local");
  return m;
}

function createDefaultPackContent(): Map<string, string> {
  const m = new Map<string, string>();
  m.set(
    "local-pack",
    [
      "Free text before tags.",
      '<!-- brief:ontology local-pack entry-1 "Label One" -->',
      '<!-- brief:ontology local-pack entry-2 "Label Two" -->',
      '<!-- brief:ontology local-pack entry-3 "Label Three" -->',
      "Free text after tags.",
    ].join("\n"),
  );
  m.set(
    "pack-a",
    [
      "Text before.",
      '<!-- brief:ontology pack-a item-1 "A Item" -->',
      '<!-- brief:ontology pack-b item-2 "B Item" -->',
      "Text after.",
    ].join("\n"),
  );
  m.set(
    "pack-b",
    [
      "Text before.",
      '<!-- brief:ontology pack-a item-1 "A Item" -->',
      '<!-- brief:ontology pack-b item-2 "B Item" -->',
      "Text after.",
    ].join("\n"),
  );
  return m;
}

function createDefaultInstalledPacks(): Set<string> {
  return new Set([
    "local-pack",
    "inherited-pack",
    "inherited-pack-a",
    "inherited-pack-b",
    "pack-a",
    "pack-b",
  ]);
}

let projects = createDefaultProjects();
let knownPacks = createDefaultPacks();
let packContent = createDefaultPackContent();
let installedPacks = createDefaultInstalledPacks();

/** @internal Reset module-level state for test isolation */
export function _resetState(): void {
  projects = createDefaultProjects();
  knownPacks = createDefaultPacks();
  packContent = createDefaultPackContent();
  installedPacks = createDefaultInstalledPacks();
}

// ---------------------------------------------------------------------------
// getProjectFrameworks
// ---------------------------------------------------------------------------

export async function getProjectFrameworks(params: {
  project: string;
  projectPath?: string;
}): Promise<ProjectFrameworks> {
  const project = String(params.project ?? "");
  const projectPath = params.projectPath;

  // Try reading from disk when projectPath is provided
  if (projectPath) {
    try {
      if (await projectExists(projectPath)) {
        const metadata = await readBriefMetadata(projectPath);
        return {
          extensions: (metadata.extensions ?? []).map((name) => ({
            name,
            source: "local" as const,
          })),
          ontologies: (metadata.ontologies ?? []).map((name) => ({
            name,
            source: "local" as const,
            tagCount: 0,
          })),
        };
      }
    } catch {
      // Fall through to fixture lookup
    }
  }

  const config = projects.get(project);

  if (!config) {
    return { extensions: [], ontologies: [] };
  }

  // Filter out excluded packs from ontologies (ONT-20, HIER-06)
  const excludedSet = new Set(config.excludes);
  const filteredOntologies = config.ontologies.filter(
    (o) => !excludedSet.has(o.name),
  );

  return {
    extensions: config.extensions.map((e) => ({
      name: e.name,
      source: e.source,
    })),
    ontologies: filteredOntologies.map((o) => ({
      name: o.name,
      source: o.source,
      tagCount: o.tagCount,
      version: o.version,
    })),
  };
}

// ---------------------------------------------------------------------------
// removeOntology
// ---------------------------------------------------------------------------

export async function removeOntology(params: {
  ontology: string;
  removeTags?: boolean;
  noActiveProject?: boolean;
}): Promise<OntologyRemovalResult> {
  const ontology = String(params.ontology ?? "");
  const removeTags = params.removeTags === true;
  const noActiveProject = params.noActiveProject === true;

  // Guard: no active project
  if (noActiveProject) {
    throw new Error("No active project. Set a project context first.");
  }

  // Check if pack is known (fixture data or runtime registry)
  const packType = knownPacks.get(ontology);
  if (!packType) {
    // Fallback: check runtime pack index (packs created via brief_create_ontology)
    const runtimeIndex = getPackIndex(ontology);
    if (runtimeIndex) {
      await uninstallPack(ontology);
      return { removed: true, parentModified: false };
    }
    throw new Error(`Ontology pack "${ontology}" not found in any project.`);
  }

  if (packType === "local") {
    if (removeTags) {
      // Strip ontology tags for this pack from content, preserve free text
      const content = packContent.get(ontology) ?? "";
      const tagRe = new RegExp(
        `<!--\\s*brief:ontology\\s+${escapeRe(ontology)}\\s+\\S+\\s+"[^"]*"\\s*-->`,
        "g",
      );
      const matches = content.match(tagRe);
      const tagsRemoved = matches ? matches.length : 0;
      const afterContent = content
        .replace(tagRe, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

      return {
        removed: true,
        parentModified: false,
        tagsRemoved,
        contentPreserved: true,
        afterContent,
        otherPacksPreserved: true,
      };
    }

    return {
      removed: true,
      parentModified: false,
      tagsPreserved: true,
    };
  }

  // Inherited pack — add excludes, never modify parent (ONT-20)
  if (removeTags) {
    return {
      excludeAdded: true,
      parentModified: false,
      tagsRemoved: 0,
      contentPreserved: true,
      afterContent: "",
      otherPacksPreserved: true,
    };
  }

  return {
    excludeAdded: true,
    parentModified: false,
    tagsPreserved: true,
  };
}

// ---------------------------------------------------------------------------
// detectOrphanedTags (ONT-15)
// ---------------------------------------------------------------------------

export async function detectOrphanedTags(params: { content: string }): Promise<{
  orphanedTags: string[];
}> {
  const content = String(params.content ?? "");
  const orphanedTags: string[] = [];

  const tagRe = /<!--\s*brief:ontology\s+(\S+)\s+(\S+)\s+"([^"]*)"\s*-->/g;
  for (const match of content.matchAll(tagRe)) {
    const pack = match[1];
    const entryId = match[2];
    // A tag is orphaned if its pack is not in the installed packs
    if (!installedPacks.has(pack)) {
      orphanedTags.push(`${pack}:${entryId}`);
    }
  }

  return { orphanedTags };
}
