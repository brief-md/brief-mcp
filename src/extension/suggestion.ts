import type {
  ExtensionConfidence,
  ExtensionSuggestion,
  ExtensionSuggestionResult,
} from "../types/extensions.js";

/* ------------------------------------------------------------------ */
/*  Bundled Extension Registry — all six spec-defined extensions       */
/* ------------------------------------------------------------------ */

interface CapabilityDescriptors {
  sensory: string[];
  meaning: string[];
  language: string[];
  visual: string[];
  business: string[];
  technical: string[];
}
interface ExtensionEntry {
  name: string;
  slug: string;
  domain: string;
  capabilities: CapabilityDescriptors;
  typicalSubsections: string[];
  associatedOntologies: string[];
}

/* Compact keyword helper — splits space-delimited word lists */
const w = (s: string): string[] => s.split(" ");

const EXTENSION_REGISTRY: Record<string, ExtensionEntry> = {
  sonic_arts: {
    name: "SONIC ARTS",
    slug: "sonic_arts",
    domain: "Audio, music, sound design, acoustic experiences",
    capabilities: {
      sensory: w(
        "rhythm tempo tone texture timbre frequency resonance harmony melody acoustic sonic sound audio beat dynamics noise volume pitch",
      ),
      meaning: w("mood atmosphere emotional expression feeling energy"),
      language: w("lyric vocal spoken"),
      visual: [],
      business: [],
      technical: w(
        "production mixing mastering recording synthesis sampling daw",
      ),
    },
    typicalSubsections: [
      "Sound Palette",
      "Production Approach",
      "Sonic References",
    ],
    associatedOntologies: ["music-theory", "audio-production", "theme-pack"],
  },
  narrative_creative: {
    name: "NARRATIVE CREATIVE",
    slug: "narrative_creative",
    domain: "Storytelling, fiction, creative writing, narrative design",
    capabilities: {
      sensory: [],
      meaning: w(
        "story narrative character plot theme arc conflict resolution protagonist antagonist",
      ),
      language: w(
        "prose dialogue voice tone style writing fiction nonfiction chapter scene",
      ),
      visual: [],
      business: [],
      technical: [],
    },
    typicalSubsections: [
      "Narrative Arc",
      "Character Development",
      "Voice & Tone",
    ],
    associatedOntologies: ["narrative-structure", "character-archetypes"],
  },
  lyrical_craft: {
    name: "LYRICAL CRAFT",
    slug: "lyrical_craft",
    domain: "Song lyrics, poetry, versification, lyrical expression",
    capabilities: {
      sensory: w("rhythm meter cadence"),
      meaning: w("metaphor imagery symbolism emotion"),
      language: w(
        "verse rhyme lyric lyrics poetry stanza syllable word refrain chorus",
      ),
      visual: [],
      business: [],
      technical: [],
    },
    typicalSubsections: ["Lyrical Themes", "Rhyme Scheme", "Verse Structure"],
    associatedOntologies: ["poetic-forms", "lyrical-devices", "theme-pack"],
  },
  visual_storytelling: {
    name: "VISUAL STORYTELLING",
    slug: "visual_storytelling",
    domain: "Film, video, visual narrative, photography, visual media",
    capabilities: {
      sensory: w("color light contrast texture"),
      meaning: w("scene sequence montage framing perspective"),
      language: [],
      visual: w(
        "visual image shot frame camera cinematography composition design layout graphic illustration animation video film photography",
      ),
      business: [],
      technical: w("editing post-production vfx rendering grading"),
    },
    typicalSubsections: [
      "Visual Language",
      "Shot Composition",
      "Color Palette",
    ],
    associatedOntologies: ["visual-design", "cinematography"],
  },
  strategic_planning: {
    name: "STRATEGIC PLANNING",
    slug: "strategic_planning",
    domain: "Business strategy, product planning, market analysis",
    capabilities: {
      sensory: [],
      meaning: w("goal objective mission vision strategy purpose"),
      language: [],
      visual: [],
      business: w(
        "business market revenue growth competitive stakeholder customer roi budget planning roadmap kpi metric target forecast analysis profit pricing",
      ),
      technical: [],
    },
    typicalSubsections: [
      "Strategic Objectives",
      "Market Analysis",
      "Success Metrics",
    ],
    associatedOntologies: ["business-strategy", "market-analysis"],
  },
  system_design: {
    name: "SYSTEM DESIGN",
    slug: "system_design",
    domain: "Software architecture, infrastructure, technical systems",
    capabilities: {
      sensory: [],
      meaning: [],
      language: [],
      visual: [],
      business: [],
      technical: w(
        "system architecture api database infrastructure scalability performance security deployment microservice cloud server protocol integration pipeline component module backend frontend",
      ),
    },
    typicalSubsections: [
      "Architecture Overview",
      "Component Design",
      "Integration Points",
    ],
    associatedOntologies: ["software-architecture", "system-patterns"],
  },
};

/* Universal Project Dimensions → bootstrap extension names */
const BOOTSTRAP_SUGGESTIONS = [
  "sensory_palette",
  "narrative_structure",
  "creative_expression",
  "strategic_framework",
  "technical_foundation",
  "audience_engagement",
];

const ALL_EXTENSION_SLUGS = Object.keys(EXTENSION_REGISTRY);

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\W+/)
    .filter((t) => t.length > 2);
}

function buildOntologyEntries(
  names: string[],
  installed: string[],
  down: boolean,
): Array<{ available: boolean; statusNote?: string; status?: string }> {
  return names.map((name) => {
    if (down)
      return {
        name,
        available: false,
        statusNote: "Registry unavailable",
        status: "registry-unavailable",
      };
    if (installed.includes(name))
      return { name, available: true, status: "available" };
    return {
      name,
      available: false,
      statusNote: "(not found in registry)",
      status: "not-found",
    };
  });
}

function populateChecks(
  names: string[],
  installed: string[],
  down: boolean,
  out: Record<string, "available" | "not-found" | "registry-unavailable">,
): void {
  for (const n of names) {
    out[n] = down
      ? "registry-unavailable"
      : installed.includes(n)
        ? "available"
        : "not-found";
  }
}

function matchDescriptionToExtensions(
  description: string,
  excludeSlugs: string[],
  installed: string[],
  down: boolean,
  checks: Record<string, "available" | "not-found" | "registry-unavailable">,
): ExtensionSuggestion[] {
  const tokens = tokenize(description);
  if (tokens.length === 0) return [];
  const results: ExtensionSuggestion[] = [];

  for (const slug of ALL_EXTENSION_SLUGS) {
    if (excludeSlugs.includes(slug)) continue;
    const ext = EXTENSION_REGISTRY[slug];
    let matchCount = 0;
    const cats: string[] = [];
    for (const [cat, kws] of Object.entries(ext.capabilities)) {
      const hits = tokens.filter((t) => (kws as string[]).includes(t));
      if (hits.length > 0) {
        matchCount += hits.length;
        cats.push(cat);
      }
    }
    if (matchCount > 0) {
      const ratio = matchCount / tokens.length;
      let confidence: ExtensionConfidence = "low";
      if (ratio >= 0.3) confidence = "high";
      else if (ratio >= 0.15) confidence = "medium";
      const ontologies = buildOntologyEntries(
        ext.associatedOntologies,
        installed,
        down,
      );
      populateChecks(ext.associatedOntologies, installed, down, checks);
      results.push({
        name: slug,
        reason: `Matches ${cats.join(", ")} capabilities for ${ext.domain}`,
        confidence,
        sourceTier: 2,
        extension: slug,
        suggestedOntologies: ontologies,
      } as ExtensionSuggestion);
    }
  }
  const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
  results.sort(
    (a, b) => (order[a.confidence] ?? 2) - (order[b.confidence] ?? 2),
  );
  return results;
}

/* ------------------------------------------------------------------ */
/*  Main export                                                        */
/* ------------------------------------------------------------------ */

export async function suggestExtensions(params: {
  projectType: string;
  description?: string;
  activeExtensions?: string[];
  installedOntologies?: string[];
  simulateRegistryDown?: boolean;
}): Promise<
  ExtensionSuggestionResult & { registryNote?: string; signal?: string }
> {
  const {
    projectType,
    description = "",
    activeExtensions = [],
    installedOntologies = [],
  } = {
    description: "",
    activeExtensions: [] as string[],
    installedOntologies: [] as string[],
    ...params,
  };
  const down = params.simulateRegistryDown === true;
  const checks: Record<
    string,
    "available" | "not-found" | "registry-unavailable"
  > = {};

  /* Tier 1: Type guide driven */
  let tier1: ExtensionSuggestion[] = [];
  try {
    const _t40 = await import("../type-intelligence/loading.js"); // check-rules-ignore
    const res = await _t40.getTypeGuide({ type: projectType });
    if (!res.isGeneric && res.guide?.metadata?.suggestedExtensions) {
      tier1 = res.guide.metadata.suggestedExtensions
        .filter((e) => !activeExtensions.includes(e) && e in EXTENSION_REGISTRY)
        .map((e) => {
          const def = EXTENSION_REGISTRY[e];
          const onts = buildOntologyEntries(
            def.associatedOntologies,
            installedOntologies,
            down,
          );
          populateChecks(
            def.associatedOntologies,
            installedOntologies,
            down,
            checks,
          );
          return {
            name: e,
            reason: `Recommended by type guide for ${projectType}`,
            confidence: "high" as ExtensionConfidence,
            sourceTier: 1 as const,
            extension: e,
            suggestedOntologies: onts,
          } as ExtensionSuggestion;
        });
    }
  } catch {
    /* guide unavailable */
  }

  /* Tier 2: Description matching */
  const exclude = [...activeExtensions, ...tier1.map((s) => s.name)];
  const tier2 =
    description.length > 0
      ? matchDescriptionToExtensions(
          description,
          exclude,
          installedOntologies,
          down,
          checks,
        )
      : [];

  /* Tier 3: Bootstrap (when Tiers 1+2 empty) */
  let tier3: string[] | undefined;
  if (tier1.length === 0 && tier2.length === 0) {
    tier3 = BOOTSTRAP_SUGGESTIONS.filter((n) => !activeExtensions.includes(n));
  }

  const registryNote = down ? "Registry unavailable" : undefined;

  let signal: string | undefined;
  if (
    tier1.length === 0 &&
    tier2.length === 0 &&
    (!tier3 || tier3.length === 0)
  ) {
    signal =
      "No extensions could be suggested. Consider creating a custom extension with brief_add_extension or providing a project description for better matching.";
  } else if (tier1.length === 0 && tier2.length === 0) {
    signal =
      "No specific extension matches found. Bootstrap suggestions provided as starting points. Consider creating custom extensions with brief_add_extension.";
  }

  return {
    tier1Suggestions: tier1.length > 0 ? tier1 : undefined,
    tier2Suggestions: tier2.length > 0 ? tier2 : undefined,
    tier3BootstrapSuggestions: tier3,
    availabilityChecks: Object.keys(checks).length > 0 ? checks : undefined,
    registryNote,
    signal,
  };
}
