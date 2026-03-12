import { readBrief, writeBrief } from "../io/project-state.js"; // check-rules-ignore
import defaultLogger from "../observability/logger.js"; // check-rules-ignore
import { updateTypeGuideSuggestions } from "../type-intelligence/updater.js"; // check-rules-ignore
import { getActiveProject } from "../workspace/active.js"; // check-rules-ignore
import { syncExtensionMetadata } from "../writer/metadata-sync.js"; // check-rules-ignore

const logger = defaultLogger;

/* ------------------------------------------------------------------ */
/*  Bundled Extension Registry — six spec-defined extensions (COMPAT-05) */
/* ------------------------------------------------------------------ */

export interface SubsectionInfo {
  name: string;
  mode: "ontology" | "freeform";
  ontology?: string;
}

interface ExtensionInfo {
  name: string;
  slug: string;
  description: string;
  subsections: string[];
  subsectionDetails: SubsectionInfo[];
  associatedOntologies: string[];
}

const SPEC_EXTENSIONS: Record<string, ExtensionInfo> = {
  sonic_arts: {
    name: "SONIC ARTS",
    slug: "sonic_arts",
    description: "Audio, music, sound design, acoustic experiences",
    subsections: ["Sound Palette", "Production Approach", "Sonic References"],
    subsectionDetails: [
      { name: "Sound Palette", mode: "ontology", ontology: "music-theory" },
      { name: "Production Approach", mode: "freeform" },
      {
        name: "Sonic References",
        mode: "ontology",
        ontology: "audio-production",
      },
    ],
    associatedOntologies: ["music-theory", "audio-production", "theme-pack"],
  },
  narrative_creative: {
    name: "NARRATIVE CREATIVE",
    slug: "narrative_creative",
    description: "Storytelling, fiction, creative writing, narrative design",
    subsections: ["Narrative Arc", "Character Development", "Voice & Tone"],
    subsectionDetails: [
      {
        name: "Narrative Arc",
        mode: "ontology",
        ontology: "narrative-structure",
      },
      {
        name: "Character Development",
        mode: "ontology",
        ontology: "character-archetypes",
      },
      { name: "Voice & Tone", mode: "freeform" },
    ],
    associatedOntologies: ["narrative-structure", "character-archetypes"],
  },
  lyrical_craft: {
    name: "LYRICAL CRAFT",
    slug: "lyrical_craft",
    description: "Song lyrics, poetry, versification, lyrical expression",
    subsections: ["Lyrical Themes", "Rhyme Scheme", "Verse Structure"],
    subsectionDetails: [
      { name: "Lyrical Themes", mode: "ontology", ontology: "theme-pack" },
      { name: "Rhyme Scheme", mode: "ontology", ontology: "poetic-forms" },
      { name: "Verse Structure", mode: "freeform" },
    ],
    associatedOntologies: ["poetic-forms", "lyrical-devices", "theme-pack"],
  },
  visual_storytelling: {
    name: "VISUAL STORYTELLING",
    slug: "visual_storytelling",
    description: "Film, video, visual narrative, photography, visual media",
    subsections: ["Visual Language", "Shot Composition", "Color Palette"],
    subsectionDetails: [
      { name: "Visual Language", mode: "ontology", ontology: "cinematography" },
      { name: "Shot Composition", mode: "freeform" },
      { name: "Color Palette", mode: "ontology", ontology: "visual-design" },
    ],
    associatedOntologies: ["visual-design", "cinematography"],
  },
  strategic_planning: {
    name: "STRATEGIC PLANNING",
    slug: "strategic_planning",
    description: "Business strategy, product planning, market analysis",
    subsections: ["Strategic Objectives", "Market Analysis", "Success Metrics"],
    subsectionDetails: [
      { name: "Strategic Objectives", mode: "freeform" },
      {
        name: "Market Analysis",
        mode: "ontology",
        ontology: "market-analysis",
      },
      { name: "Success Metrics", mode: "freeform" },
    ],
    associatedOntologies: ["business-strategy", "market-analysis"],
  },
  system_design: {
    name: "SYSTEM DESIGN",
    slug: "system_design",
    description: "Software architecture, infrastructure, technical systems",
    subsections: [
      "Architecture Overview",
      "Component Design",
      "Integration Points",
    ],
    subsectionDetails: [
      {
        name: "Architecture Overview",
        mode: "ontology",
        ontology: "software-architecture",
      },
      {
        name: "Component Design",
        mode: "ontology",
        ontology: "system-patterns",
      },
      { name: "Integration Points", mode: "freeform" },
    ],
    associatedOntologies: ["software-architecture", "system-patterns"],
  },
};

const ALL_SPEC_SLUGS = Object.keys(SPEC_EXTENSIONS);

/** Valid extension slugs for validation (the 6 spec-defined extensions). */
export const VALID_EXTENSION_SLUGS: ReadonlySet<string> = new Set(
  ALL_SPEC_SLUGS,
);

const DEFAULT_CUSTOM_SUBSECTIONS = [
  "Direction/Intent",
  "Key Elements",
  "References",
];

/* ------------------------------------------------------------------ */
/*  Subsection Guidance Prompts (Gap 8)                                */
/* ------------------------------------------------------------------ */

const SUBSECTION_PROMPTS: Record<string, Record<string, string>> = {
  sonic_arts: {
    "Sound Palette":
      "Define the sonic character: instruments, textures, frequency ranges, spatial qualities.",
    "Production Approach":
      "Recording methods, mixing philosophy, production tools and constraints.",
    "Sonic References":
      "Reference tracks, artists, or sonic qualities to draw from or avoid.",
  },
  narrative_creative: {
    "Narrative Arc":
      "Story structure, pacing, key plot points or narrative milestones.",
    "Character Development":
      "Core characters, their arcs, voice, and relationships.",
    "Voice & Tone":
      "Narrative voice (first/third person), tone, register, emotional range.",
  },
  lyrical_craft: {
    "Lyrical Themes":
      "Core themes, imagery, emotional territory, subject matter boundaries.",
    "Rhyme Scheme":
      "Rhyme pattern, internal rhymes, syllabic constraints, flow priorities.",
    "Verse Structure":
      "Verse/chorus/bridge structure, line lengths, stanza patterns.",
  },
  visual_storytelling: {
    "Visual Language":
      "Visual style, color grading approach, lighting philosophy, aspect ratio.",
    "Shot Composition":
      "Framing conventions, camera movement, lens choices, blocking approach.",
    "Color Palette":
      "Dominant colors, color symbolism, palette constraints, mood mapping.",
  },
  strategic_planning: {
    "Strategic Objectives":
      "Primary goals, success metrics, timeline milestones, priority ranking.",
    "Market Analysis":
      "Target market, competitive landscape, positioning, differentiation.",
    "Success Metrics":
      "KPIs, measurement frequency, targets, reporting structure.",
  },
  system_design: {
    "Architecture Overview":
      "System topology, component relationships, data flow, deployment model.",
    "Component Design":
      "Key components, interfaces, responsibilities, dependency direction.",
    "Integration Points":
      "External APIs, data sources, authentication, protocol choices.",
  },
};

const DEFAULT_SUBSECTION_PROMPTS: Record<string, string> = {
  "Direction/Intent":
    "What is the creative or strategic direction for this area?",
  "Key Elements":
    "What are the defining elements, components, or characteristics?",
  References: "What existing works, standards, or examples inform this?",
};

/* ------------------------------------------------------------------ */
/*  Name Conversion (PARSE-13, WRITE-08)                               */
/* ------------------------------------------------------------------ */

function toHeadingFormat(name: string): string {
  return name.replace(/_/g, " ").replace(/\s+/g, " ").toUpperCase().trim();
}

function toMetadataFormat(name: string): string {
  return name.replace(/\s+/g, "_").toLowerCase().trim();
}

/* ------------------------------------------------------------------ */
/*  Module State                                                       */
/* ------------------------------------------------------------------ */

const createdExtensions = new Map<
  string,
  {
    name: string;
    slug: string;
    subsections: string[];
    description: string;
  }
>();

/** @internal Reset module-level state for test isolation */
export function _resetState(): void {
  createdExtensions.clear();
}

/* ------------------------------------------------------------------ */
/*  Subsection Disambiguation Helper (WRITE-17)                        */
/* ------------------------------------------------------------------ */

function findSubsectionMatches(
  subsectionName: string,
): Array<{ extensionName: string; subsectionName: string; slug: string }> {
  const lower = subsectionName.toLowerCase();
  const matches: Array<{
    extensionName: string;
    subsectionName: string;
    slug: string;
  }> = [];

  for (const ext of Object.values(SPEC_EXTENSIONS)) {
    for (const sub of ext.subsections) {
      if (sub.toLowerCase() === lower) {
        matches.push({
          extensionName: ext.name,
          subsectionName: sub,
          slug: ext.slug,
        });
      }
    }
  }

  for (const [slug, ext] of createdExtensions) {
    if (SPEC_EXTENSIONS[slug]) continue;
    for (const sub of ext.subsections) {
      if (sub.toLowerCase() === lower) {
        matches.push({ extensionName: ext.name, subsectionName: sub, slug });
      }
    }
  }

  return matches;
}

/* ------------------------------------------------------------------ */
/*  addExtension (WRITE-18, WRITE-16b, WRITE-05, WRITE-08)            */
/* ------------------------------------------------------------------ */

export async function addExtension(params: {
  extensionName: string;
  targetSubsection?: string;
  simulateAmbiguous?: boolean;
  subsections?: string[];
  subsectionDescriptions?: Record<string, string>;
  simulateOrphanHeading?: boolean;
  projectPath?: string;
  sectionModes?: Record<string, "freeform" | "structured">;
}): Promise<{
  created: boolean;
  alreadyExists?: boolean;
  subsections: string[];
  metadataUpdated?: boolean;
  metadataFormat: string;
  headingFormat: string;
  metadataKey: string;
  success?: boolean;
  content?: string;
  filePath?: string;
  [key: string]: unknown;
}> {
  const { extensionName, subsections: customSubsections } = params;
  const simulateOrphanHeading = params.simulateOrphanHeading === true;
  const simulateAmbiguous = params.simulateAmbiguous === true;
  const _targetSubsection = params.targetSubsection;

  if (
    !extensionName ||
    typeof extensionName !== "string" ||
    extensionName.trim().length === 0
  ) {
    throw new Error("extensionName is required and must be a non-empty string");
  }

  const trimmed = extensionName.trim();
  const isHeadingFmt = /^[A-Z0-9][A-Z0-9 ]*$/.test(trimmed);
  const isMetadataFmt = /^[a-z0-9]+(_[a-z0-9]+)+$/.test(trimmed);

  /* Validate extension name format (WRITE-16b) */
  if (!isHeadingFmt && !isMetadataFmt) {
    throw new Error(
      `Extension name "${trimmed}" contains invalid characters. Use ALL CAPS with spaces (e.g., "SONIC ARTS") or lowercase_underscore format (e.g., "sonic_arts").`,
    );
  }

  const headingFormat = isMetadataFmt
    ? toHeadingFormat(trimmed)
    : trimmed.replace(/\s+/g, " ");
  const metadataFormat = toMetadataFormat(headingFormat);

  const specExt = SPEC_EXTENSIONS[metadataFormat];
  const resolvedSubsections = customSubsections ??
    specExt?.subsections ?? [...DEFAULT_CUSTOM_SUBSECTIONS];

  /* Ambiguous subsection check (WRITE-17) — simulateAmbiguous is a test seam */
  if (simulateAmbiguous) {
    throw new Error(
      `Ambiguous subsection target: multiple extensions match. Use "EXTENSION > Subsection" format to disambiguate.`,
    );
  }

  /* Idempotent: orphan heading — exists in doc but not in metadata (WRITE-18) */
  if (simulateOrphanHeading) {
    if (!createdExtensions.has(metadataFormat)) {
      createdExtensions.set(metadataFormat, {
        name: headingFormat,
        slug: metadataFormat,
        subsections: resolvedSubsections,
        description:
          specExt?.description ?? `Custom extension: ${headingFormat}`,
      });
    }
    return {
      created: false,
      alreadyExists: true,
      metadataUpdated: true,
      metadataFormat,
      headingFormat,
      metadataKey: metadataFormat,
      subsections: resolvedSubsections,
      content: `# ${headingFormat}`,
    };
  }

  /* Idempotent: already created in session (WRITE-18) */
  const existing = createdExtensions.get(metadataFormat);
  if (existing) {
    return {
      created: false,
      alreadyExists: true,
      metadataUpdated: false,
      metadataFormat,
      headingFormat,
      metadataKey: metadataFormat,
      subsections: existing.subsections,
      content: `# ${headingFormat}`,
      success: true,
    };
  }

  /* Generate content with guidance prompts */
  const sectionModes = params.sectionModes;
  const subsectionDescriptions = params.subsectionDescriptions;
  const contentLines = [`# ${headingFormat}`, ""];
  for (const sub of resolvedSubsections) {
    contentLines.push(`## ${sub}`, "");
    // Insert section-dataset marker for structured sections (WP7/GAP-G)
    if (sectionModes?.[sub] === "structured") {
      contentLines.push(`<!-- brief:section-dataset -->`, "");
    }
    const specPrompts = SUBSECTION_PROMPTS[metadataFormat];
    const prompt =
      specPrompts?.[sub] ??
      subsectionDescriptions?.[sub] ??
      DEFAULT_SUBSECTION_PROMPTS[sub];
    if (prompt) {
      contentLines.push(`*${prompt}*`, "");
    }
  }
  const content = contentLines.join("\n").trimEnd();

  /* Track new extension */
  createdExtensions.set(metadataFormat, {
    name: headingFormat,
    slug: metadataFormat,
    subsections: resolvedSubsections,
    description: specExt?.description ?? `Custom extension: ${headingFormat}`,
  });

  /* Persist to BRIEF.md if there's an active project (Gap 4) */
  let persisted = false;
  let resultFilePath: string | undefined;
  let persistWarning: string | undefined;
  const targetPath = params.projectPath ?? getActiveProject()?.path;
  if (targetPath) {
    try {
      let briefContent = await readBrief(targetPath);
      briefContent = `${briefContent.trimEnd()}\n\n${content}\n`;
      briefContent = await syncExtensionMetadata(briefContent, {
        action: "add",
        extensionName: metadataFormat,
      });
      await writeBrief(targetPath, briefContent);
      persisted = true;
      resultFilePath = `${targetPath}/BRIEF.md`;

      // Living type guide: update suggested_extensions (best-effort)
      try {
        await updateTypeGuideSuggestions({
          projectPath: targetPath,
          action: "add_extension",
          value: metadataFormat,
        });
      } catch {
        /* best-effort */
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn("Failed to persist extension to BRIEF.md", {
        extensionName: metadataFormat,
        targetPath,
        error: message,
      });
      persistWarning = `Write to disk failed: ${message}. Extension created in-memory only.`;
    }
  } else {
    persistWarning =
      "No active project set and no project_path provided. Extension created in-memory only.";
  }

  /* Chain associated ontologies (Gap 9) */
  const associatedOntologies = specExt?.associatedOntologies;
  const ontologyHint =
    associatedOntologies && associatedOntologies.length > 0
      ? `Consider installing: ${associatedOntologies.join(", ")}`
      : undefined;

  /* Reference prompt (WP6/GAP-F) */
  const referencePrompt = `Consider adding references for this extension via brief_add_reference or brief_suggest_references.`;

  /* Structured section next steps (WP7/GAP-G) */
  const hasStructured =
    sectionModes && Object.values(sectionModes).some((m) => m === "structured");
  const nextSteps = hasStructured
    ? "For structured sections: use brief_ontology_draft, brief_search_ontology, or brief_discover_ontologies to link a dataset."
    : undefined;

  /* Build required next steps — tell AI to fill each subsection */
  const freeformSubs = resolvedSubsections.filter(
    (s) => !sectionModes || sectionModes[s] !== "structured",
  );
  const structuredSubs = resolvedSubsections.filter(
    (s) => sectionModes?.[s] === "structured",
  );
  const requiredNextStepParts: string[] = [];
  if (freeformSubs.length > 0) {
    requiredNextStepParts.push(
      `Walk through each freeform subsection with the user and call brief_update_section to fill content. Freeform subsections: ${freeformSubs.join(", ")}.`,
    );
  }
  if (structuredSubs.length > 0) {
    requiredNextStepParts.push(
      `For structured subsections (${structuredSubs.join(", ")}): call brief_link_section_dataset to link an ontology, then brief_tag_entry to add entries.`,
    );
  }
  requiredNextStepParts.push(
    "Do NOT edit BRIEF.md directly — use brief_update_section for all content.",
  );
  const __REQUIRED_NEXT_STEPS__ = requiredNextStepParts.join(" ");

  return {
    created: true,
    alreadyExists: false,
    metadataUpdated: true,
    metadataFormat,
    headingFormat,
    metadataKey: metadataFormat,
    subsections: resolvedSubsections,
    success: true,
    content,
    referencePrompt,
    __REQUIRED_NEXT_STEPS__,
    ...(sectionModes && { sectionModes }),
    ...(nextSteps && { nextSteps }),
    persisted,
    ...(resultFilePath && { filePath: resultFilePath }),
    ...(persistWarning && { persistWarning }),
    ...(associatedOntologies &&
      associatedOntologies.length > 0 && { associatedOntologies }),
    ...(ontologyHint && { ontologyHint }),
  };
}

/** @deprecated Use addExtension */
export const createExtension = addExtension;

/**
 * Get known extension slugs and their subsections.
 * Returns both spec-defined and session-created extensions.
 * Used by tag scoping (WP2/GAP-A+E) to validate sections belong to extensions.
 */
export function getKnownExtensions(): Map<
  string,
  { name: string; subsections: string[]; subsectionDetails?: SubsectionInfo[] }
> {
  const result = new Map<
    string,
    {
      name: string;
      subsections: string[];
      subsectionDetails?: SubsectionInfo[];
    }
  >();
  for (const [slug, ext] of Object.entries(SPEC_EXTENSIONS)) {
    result.set(slug, {
      name: ext.name,
      subsections: ext.subsections,
      subsectionDetails: ext.subsectionDetails,
    });
  }
  for (const [slug, ext] of createdExtensions) {
    if (!result.has(slug)) {
      result.set(slug, { name: ext.name, subsections: ext.subsections });
    }
  }
  return result;
}

/* ------------------------------------------------------------------ */
/*  listExtensions (COMPAT-05)                                         */
/* ------------------------------------------------------------------ */

export async function listExtensions(_options?: {
  includeProject?: boolean;
}): Promise<{
  extensions: Array<{
    name: string;
    description: string;
    subsections: string[];
    associatedOntologies: string[];
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}> {
  const includeProject = _options?.includeProject !== false;

  const extensions: Array<{
    name: string;
    description: string;
    subsections: string[];
    associatedOntologies: string[];
    isSpecDefined: boolean;
    slug: string;
  }> = [];

  /* Always include all 6 spec-defined extensions (COMPAT-05) */
  for (const slug of ALL_SPEC_SLUGS) {
    const ext = SPEC_EXTENSIONS[slug];
    extensions.push({
      name: ext.slug,
      description: ext.description,
      subsections: [...ext.subsections],
      associatedOntologies: [...ext.associatedOntologies],
      isSpecDefined: true,
      slug: ext.slug,
    });
  }

  /* Include custom extensions from session */
  if (includeProject) {
    for (const [slug, ext] of createdExtensions) {
      if (SPEC_EXTENSIONS[slug]) continue;
      extensions.push({
        name: slug,
        description: ext.description,
        subsections: [...ext.subsections],
        associatedOntologies: [],
        isSpecDefined: false,
        slug,
      });
    }
  }

  return { extensions };
}

/* ------------------------------------------------------------------ */
/*  resolveSubsectionTarget (WRITE-17)                                 */
/* ------------------------------------------------------------------ */

export function resolveSubsectionTarget(target: string): {
  extensionName: string;
  subsectionName: string;
} {
  if (!target || target.trim().length === 0) {
    throw new Error("Target subsection is required");
  }

  /* Check for "EXTENSION > Subsection" format */
  const separatorIndex = target.indexOf(">");
  if (separatorIndex !== -1) {
    const extensionPart = target.substring(0, separatorIndex).trim();
    const subsectionPart = target.substring(separatorIndex + 1).trim();

    if (!extensionPart || !subsectionPart) {
      throw new Error("Invalid format. Use 'EXTENSION > Subsection'.");
    }

    const extSlug = toMetadataFormat(extensionPart);
    const extInfo = SPEC_EXTENSIONS[extSlug] ?? createdExtensions.get(extSlug);
    const extensionName = extInfo?.name ?? toHeadingFormat(extensionPart);

    return {
      extensionName,
      subsectionName: subsectionPart,
    };
  }

  /* Bare subsection name — check for ambiguity */
  const matches = findSubsectionMatches(target);

  if (matches.length === 1) {
    return {
      extensionName: matches[0].extensionName,
      subsectionName: matches[0].subsectionName,
    };
  }

  if (matches.length > 1) {
    throw new Error(
      `Ambiguous subsection "${target}" exists in multiple extensions: ${matches.map((m) => m.extensionName).join(", ")}. Use "EXTENSION > Subsection" format.`,
    );
  }

  /* No match — treat as standalone subsection */
  return { extensionName: "", subsectionName: target };
}
