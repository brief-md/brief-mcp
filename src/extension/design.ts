// src/extension/design.ts — Extension design tool (scaffolds custom extension proposals)
// Searches installed ontologies for matches against proposed subsections and returns
// a structured proposal with mode recommendations and sample entries.

import { listOntologyColumns } from "../ontology/browse.js"; // check-rules-ignore
import { listOntologies } from "../ontology/management.js"; // check-rules-ignore
import { searchOntology } from "../ontology/search.js"; // check-rules-ignore

/* ------------------------------------------------------------------ */
/*  Default subsections (mirrors DEFAULT_CUSTOM_SUBSECTIONS in         */
/*  creation.ts)                                                       */
/* ------------------------------------------------------------------ */

const DEFAULT_SUBSECTIONS = ["Direction/Intent", "Key Elements", "References"];

/** Subsection names that are inherently freeform — no ontology search needed. */
const FREEFORM_SUBSECTIONS = new Set([
  "direction/intent",
  "references",
  "notes",
  "overview",
  "summary",
]);

/* ------------------------------------------------------------------ */
/*  Known extension → ontology associations (from SPEC_EXTENSIONS)     */
/* ------------------------------------------------------------------ */

const EXTENSION_ONTOLOGY_HINTS: Record<string, string[]> = {
  sonic_arts: ["music-theory", "audio-production", "theme-pack"],
  narrative_creative: ["narrative-structure", "character-archetypes"],
  lyrical_craft: ["poetic-forms", "lyrical-devices", "theme-pack"],
  visual_storytelling: ["visual-design", "cinematography"],
  strategic_planning: ["business-strategy", "market-analysis"],
  system_design: ["software-architecture", "system-patterns"],
};

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface SampleEntry {
  id: string;
  label: string;
  description?: string;
}

interface SubsectionProposal {
  name: string;
  recommendedMode: "freeform" | "structured";
  rationale: string;
  matchedOntology?: string;
  matchedOntologyEntryCount?: number;
  suggestedColumns?: string[];
  sampleEntries?: SampleEntry[];
  ontologyAction?: "discover" | "create" | "none";
  ontologyActionHint?: string;
}

interface InstalledOntology {
  name: string;
  description: string;
  entryCount: number;
}

export interface DesignExtensionResult {
  extensionName: string;
  subsections: SubsectionProposal[];
  installedOntologies: InstalledOntology[];
  nextSteps: string[];
}

/* ------------------------------------------------------------------ */
/*  Score threshold — minimum search score to consider a match         */
/* ------------------------------------------------------------------ */

const MATCH_THRESHOLD = 0.3;

/* ------------------------------------------------------------------ */
/*  Main function                                                      */
/* ------------------------------------------------------------------ */

export async function designExtension(params: {
  extensionName: string;
  description: string;
  subsections?: string[];
  projectType?: string;
}): Promise<DesignExtensionResult> {
  const { extensionName, description } = params;
  const subsections =
    params.subsections && params.subsections.length > 0
      ? params.subsections
      : DEFAULT_SUBSECTIONS;

  // Get installed ontology packs
  const { packs } = await listOntologies();
  const installedOntologies: InstalledOntology[] = packs.map((p) => ({
    name: p.name,
    description: p.description,
    entryCount: p.entryCount,
  }));
  const installedNames = new Set(packs.map((p) => p.name));

  // Check if extension name matches a known spec extension for ontology hints
  const hints = EXTENSION_ONTOLOGY_HINTS[extensionName.toLowerCase()] ?? [];
  const hintedPacks = hints.filter((h) => installedNames.has(h));

  // Build proposal for each subsection
  const proposals: SubsectionProposal[] = [];

  for (const subsection of subsections) {
    const subsectionLower = subsection.toLowerCase();

    // Skip ontology search for inherently freeform subsections
    if (FREEFORM_SUBSECTIONS.has(subsectionLower)) {
      proposals.push({
        name: subsection,
        recommendedMode: "freeform",
        rationale: "This subsection is best suited for freeform text.",
        ontologyAction: "none",
      });
      continue;
    }

    // Search installed ontologies for matches
    let bestMatch: {
      pack: string;
      entries: SampleEntry[];
      score: number;
    } | null = null;

    try {
      // Search using the subsection name + extension description for context
      const query = `${subsection} ${description}`.slice(0, 200);
      const searchResult = await searchOntology({
        query,
        maxResults: 5,
      });

      if (searchResult.results.length > 0) {
        const topResult = searchResult.results[0];
        if (topResult.score >= MATCH_THRESHOLD && topResult.pack) {
          // Group results by pack, pick the best-matching pack
          const packScores = new Map<string, number>();
          for (const r of searchResult.results) {
            if (r.pack) {
              packScores.set(r.pack, (packScores.get(r.pack) ?? 0) + r.score);
            }
          }

          // Prefer hinted packs if they appear in results
          let bestPack = topResult.pack;
          for (const hint of hintedPacks) {
            if (packScores.has(hint)) {
              bestPack = hint;
              break;
            }
          }

          const sampleEntries = searchResult.results
            .filter((r) => r.pack === bestPack)
            .slice(0, 5)
            .map((r) => ({
              id: r.id ?? r.entryId ?? "",
              label: r.label,
              description:
                typeof r.description === "string" ? r.description : undefined,
            }));

          bestMatch = {
            pack: bestPack,
            entries: sampleEntries,
            score: packScores.get(bestPack) ?? topResult.score,
          };
        }
      }
    } catch {
      // Search failed — treat as no match
    }

    if (bestMatch) {
      // Found a matching ontology
      const packInfo = packs.find((p) => p.name === bestMatch?.pack);
      let suggestedColumns: string[] | undefined;
      try {
        const cols = listOntologyColumns({ ontology: bestMatch.pack });
        suggestedColumns = cols.columns.slice(0, 5).map((c) => c.name);
      } catch {
        // Column listing failed
      }

      proposals.push({
        name: subsection,
        recommendedMode: "structured",
        rationale: `${bestMatch.pack} ontology matches this domain (${packInfo?.entryCount ?? "?"} entries available).`,
        matchedOntology: bestMatch.pack,
        matchedOntologyEntryCount: packInfo?.entryCount,
        suggestedColumns,
        sampleEntries: bestMatch.entries,
      });
    } else {
      // No match — determine whether to suggest discover or create
      const ontologyAction = "discover" as const;
      proposals.push({
        name: subsection,
        recommendedMode: "freeform",
        rationale: "No installed ontology matches this subsection.",
        ontologyAction,
        ontologyActionHint: `Search for an ontology with brief_discover_ontologies, or create a custom one with brief_create_ontology.`,
      });
    }
  }

  const nextSteps = [
    "Present this proposal to the user. Show each subsection with its recommended mode.",
    "For structured subsections with matched ontologies, show the sample entries — ask if they fit.",
    "For unmatched subsections, ask: search for an external ontology (brief_discover_ontologies), create a custom one (brief_create_ontology / brief_ontology_draft), or keep as freeform?",
    "After user confirms all subsections and modes, call brief_add_extension with subsections and section_modes.",
    "For each structured subsection: call brief_link_section_dataset to link the ontology, then brief_tag_entry for each entry the user selects.",
    "For each freeform subsection: use Pattern 8 (collaborative authoring).",
  ];

  return {
    extensionName,
    subsections: proposals,
    installedOntologies,
    nextSteps,
  };
}
