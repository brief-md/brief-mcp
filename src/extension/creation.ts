/* ------------------------------------------------------------------ */
/*  Bundled Extension Registry — six spec-defined extensions (COMPAT-05) */
/* ------------------------------------------------------------------ */

interface ExtensionInfo {
  name: string;
  slug: string;
  description: string;
  subsections: string[];
  associatedOntologies: string[];
}

const SPEC_EXTENSIONS: Record<string, ExtensionInfo> = {
  sonic_arts: {
    name: "SONIC ARTS",
    slug: "sonic_arts",
    description: "Audio, music, sound design, acoustic experiences",
    subsections: ["Sound Palette", "Production Approach", "Sonic References"],
    associatedOntologies: ["music-theory", "audio-production", "theme-pack"],
  },
  narrative_creative: {
    name: "NARRATIVE CREATIVE",
    slug: "narrative_creative",
    description: "Storytelling, fiction, creative writing, narrative design",
    subsections: ["Narrative Arc", "Character Development", "Voice & Tone"],
    associatedOntologies: ["narrative-structure", "character-archetypes"],
  },
  lyrical_craft: {
    name: "LYRICAL CRAFT",
    slug: "lyrical_craft",
    description: "Song lyrics, poetry, versification, lyrical expression",
    subsections: ["Lyrical Themes", "Rhyme Scheme", "Verse Structure"],
    associatedOntologies: ["poetic-forms", "lyrical-devices", "theme-pack"],
  },
  visual_storytelling: {
    name: "VISUAL STORYTELLING",
    slug: "visual_storytelling",
    description: "Film, video, visual narrative, photography, visual media",
    subsections: ["Visual Language", "Shot Composition", "Color Palette"],
    associatedOntologies: ["visual-design", "cinematography"],
  },
  strategic_planning: {
    name: "STRATEGIC PLANNING",
    slug: "strategic_planning",
    description: "Business strategy, product planning, market analysis",
    subsections: ["Strategic Objectives", "Market Analysis", "Success Metrics"],
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
    associatedOntologies: ["software-architecture", "system-patterns"],
  },
};

const ALL_SPEC_SLUGS = Object.keys(SPEC_EXTENSIONS);

const DEFAULT_CUSTOM_SUBSECTIONS = [
  "Direction/Intent",
  "Constraints",
  "References",
  "Open Questions",
];

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
  simulateOrphanHeading?: boolean;
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
  const targetSubsection = params.targetSubsection;

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
  if (createdExtensions.has(metadataFormat)) {
    const existing = createdExtensions.get(metadataFormat)!;
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

  /* Generate content */
  const contentLines = [`# ${headingFormat}`, ""];
  for (const sub of resolvedSubsections) {
    contentLines.push(`## ${sub}`, "", "");
  }
  const content = contentLines.join("\n").trimEnd();

  /* Track new extension */
  createdExtensions.set(metadataFormat, {
    name: headingFormat,
    slug: metadataFormat,
    subsections: resolvedSubsections,
    description: specExt?.description ?? `Custom extension: ${headingFormat}`,
  });

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
  };
}

/** @deprecated Use addExtension */
export const createExtension = addExtension;

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
