// src/assets/bundled-content.ts — stub for TASK-53

/**
 * The 10 Universal Project Dimensions — bedrock fallback constant.
 * If BOTH ~/.brief/type-guides/_generic.md AND dist/assets/type-guides/_generic.md
 * are missing or corrupt, regenerate from this hardcoded constant.
 */
export const UNIVERSAL_DIMENSIONS: ReadonlyArray<{
  name: string;
  description: string;
}> = [
  { name: "Purpose", description: "The core intent of the project" },
  { name: "Audience", description: "Who will consume the output" },
  { name: "Tone", description: "The emotional register and voice" },
  { name: "Structure", description: "How content is organized" },
  { name: "Scope", description: "Boundaries of the project" },
  { name: "Identity", description: "The unique character of the work" },
  { name: "Vision", description: "The aspirational end state" },
  { name: "Direction", description: "Creative or strategic trajectory" },
  { name: "Constraints", description: "Limitations and requirements" },
  { name: "Timeline", description: "Temporal scope and milestones" },
];

export function loadGenericGuide(_params?: Record<string, unknown>): {
  content: string;
  frontmatter: Record<string, unknown>;
  body: string;
  is_generic: boolean;
  filePath?: string;
  version?: string;
  [key: string]: unknown;
} {
  throw new Error("Not implemented");
}

export async function verifyGenericGuide(
  _params?: Record<string, unknown>,
): Promise<{
  valid: boolean;
  actionNeeded?: boolean;
  regenerated?: boolean;
  errors?: string[];
  mode?: string;
  [key: string]: unknown;
}> {
  throw new Error("Not implemented");
}

export async function installBundledContent(
  _params?: Record<string, unknown>,
): Promise<{
  installed: boolean;
  directoryCreated?: boolean;
  guideInstalled?: boolean;
  filesWritten?: string[];
  guideOverwritten?: boolean;
  [key: string]: unknown;
}> {
  throw new Error("Not implemented");
}

export function getExtensionDefinitions(
  _params?: Record<string, unknown>,
): Array<{ name: string; [key: string]: unknown }> {
  throw new Error("Not implemented");
}

/**
 * Three-tier guide resolution:
 *   Tier 1: type-specific guide exists → served directly
 *   Tier 2: no type-specific guide, generic guide exists → served with is_generic: true, mode: adaptive
 *   Tier 3: no guides at all → universal dimensions constant served
 */
export async function resolveGuide(_params?: Record<string, unknown>): Promise<{
  tier: number;
  is_generic: boolean;
  mode?: string;
  universalDimensions?: ReadonlyArray<{ name: string; description: string }>;
  [key: string]: unknown;
}> {
  throw new Error("Not implemented");
}
