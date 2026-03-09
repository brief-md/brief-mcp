// src/ontology/creation.ts — WP5: AI-assisted ontology creation (OQ-6)
// Creates ontology packs programmatically, optionally using MCP sampling for AI generation.

import type { SamplingFn } from "../validation/semantic-conflicts.js"; // check-rules-ignore
import { installPack } from "./management.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreateOntologyParams {
  name: string;
  description: string;
  extensionContext?: string;
  projectType?: string;
  domainKeywords?: string[];
  entryCount?: number;
}

export interface CreateOntologyResult {
  created: boolean;
  packName: string;
  entryCount: number;
  trustLevel: string;
  validated: boolean;
  installed: boolean;
  warnings: string[];
  signal?: string;
}

// ---------------------------------------------------------------------------
// Template generation (fallback when sampling unavailable)
// ---------------------------------------------------------------------------

function generateTemplatePack(params: CreateOntologyParams): {
  name: string;
  version: string;
  description: string;
  entries: Array<{
    id: string;
    label: string;
    description: string;
    keywords: string[];
  }>;
} {
  const { name, description, domainKeywords = [] } = params;
  const targetCount = Math.min(params.entryCount ?? 20, 100);

  // Generate placeholder entries from domain keywords
  const entries: Array<{
    id: string;
    label: string;
    description: string;
    keywords: string[];
  }> = [];

  for (let i = 0; i < Math.min(targetCount, domainKeywords.length); i++) {
    const kw = domainKeywords[i];
    const id = kw
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 50);
    if (id) {
      entries.push({
        id,
        label: kw,
        description: `Entry for ${kw} in the ${name} ontology.`,
        keywords: [kw.toLowerCase()],
      });
    }
  }

  // Fill remaining with numbered placeholders
  while (entries.length < targetCount) {
    const n = entries.length + 1;
    entries.push({
      id: `entry-${n}`,
      label: `Entry ${n}`,
      description: `Placeholder entry ${n}. Replace with domain-specific content.`,
      keywords: [],
    });
  }

  return {
    name,
    version: "1.0.0",
    description,
    entries,
  };
}

// ---------------------------------------------------------------------------
// AI prompt construction
// ---------------------------------------------------------------------------

function buildGenerationPrompt(params: CreateOntologyParams): string {
  const {
    name,
    description,
    extensionContext,
    projectType,
    domainKeywords,
    entryCount = 20,
  } = params;

  return `Generate a structured ontology pack in JSON format for the following domain:

Pack name: ${name}
Description: ${description}
${projectType ? `Project type: ${projectType}` : ""}
${extensionContext ? `Extension context: ${extensionContext}` : ""}
${domainKeywords?.length ? `Domain keywords: ${domainKeywords.join(", ")}` : ""}
Target entry count: ${entryCount}

Return ONLY valid JSON matching this schema:
{
  "name": "${name}",
  "version": "1.0.0",
  "description": "${description}",
  "entries": [
    {
      "id": "lowercase-hyphenated-id",
      "label": "Human Readable Label",
      "description": "Brief description of this concept",
      "keywords": ["keyword1", "keyword2"],
      "synonyms": ["alt-name1"]
    }
  ]
}

Rules:
- Entry IDs must be alphanumeric with hyphens/underscores only
- Each entry needs: id (required), label (required), description, keywords array
- Generate exactly ${entryCount} entries covering the domain comprehensively
- Keywords should be lowercase
- Return ONLY the JSON, no markdown fences or explanation`;
}

// ---------------------------------------------------------------------------
// Parse AI response
// ---------------------------------------------------------------------------

function parseAiResponse(text: string): Record<string, unknown> | null {
  // Try direct JSON parse
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    // Try extracting JSON from markdown code block
    const jsonMatch = /```(?:json)?\s*\n?([\s\S]*?)\n?```/.exec(text);
    if (jsonMatch?.[1]) {
      try {
        return JSON.parse(jsonMatch[1]) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// Validate pack structure (lightweight check before installPack)
// ---------------------------------------------------------------------------

function validatePack(data: Record<string, unknown>): {
  valid: boolean;
  error?: string;
} {
  if (!data.name || typeof data.name !== "string") {
    return { valid: false, error: "Missing or invalid 'name' field" };
  }
  if (!Array.isArray(data.entries)) {
    return { valid: false, error: "Missing or invalid 'entries' array" };
  }
  for (const entry of data.entries as Array<Record<string, unknown>>) {
    if (!entry.id || typeof entry.id !== "string") {
      return { valid: false, error: `Entry missing 'id' field` };
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(entry.id)) {
      return { valid: false, error: `Invalid entry ID: ${entry.id}` };
    }
    if (!entry.label || typeof entry.label !== "string") {
      return {
        valid: false,
        error: `Entry '${entry.id}' missing 'label' field`,
      };
    }
  }
  return { valid: true };
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

export async function createOntology(
  params: CreateOntologyParams,
  samplingFn?: SamplingFn,
): Promise<CreateOntologyResult> {
  const { name, description } = params;
  const warnings: string[] = [];

  if (!name || name.trim().length === 0) {
    throw new Error("Ontology name is required.");
  }
  if (!description || description.trim().length === 0) {
    throw new Error("Ontology description is required.");
  }

  // Sanitize name for use as pack identifier
  const packName = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);

  if (!packName) {
    throw new Error(
      `Pack name "${name}" produces an empty identifier after sanitisation.`,
    );
  }

  let packData: {
    name: string;
    version: string;
    description: string;
    entries: Array<Record<string, unknown>>;
  };

  let trustLevel = "ai_generated";

  // --- Try AI generation via sampling ---
  if (samplingFn) {
    try {
      const prompt = buildGenerationPrompt({ ...params, name: packName });
      const response = await samplingFn({
        messages: [
          {
            role: "user",
            content: { type: "text", text: prompt },
          },
        ],
        maxTokens: 8192,
        systemPrompt:
          "You are an ontology expert. Generate structured ontology packs in JSON format. Return only valid JSON.",
      });

      // Extract text from response
      const responseText =
        typeof response.content === "string"
          ? response.content
          : Array.isArray(response.content)
            ? (response.content as Array<{ type: string; text?: string }>)
                .filter((c) => c.type === "text" && c.text)
                .map((c) => c.text)
                .join("")
            : "";

      const parsed = parseAiResponse(responseText);
      if (!parsed) {
        warnings.push(
          "AI response could not be parsed as JSON. Falling back to template.",
        );
        packData = generateTemplatePack({ ...params, name: packName });
        trustLevel = "template";
      } else {
        const validation = validatePack(parsed);
        if (!validation.valid) {
          warnings.push(
            `AI-generated pack failed validation: ${validation.error}. Falling back to template.`,
          );
          packData = generateTemplatePack({ ...params, name: packName });
          trustLevel = "template";
        } else {
          packData = {
            name: packName,
            version: (parsed.version as string) ?? "1.0.0",
            description: (parsed.description as string) ?? description,
            entries: parsed.entries as Array<Record<string, unknown>>,
          };
        }
      }
    } catch (err: unknown) {
      warnings.push(
        `AI generation failed: ${(err as Error).message}. Falling back to template.`,
      );
      packData = generateTemplatePack({ ...params, name: packName });
      trustLevel = "template";
    }
  } else {
    // No sampling available — generate template
    packData = generateTemplatePack({ ...params, name: packName });
    trustLevel = "template";
    warnings.push(
      "Sampling not available. Template pack created with placeholder entries.",
    );
  }

  // --- Install the pack ---
  try {
    await installPack({
      name: packData.name,
      entries: packData.entries,
    });
  } catch (err: unknown) {
    return {
      created: false,
      packName: packData.name,
      entryCount: packData.entries.length,
      trustLevel,
      validated: false,
      installed: false,
      warnings: [...warnings, `Installation failed: ${(err as Error).message}`],
    };
  }

  return {
    created: true,
    packName: packData.name,
    entryCount: packData.entries.length,
    trustLevel,
    validated: true,
    installed: true,
    warnings,
    signal:
      trustLevel === "template"
        ? "Template pack created. Edit entries to add domain-specific content, or retry with AI sampling enabled."
        : `AI-generated pack with ${packData.entries.length} entries installed successfully.`,
  };
}
