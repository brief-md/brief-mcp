// src/assets/bundled-content.ts — stub for TASK-53

export function loadGenericGuide(_params?: Record<string, unknown>): {
  content: string;
  frontmatter: Record<string, unknown>;
  body: string;
  is_generic: boolean;
  filePath?: string;
  version?: string;
  [key: string]: unknown;
} {
  return {
    content: "",
    frontmatter: {
      bootstrapping: true,
      type: "_generic",
      source: "bundled",
      version: "1.0.0",
    },
    body: "",
    is_generic: true,
  };
}

export async function verifyGenericGuide(
  _params?: Record<string, unknown>,
): Promise<{
  valid: boolean;
  errors?: string[];
  mode?: string;
  [key: string]: unknown;
}> {
  return { valid: false, mode: "adaptive" };
}

export async function installBundledContent(
  _params?: Record<string, unknown>,
): Promise<{
  installed: boolean;
  filesWritten?: string[];
  guideOverwritten?: boolean;
  [key: string]: unknown;
}> {
  return { installed: false };
}

export function getExtensionDefinitions(
  _params?: Record<string, unknown>,
): Array<{ name: string; [key: string]: unknown }> {
  return [];
}
