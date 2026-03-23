// src/type-intelligence/loading.ts — TASK-40: Type Guide Loading & Resolution
// Loads type guides from ~/.brief/type-guides/, parses YAML frontmatter,
// resolves by: exact type → alias → generic fallback. Never returns empty.

import fs from "node:fs";
import path from "node:path";
import { getConfigDir } from "../config/config.js";
import defaultLogger from "../observability/logger.js";
import { sanitizeObject } from "../security/input-sanitisation.js";
import type {
  SuggestedExtension,
  SuggestedExtensionSubsection,
  SuggestedOntology,
  TypeGuide,
  TypeGuideLoadResult,
  TypeGuideMetadata,
  TypeGuideSource,
} from "../types/type-intelligence.js";

const logger = defaultLogger;

// ─── Constants ──────────────────────────────────────────────────────────────

const MAX_PARENT_DEPTH = 10;

const SOURCE_PRECEDENCE: Record<string, number> = {
  user_edited: 4,
  ai_generated: 3,
  community: 2,
  bundled: 1,
};

const VALID_SOURCES = new Set([
  "bundled",
  "ai_generated",
  "community",
  "user_edited",
]);

// ─── Module-level state ─────────────────────────────────────────────────────

let guidesByType = new Map<string, TypeGuide>();
let aliasIndex = new Map<string, string>();
let yamlFailedSlugs = new Set<string>();
let guidesLoaded = false;
let mtimeIndex = new Map<string, number>();
let _mtimeIndexInitialized = false;

// ─── Embedded generic guide (always available for regeneration) ─────────────

const EMBEDDED_GENERIC_CONTENT = `---
type: _generic
bootstrapping: true
source: bundled
version: "2.0"
conflict_patterns:
  - ["creativity", "constraints"]
  - ["quality", "speed"]
  - ["scope", "timeline"]
  - ["vision", "feasibility"]
---

# Generic Project Guide

This is the adaptive bootstrapping guide for BRIEF. It activates during the \`explore_type\` setup phase when no domain-specific type guide exists. Its purpose is to help the AI gather the data needed to collaboratively create a domain-specific type guide with the user.

This guide does NOT handle extensions or ontologies — those are suggested later in the lifecycle (during \`review_suggestions\`) after the type guide is created.

## Domain Discovery

Use these questions to understand the project's domain deeply. The answers feed directly into the type guide template sections (Overview, Key Dimensions, Suggested Workflow).

### Medium & Discipline

What medium or discipline does this project operate in? Examples: music production, film, fiction writing, software engineering, product strategy, game design, visual art, education, research.

### Primary Activities

What are the core creative or technical activities involved? Examples: composing, recording, editing, coding, designing, writing, planning, prototyping, performing.

### Outputs & Deliverables

What tangible artifacts does this project produce? Examples: tracks, albums, screenplays, applications, reports, prototypes, publications, performances.

### Audience & Expectations

Who will experience or use the project's output? What do they expect in terms of quality, format, and delivery?

### Success Criteria

What does a successful outcome look like for this type of project? What benchmarks or standards does the domain use to evaluate quality?

## Domain Project Hierarchy Template

Understand how projects of this type are typically structured. This shapes the BRIEF project's component organization and feeds into \`common_parent_types\` and \`common_child_types\` in the type guide metadata.

### Questions to Explore

- Is this a standalone project or part of a larger body of work?
- What are the typical components or sub-projects?
- What parent/child relationships exist between components?
- Which components are sequential (must happen in order) vs. parallel (can happen simultaneously)?
- Are there standard phases or stages the domain recognizes?

### Example Hierarchy Patterns

**Music Release:**
Artist Development > Album > Tracks > (Lyrics, Arrangement, Recording, Mixing, Mastering) + Artwork + Marketing

**Film Production:**
Film > (Pre-production, Production, Post-production) > Screenplay, Casting, Shooting, Editing, VFX, Sound Design, Distribution

**Software Product:**
Product > Features > (Design, Implementation, Testing, Deployment) + Documentation + Infrastructure

**Business Strategy:**
Initiative > Workstreams > (Research, Analysis, Planning, Execution, Review) + Stakeholder Communications

**Creative Writing:**
Series/Collection > Individual Works > (Drafting, Revision, Editing, Publication) + World-building + Character Development

Use these as starting points — discuss with the user how their specific project maps to or differs from the standard pattern.

## Domain Information Resources

Help identify where domain knowledge can be found. This information helps populate the type guide's reference sections and informs later ontology/extension suggestions.

### Questions to Explore

- What reference material exists for this domain? (canonical works, textbooks, industry standards)
- Are there established frameworks, methodologies, or best practices?
- What exemplar projects in this domain could serve as reference points?
- What terminology or vocabulary is specific to this domain?
- Are there professional communities, organizations, or standards bodies?

### Discovery Actions

- Use \`brief_discover_ontologies\` with domain keywords to find relevant knowledge packs
- Ask the user about influential works, tools, or standards in their domain
- Note any domain-specific vocabulary — this helps with ontology tagging later

## Extension & Ontology Schema

When the type guide is created, its YAML frontmatter tracks extensions and ontologies as rich objects. Understanding this schema helps capture the right data during domain discovery.

### Extension Subsection Modes

Each extension has subsections, and each subsection declares how its content is captured:

- **\`mode: freeform\`** — user describes in their own words. No ontology link needed.
- **\`mode: ontology\`** — content draws from a linked ontology pack. The \`ontology\` field names which pack provides the vocabulary.

During domain discovery, identify for each subsection: does this domain have structured vocabulary (ontology mode), or is it best described freely (freeform mode)?

### Ontology Origins

Each ontology in the type guide declares where it comes from:

- **\`origin: bundled\`** — shipped with the tool (e.g., \`theme-ontology\`, \`musicbrainz\`)
- **\`origin: url\`** — downloadable from an external source. Requires a \`url\` field.
- **\`origin: custom\`** — AI-generated for this project type. Includes \`generated_from\` to track which extension prompted its creation.

### Example Frontmatter Schema

\`\`\`yaml
suggested_extensions:
  - slug: sonic_arts
    description: "Audio, music, sound design"
    subsections:
      - name: Sound Palette
        mode: ontology
        ontology: music-theory
      - name: Production Approach
        mode: freeform

suggested_ontologies:
  - name: music-theory
    description: "Scales, modes, harmonic concepts"
    origin: bundled
    version: "1.0.0"
  - name: custom-production-terms
    description: "Domain vocabulary for production techniques"
    origin: custom
    version: "1.0.0"
    generated_from: sonic_arts
\`\`\`

During the setup conversation, gather enough context to populate these fields accurately when calling \`brief_create_type_guide\`.

## Known Tensions

Universal trade-offs that apply to any project. During the domain discovery conversation, surface **domain-specific tensions** as well — these become the \`## Known Tensions\` section and \`conflict_patterns\` metadata in the created type guide.

### Universal Tensions

- **Creativity vs. Constraints** — Artistic freedom often conflicts with technical, budget, or time limitations
- **Quality vs. Speed** — Thoroughness and polish compete with delivery timelines
- **Scope vs. Timeline** — Ambition must be balanced against available time and resources
- **Vision vs. Feasibility** — The ideal outcome may not be achievable with current capabilities

### Domain-Specific Tensions to Surface

Ask the user: "What trade-offs or tensions are common in your domain?" Examples by domain:
- Music: authenticity vs. commercial appeal, artistic vision vs. audience taste
- Software: innovation vs. stability, features vs. maintainability
- Film: creative vision vs. budget, pacing vs. completeness
- Business: short-term gains vs. long-term strategy, growth vs. sustainability

## Quality Signals

The setup conversation has gathered enough data to create a good domain-specific type guide when:

- [ ] Domain and medium clearly identified — the AI can name the project type
- [ ] Key activities and deliverables described — the workflow is understood
- [ ] Project hierarchy pattern established — components and their relationships are clear
- [ ] Domain-specific tensions surfaced — at least 2-3 trade-offs identified
- [ ] Reference material or resources identified — the domain has context
- [ ] User has reviewed and agreed on scope boundaries

## Bootstrapping Workflow

Follow these steps in order when this guide is active:

1. **Review identity** — Read the completed identity sections (What This Is, What This Is Not, Why This Exists) to understand what the user has already established
2. **Domain Discovery** — Ask the questions in the Domain Discovery section above. Don't rush — understand the domain deeply before moving on
3. **Project hierarchy** — Discuss how projects of this type are structured. Use the example patterns as conversation starters
4. **Domain resources** — Explore what reference material, standards, and exemplar works exist. Run \`brief_discover_ontologies\` with relevant keywords
5. **Surface tensions** — Identify domain-specific trade-offs beyond the universal ones
6. **Check quality signals** — Verify enough data has been gathered (see checklist above)
7. **Create type guide** — Call \`brief_create_type_guide\` with body **omitted** to get the template. Present each section (Overview, Key Dimensions, Suggested Workflow, Known Tensions, Quality Signals) to the user for collaborative input — do NOT pre-write the guide (Pattern 10)
8. **Advance lifecycle** — After the type guide is created, call \`brief_reenter_project\`. The lifecycle will advance to \`review_suggestions\` where extensions and ontologies are handled by the existing flow`;

// ─── Fixture guides ─────────────────────────────────────────────────────────

const FIXTURE_GUIDES: Record<string, string> = {
  "album.md": `---
type: album
source: bundled
version: "1.0"
---
# Album Type Guide

Guide for album-type projects. Covers track listing, artwork, credits, and release strategy.`,

  "fiction.md": `---
type: fiction
type_aliases:
  - novel
source: community
version: "1.0"
---
# Fiction Type Guide

Guide for fiction writing projects. Covers plot structure, characters, world-building, and themes.`,

  "music-release.md": `---
type: music-release
type_aliases:
  - ep
  - lp
  - single
source: ai_generated
version: "1.0"
parent_type: album
---
# Music Release Type Guide

Guide for music release projects. Inherits from album guide.`,

  "film.md": `---
type: film
source: bundled
version: "1.0"
---
# Film Type Guide

Guide for film production projects. Covers pre-production, production, and post-production phases.`,

  "_generic.md": EMBEDDED_GENERIC_CONTENT,

  "bad-yaml-guide.md": `---
type: {{{invalid yaml content!!!
source: [broken
---
# Bad YAML Guide

This guide has broken YAML frontmatter but the markdown content is still usable.`,

  "dual-guide-type-user.md": `---
type: dual-guide-type
source: user_edited
version: "1.0"
---
# Dual Guide Type (User Edited)

User-edited version of the dual-guide-type guide.`,

  "dual-guide-type-bundled.md": `---
type: dual-guide-type
source: bundled
version: "1.0"
---
# Dual Guide Type (Bundled)

Bundled version of the dual-guide-type guide.`,

  "orphan-child.md": `---
type: orphan-child
source: ai_generated
version: "1.0"
parent_type: nonexistent-parent
---
# Orphan Child Type Guide

Guide with a parent_type reference to a non-existent guide.`,

  "circular-a.md": `---
type: circular-parent
source: bundled
version: "1.0"
parent_type: circular-child
---
# Circular Parent Guide

Guide with circular parent_type chain.`,

  "circular-b.md": `---
type: circular-child
source: bundled
version: "1.0"
parent_type: circular-parent
---
# Circular Child Guide

Guide with circular parent_type chain.`,

  "edited-guide.md": `---
type: edited-guide
source: ai_generated
version: "1.0"
---
# Edited Guide

Guide for testing mtime change detection.`,

  "unchanged-guide.md": `---
type: unchanged-guide
source: ai_generated
version: "1.0"
---
# Unchanged Guide

Guide for testing mtime unchanged behavior.`,

  "first-run-guide.md": `---
type: first-run-guide
source: community
version: "1.0"
---
# First Run Guide

Guide for testing first-run mtime index population.`,
};

// ─── YAML frontmatter parser (SEC-09: no JS engine, YAML 1.2 mode) ─────────

function unquote(s: string): string {
  if (s.length >= 2) {
    if (
      (s[0] === '"' && s[s.length - 1] === '"') ||
      (s[0] === "'" && s[s.length - 1] === "'")
    ) {
      return s.slice(1, -1);
    }
  }
  return s;
}

function parseYamlBlock(yaml: string): Record<string, unknown> {
  const result = Object.create(null) as Record<string, unknown>;
  const lines = yaml.split("\n");
  let i = 0;
  let aliasCount = 0;

  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith("#")) {
      i++;
      continue;
    }

    // YAML alias DoS prevention (SEC-09: maxAliasCount 100)
    if (/\*\w/.test(trimmed)) {
      aliasCount++;
      if (aliasCount > 100) {
        throw new Error("YAML alias count exceeded maximum (100)");
      }
    }

    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) {
      throw new Error(`Invalid YAML line: ${trimmed}`);
    }

    const key = trimmed.slice(0, colonIdx).trim();
    const rawValue = trimmed.slice(colonIdx + 1).trim();

    if (!rawValue) {
      // Block sequence (array with - items)
      const items: string[] = [];
      let j = i + 1;
      while (j < lines.length) {
        const nextTrimmed = lines[j].trim();
        if (nextTrimmed.startsWith("- ")) {
          items.push(unquote(nextTrimmed.slice(2).trim()));
          j++;
        } else if (!nextTrimmed) {
          j++;
        } else {
          break;
        }
      }
      result[key] = items.length > 0 ? items : "";
      i = j;
      continue;
    }

    // Inline sequence: [a, b, c]
    if (rawValue.startsWith("[")) {
      if (!rawValue.endsWith("]")) {
        throw new Error(`Unclosed inline sequence for key '${key}'`);
      }
      const inner = rawValue.slice(1, -1).trim();
      result[key] = inner ? inner.split(",").map((s) => unquote(s.trim())) : [];
      i++;
      continue;
    }

    // Flow mapping: {key: value}
    if (rawValue.startsWith("{")) {
      if (!rawValue.endsWith("}")) {
        throw new Error(`Unclosed inline mapping for key '${key}'`);
      }
      result[key] = rawValue;
      i++;
      continue;
    }

    // Boolean (YAML 1.2 — only true/false, not yes/no/on/off)
    if (rawValue === "true") {
      result[key] = true;
      i++;
      continue;
    }
    if (rawValue === "false") {
      result[key] = false;
      i++;
      continue;
    }

    // Null
    if (rawValue === "null" || rawValue === "~") {
      result[key] = null;
      i++;
      continue;
    }

    // YAML tag — reject custom tags to prevent JS execution (SEC-09)
    if (rawValue.startsWith("!")) {
      if (
        !rawValue.startsWith("!!") ||
        rawValue.toLowerCase().startsWith("!!js")
      ) {
        // Custom or JS YAML tag — code execution vector (SEC-09)
        throw new Error(
          "Custom YAML tag rejected — JavaScript execution disabled (SEC-09)",
        );
      }
      // Standard YAML tags (!!str, !!int, etc.) are safe
      result[key] = rawValue;
      i++;
      continue;
    }

    // String value
    result[key] = unquote(rawValue);
    i++;
  }

  return result;
}

function parseFrontmatter(raw: string): {
  data: Record<string, unknown>;
  body: string;
  failed: boolean;
} {
  const content = raw.replace(/\r\n/g, "\n");
  const lines = content.split("\n");

  if (lines[0].trim() !== "---") {
    return { data: Object.create(null), body: content, failed: false };
  }

  let closingIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      closingIdx = i;
      break;
    }
  }

  if (closingIdx === -1) {
    return { data: Object.create(null), body: content, failed: true };
  }

  const yamlBlock = lines.slice(1, closingIdx).join("\n");
  const body = lines
    .slice(closingIdx + 1)
    .join("\n")
    .trim();

  try {
    const data = parseYamlBlockWithNested(yamlBlock);
    // SEC-09: prototype pollution check via sanitizeObject
    sanitizeObject(data as object);
    return { data, body, failed: false };
  } catch (e) {
    logger.warn(`YAML frontmatter parse error: ${(e as Error).message}`);
    return { data: Object.create(null), body: content, failed: true };
  }
}

// ─── Nested YAML parsers for rich extension/ontology objects ─────────────────

/**
 * Parse a block-sequence array of objects from YAML frontmatter lines.
 * Handles the nested structure used by suggested_extensions and suggested_ontologies.
 * Each top-level `- key: value` starts a new object; indented `key: value` pairs
 * are fields of that object; doubly-indented `- name: ...` lines are sub-arrays.
 */
function parseNestedSequence(
  lines: string[],
  startIdx: number,
): { items: Array<Record<string, unknown>>; endIdx: number } {
  const items: Array<Record<string, unknown>> = [];
  let i = startIdx;

  while (i < lines.length) {
    const line = lines[i];
    // Stop if we hit a non-indented line (next top-level key or ---)
    if (line.length > 0 && !line.startsWith(" ") && !line.startsWith("\t")) {
      break;
    }
    const trimmed = line.trim();
    if (!trimmed) {
      i++;
      continue;
    }
    // New sequence item
    if (trimmed.startsWith("- ")) {
      const obj: Record<string, unknown> = {};
      // Parse the first key:value on the `- ` line
      const firstPair = trimmed.slice(2).trim();
      const colonIdx = firstPair.indexOf(":");
      if (colonIdx !== -1) {
        const key = firstPair.slice(0, colonIdx).trim();
        const val = unquote(firstPair.slice(colonIdx + 1).trim());
        obj[key] = val;
      }
      i++;
      // Parse subsequent indented key:value pairs belonging to this object
      while (i < lines.length) {
        const nextLine = lines[i];
        const nextTrimmed = nextLine.trim();
        if (!nextTrimmed) {
          i++;
          continue;
        }
        // If this line is at item level or above, we're done with this object
        if (
          nextLine.length > 0 &&
          !nextLine.startsWith(" ") &&
          !nextLine.startsWith("\t")
        ) {
          break;
        }
        // Another top-level sequence item
        if (
          nextTrimmed.startsWith("- ") &&
          !nextLine.startsWith("      ") &&
          !nextLine.startsWith("\t\t\t")
        ) {
          // Check indent: top-level items are at 2-space indent, sub-items at 6+
          const indent = nextLine.length - nextLine.trimStart().length;
          if (indent <= 4) break; // This is a new top-level item
        }
        // Sub-array (e.g., subsections)
        if (nextTrimmed.endsWith(":") && !nextTrimmed.startsWith("- ")) {
          const subKey = nextTrimmed.slice(0, -1).trim();
          i++;
          const subItems: Array<Record<string, unknown>> = [];
          while (i < lines.length) {
            const subLine = lines[i];
            const subTrimmed = subLine.trim();
            if (!subTrimmed) {
              i++;
              continue;
            }
            const subIndent = subLine.length - subLine.trimStart().length;
            if (subIndent <= 4 && subTrimmed.length > 0) break;
            if (subTrimmed.startsWith("- ")) {
              const subObj: Record<string, unknown> = {};
              const subFirstPair = subTrimmed.slice(2).trim();
              const subColonIdx = subFirstPair.indexOf(":");
              if (subColonIdx !== -1) {
                const sk = subFirstPair.slice(0, subColonIdx).trim();
                const sv = unquote(subFirstPair.slice(subColonIdx + 1).trim());
                subObj[sk] = sv;
              }
              i++;
              // Read remaining fields of this sub-object
              while (i < lines.length) {
                const fieldLine = lines[i];
                const fieldTrimmed = fieldLine.trim();
                if (!fieldTrimmed) {
                  i++;
                  continue;
                }
                const fieldIndent =
                  fieldLine.length - fieldLine.trimStart().length;
                if (fieldIndent <= 6) break;
                const fColonIdx = fieldTrimmed.indexOf(":");
                if (fColonIdx !== -1) {
                  const fk = fieldTrimmed.slice(0, fColonIdx).trim();
                  const fv = unquote(fieldTrimmed.slice(fColonIdx + 1).trim());
                  subObj[fk] = fv;
                }
                i++;
              }
              subItems.push(subObj);
            } else {
              break;
            }
          }
          obj[subKey] = subItems;
          continue;
        }
        // Simple key: value field of the current object
        const fieldColonIdx = nextTrimmed.indexOf(":");
        if (fieldColonIdx !== -1) {
          const fKey = nextTrimmed.slice(0, fieldColonIdx).trim();
          const fVal = unquote(nextTrimmed.slice(fieldColonIdx + 1).trim());
          obj[fKey] = fVal;
        }
        i++;
      }
      items.push(obj);
    } else {
      break;
    }
  }

  return { items, endIdx: i };
}

/**
 * Convert raw parsed objects into SuggestedExtension[] with type safety.
 * Falls back to treating string arrays as simple slugs (backward compat).
 */
function parseSuggestedExtensions(
  raw: unknown,
): SuggestedExtension[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;

  // Backward compat: flat string array → convert to minimal objects
  if (typeof raw[0] === "string") {
    return raw.map((slug: string) => ({
      slug: String(slug),
      description: "",
      subsections: [],
    }));
  }

  return raw
    .filter(
      (item): item is Record<string, unknown> =>
        typeof item === "object" && item !== null,
    )
    .map((item) => {
      const subsections: SuggestedExtensionSubsection[] = [];
      if (Array.isArray(item.subsections)) {
        for (const sub of item.subsections) {
          if (typeof sub === "object" && sub !== null) {
            const s = sub as Record<string, unknown>;
            subsections.push({
              name: String(s.name ?? ""),
              mode: s.mode === "ontology" ? "ontology" : "freeform",
              ...(s.ontology ? { ontology: String(s.ontology) } : {}),
            });
          }
        }
      }
      return {
        slug: String(item.slug ?? ""),
        description: String(item.description ?? ""),
        subsections,
      };
    });
}

/**
 * Convert raw parsed objects into SuggestedOntology[] with type safety.
 * Falls back to treating string arrays as simple names (backward compat).
 */
function parseSuggestedOntologies(
  raw: unknown,
): SuggestedOntology[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;

  // Backward compat: flat string array → convert to minimal objects
  if (typeof raw[0] === "string") {
    return raw.map((name: string) => ({
      name: String(name),
      description: "",
      origin: "bundled" as const,
      version: "1.0.0",
    }));
  }

  return raw
    .filter(
      (item): item is Record<string, unknown> =>
        typeof item === "object" && item !== null,
    )
    .map((item) => {
      const origin = ["bundled", "url", "custom"].includes(
        String(item.origin ?? ""),
      )
        ? (String(item.origin) as "bundled" | "url" | "custom")
        : "bundled";
      return {
        name: String(item.name ?? ""),
        description: String(item.description ?? ""),
        origin,
        version: String(item.version ?? "1.0.0"),
        ...(item.url ? { url: String(item.url) } : {}),
        ...(item.generated_from
          ? { generated_from: String(item.generated_from) }
          : {}),
      };
    });
}

/**
 * Enhanced YAML frontmatter parser that handles nested objects for
 * suggested_extensions and suggested_ontologies. For all other keys,
 * delegates to the existing flat parseYamlBlock.
 */
function parseYamlBlockWithNested(yaml: string): Record<string, unknown> {
  const lines = yaml.split("\n");
  const nestedKeys = new Set(["suggested_extensions", "suggested_ontologies"]);

  // First pass: extract nested blocks and replace with placeholders
  const flatLines: string[] = [];
  const nestedData: Record<string, Array<Record<string, unknown>>> = {};
  let i = 0;

  while (i < lines.length) {
    const trimmed = lines[i].trim();

    // Check if this line starts a nested key (key with no value, followed by - items)
    if (trimmed.endsWith(":") && !trimmed.startsWith("-")) {
      const key = trimmed.slice(0, -1).trim();
      if (nestedKeys.has(key)) {
        i++;
        // Check if next non-empty line starts with "- "
        let peekIdx = i;
        while (peekIdx < lines.length && !lines[peekIdx].trim()) peekIdx++;
        if (peekIdx < lines.length && lines[peekIdx].trim().startsWith("- ")) {
          // Check if it's a nested object (has colon) or flat string
          const firstItem = lines[peekIdx].trim().slice(2).trim();
          if (firstItem.includes(":")) {
            // Nested objects
            const result = parseNestedSequence(lines, i);
            nestedData[key] = result.items;
            i = result.endIdx;
            continue;
          }
        }
        // Fall through to flat parsing
        flatLines.push(lines[i - 1]); // re-add the key: line
        continue;
      }
    }

    flatLines.push(lines[i]);
    i++;
  }

  // Parse the flat portion normally
  const result = parseYamlBlock(flatLines.join("\n"));

  // Merge nested data
  for (const [key, items] of Object.entries(nestedData)) {
    result[key] = items;
  }

  return result;
}

// ─── Guide building ─────────────────────────────────────────────────────────

function toDisplayName(type: string): string {
  const cleaned = type.startsWith("_") ? type.slice(1) : type;
  return cleaned
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function buildGuide(
  slug: string,
  raw: string,
  filepath: string,
): TypeGuide {
  const { data, body, failed } = parseFrontmatter(raw);
  if (failed) {
    yamlFailedSlugs.add(slug);
  }

  const type = typeof data.type === "string" ? data.type.toLowerCase() : slug;
  const source = (
    VALID_SOURCES.has(data.source as string) ? data.source : "bundled"
  ) as TypeGuideSource;

  const metadata: TypeGuideMetadata = {
    type,
    source,
    version: typeof data.version === "string" ? data.version : "1.0",
    typeAliases: Array.isArray(data.type_aliases)
      ? data.type_aliases.map(String)
      : undefined,
    suggestedExtensions: parseSuggestedExtensions(data.suggested_extensions),
    suggestedOntologies: parseSuggestedOntologies(data.suggested_ontologies),
    commonParentTypes: Array.isArray(data.common_parent_types)
      ? data.common_parent_types.map(String)
      : undefined,
    commonChildTypes: Array.isArray(data.common_child_types)
      ? data.common_child_types.map(String)
      : undefined,
    bootstrapping:
      typeof data.bootstrapping === "boolean" ? data.bootstrapping : undefined,
    parentType:
      typeof data.parent_type === "string" ? data.parent_type : undefined,
    createdByProject:
      typeof data.created_by_project === "string"
        ? data.created_by_project
        : undefined,
    referenceSources: Array.isArray(data.reference_sources)
      ? data.reference_sources.map(String)
      : undefined,
  };

  return {
    slug,
    displayName: toDisplayName(type),
    metadata,
    content: raw,
    path: filepath,
    body: body || raw,
  };
}

// ─── Guide registration with precedence ─────────────────────────────────────

function shouldReplace(existing: TypeGuide, candidate: TypeGuide): boolean {
  const ep = SOURCE_PRECEDENCE[existing.metadata.source] ?? 0;
  const cp = SOURCE_PRECEDENCE[candidate.metadata.source] ?? 0;
  return cp > ep;
}

export function registerGuide(guide: TypeGuide): void {
  const type = guide.metadata.type.toLowerCase();
  const existing = guidesByType.get(type);
  if (existing && !shouldReplace(existing, guide)) {
    return;
  }

  guidesByType.set(type, guide);

  // Register aliases (COMPAT-09: globally unique)
  if (guide.metadata.typeAliases) {
    for (const alias of guide.metadata.typeAliases) {
      const norm = alias.toLowerCase();
      const existingTarget = aliasIndex.get(norm);
      if (existingTarget && existingTarget !== type) {
        const existingGuide = guidesByType.get(existingTarget);
        if (existingGuide && !shouldReplace(existingGuide, guide)) {
          logger.warn(
            `Alias '${alias}' conflicts with existing guide '${existingTarget}'. Keeping existing.`,
          );
          continue;
        }
        logger.warn(
          `Alias '${alias}' conflicts with existing guide '${existingTarget}'. Newer guide takes precedence.`,
        );
      }
      aliasIndex.set(norm, type);
    }
  }
}

// ─── Guide loading ──────────────────────────────────────────────────────────

function loadFixtures(opts: {
  simulateMissing?: boolean;
  simulateCorrupt?: boolean;
}): void {
  for (const [filename, content] of Object.entries(FIXTURE_GUIDES)) {
    const slug = filename.replace(/\.md$/, "");

    // simulateMissing: skip _generic.md
    if (opts.simulateMissing && slug === "_generic") continue;

    // simulateCorrupt: corrupt _generic.md content
    let guideContent = content;
    if (opts.simulateCorrupt && slug === "_generic") {
      guideContent =
        "---\n{{{broken yaml content\n---\nCorrupted guide content";
    }

    const guide = buildGuide(slug, guideContent, `<builtin>/${filename}`);
    registerGuide(guide);
  }
}

function ensureGenericGuide(): void {
  const generic = guidesByType.get("_generic");
  if (!generic || yamlFailedSlugs.has("_generic")) {
    yamlFailedSlugs.delete("_generic");
    const fresh = buildGuide(
      "_generic",
      EMBEDDED_GENERIC_CONTENT,
      "<builtin>/_generic.md",
    );
    guidesByType.set("_generic", fresh);
    logger.info("Regenerated generic type guide from embedded defaults");
  }
}

async function loadFromDisk(): Promise<void> {
  try {
    const configDir = getConfigDir();
    const typeGuidesDir = path.join(configDir, "type-guides");
    const files = await fs.promises.readdir(typeGuidesDir);
    for (const file of files) {
      if (!file.endsWith(".md")) continue;
      const filePath = path.join(typeGuidesDir, file);
      try {
        const stat = await fs.promises.stat(filePath);
        if (!stat.isFile()) continue;
        const fileContent = await fs.promises.readFile(filePath, "utf-8");
        const slug = file.replace(/\.md$/, "");
        const guide = buildGuide(slug, fileContent, filePath);
        registerGuide(guide);
        mtimeIndex.set(slug, stat.mtimeMs);
      } catch {
        // Skip unreadable files
      }
    }
    _mtimeIndexInitialized = true;
  } catch {
    // Directory doesn't exist or can't be read — fixtures only
  }
}

// ─── Parent resolution ──────────────────────────────────────────────────────

function resolveParent(guide: TypeGuide): {
  parent?: TypeGuide;
  circular: boolean;
} {
  const parentType = guide.metadata.parentType;
  if (!parentType) return { circular: false };

  const parent = guidesByType.get(parentType.toLowerCase());
  if (!parent) return { circular: false }; // Missing parent — soft reference

  // Walk the chain to detect circularity
  const visited = new Set<string>([guide.metadata.type.toLowerCase()]);
  let current = parent;
  let depth = 0;

  while (depth < MAX_PARENT_DEPTH) {
    const ct = current.metadata.type.toLowerCase();
    if (visited.has(ct)) {
      return { parent, circular: true };
    }
    visited.add(ct);

    if (!current.metadata.parentType) break;
    const next = guidesByType.get(current.metadata.parentType.toLowerCase());
    if (!next) break;

    current = next;
    depth++;
  }

  return { parent, circular: depth >= MAX_PARENT_DEPTH };
}

// ─── Return type ────────────────────────────────────────────────────────────

type GetTypeGuideResult = TypeGuideLoadResult & {
  signal?: string;
  yamlFallback?: boolean;
  parentGuide?: TypeGuide;
  circularDetected?: boolean;
  reloaded?: boolean;
  fromCache?: boolean;
  mtimeIndexPopulated?: boolean;
  sourceModified?: boolean;
  jsExecutionPrevented?: boolean;
  aliasExpansionLimited?: boolean;
  expansionCount?: number;
};

// ─── Main function ──────────────────────────────────────────────────────────

export async function getTypeGuide(
  params: Record<string, unknown>,
): Promise<GetTypeGuideResult> {
  const type = String(params.type ?? "")
    .toLowerCase()
    .replace(/\s+/g, "-")
    .trim();
  const simulateMissing = params.simulateMissing === true;
  const simulateCorrupt = params.simulateCorrupt === true;
  const simulateMtimeChange = params.simulateMtimeChange === true;
  const simulateFirstRun = params.simulateFirstRun === true;
  const simulateYamlContent =
    typeof params.simulateYamlContent === "string"
      ? params.simulateYamlContent
      : undefined;

  const fromCache = guidesLoaded;

  // Load guides on first call
  if (!guidesLoaded) {
    loadFixtures({ simulateMissing, simulateCorrupt });
    await loadFromDisk();
    ensureGenericGuide();
    guidesLoaded = true;
  }

  // Handle simulateYamlContent — parse injected content directly
  if (simulateYamlContent !== undefined) {
    const injectedSlug = type || "injected";

    // SEC-09: Reject content with JS execution tags even without frontmatter
    const hasJsExecTag = /!!js\b/i.test(simulateYamlContent);

    const injectedGuide = buildGuide(
      injectedSlug,
      simulateYamlContent,
      "<injected>",
    );
    const yamlFailed = yamlFailedSlugs.has(injectedSlug) || hasJsExecTag;

    if (!yamlFailed) {
      // Valid YAML — return the injected guide
      return {
        guide: injectedGuide,
        yamlFallback: undefined,
        fromCache: false,
        reloaded: false,
        sourceModified: false,
        jsExecutionPrevented: true,
        aliasExpansionLimited: true,
        expansionCount: 0,
      };
    }
    // YAML failed (JS tag, broken syntax, etc.) — return generic guide (SEC-09)
    yamlFailedSlugs.delete(injectedSlug);
    const generic =
      guidesByType.get("_generic") ??
      buildGuide("_generic", EMBEDDED_GENERIC_CONTENT, "<builtin>/_generic.md");
    return {
      guide: generic,
      isGeneric: true,
      is_generic: true,
      mode: "adaptive" as const,
      signal: `YAML content rejected (SEC-09). Returning generic guide.`,
      yamlFallback: true,
      fromCache: false,
      reloaded: false,
      sourceModified: false,
      jsExecutionPrevented: true,
      aliasExpansionLimited: true,
      expansionCount: 0,
    };
  }

  // Mtime handling
  let mtimeIndexPopulated = false;
  let sourceModified = false;

  if (simulateFirstRun) {
    _mtimeIndexInitialized = false;
    mtimeIndex.clear();
    // Populate mtime index from current guides — no source updates
    for (const [, g] of guidesByType) {
      mtimeIndex.set(g.slug, Date.now());
    }
    _mtimeIndexInitialized = true;
    mtimeIndexPopulated = true;
  }

  if (simulateMtimeChange) {
    const g = guidesByType.get(type);
    if (
      g &&
      (g.metadata.source === "ai_generated" ||
        g.metadata.source === "community")
    ) {
      const updated: TypeGuide = {
        ...g,
        metadata: {
          ...g.metadata,
          source: "user_edited" as TypeGuideSource,
        },
      };
      guidesByType.set(type, updated);
      sourceModified = true;
    }
  }

  // Resolution: exact → alias → generic (COMPAT-07)
  let guide: TypeGuide | undefined;
  let matchedViaAlias = false;
  let aliasUsed: string | undefined;
  let isGeneric = false;

  // 1. Exact match
  guide = guidesByType.get(type);

  // 2. Alias match
  if (!guide) {
    const targetType = aliasIndex.get(type);
    if (targetType) {
      guide = guidesByType.get(targetType);
      if (guide) {
        matchedViaAlias = true;
        aliasUsed = type;
      }
    }
  }

  // 3. Generic fallback (COMPAT-08)
  if (!guide) {
    guide = guidesByType.get("_generic");
    isGeneric = true;
  }

  // Safety net — regenerate generic if somehow missing
  if (!guide) {
    guide = buildGuide(
      "_generic",
      EMBEDDED_GENERIC_CONTENT,
      "<builtin>/_generic.md",
    );
    isGeneric = true;
  }

  // YAML fallback flag
  const yamlFallback = yamlFailedSlugs.has(guide.slug) || undefined;

  // Parent resolution
  let parentGuide: TypeGuide | undefined;
  let circularDetected = false;

  if (guide.metadata.parentType) {
    const result = resolveParent(guide);
    parentGuide = result.parent;
    circularDetected = result.circular;
  }

  // Signal for generic fallback (RESP-02)
  let signal: string | undefined;
  if (isGeneric) {
    signal = `No type guide found for type '${type}'. Returning the generic adaptive guide. Once you complete a project setup conversation for this type, call brief_create_type_guide to create a domain-specific guide that will be used for future projects of this type.`;
  }

  return {
    guide,
    matchedViaAlias: matchedViaAlias || undefined,
    aliasUsed,
    isGeneric: isGeneric || undefined,
    is_generic: isGeneric || undefined,
    mode: isGeneric ? ("adaptive" as const) : undefined,
    signal,
    yamlFallback,
    parentGuide,
    circularDetected: circularDetected || undefined,
    reloaded: sourceModified,
    fromCache,
    mtimeIndexPopulated: mtimeIndexPopulated || undefined,
    sourceModified,
    jsExecutionPrevented: true,
    aliasExpansionLimited: true,
    expansionCount: 0,
  };
}

/** @deprecated Use getTypeGuide */
export const loadTypeGuide = getTypeGuide;

/** @internal Reset module-level state (guide cache, mtime index) between tests */
export function _resetState(): void {
  guidesByType = new Map();
  aliasIndex = new Map();
  yamlFailedSlugs = new Set();
  guidesLoaded = false;
  mtimeIndex = new Map();
  _mtimeIndexInitialized = false;
}

/** Read-only accessor for loaded type guides (used by search module). */
export function getLoadedGuides(): ReadonlyMap<string, TypeGuide> {
  return guidesByType;
}

/** Read-only accessor for alias index (used by search module). */
export function getAliasIndex(): ReadonlyMap<string, string> {
  return aliasIndex;
}
