export async function addExtension(_params: Record<string, unknown>): Promise<{
  created: boolean;
  alreadyExists: boolean;
  filePath?: string;
  subsections?: string[];
  [key: string]: unknown;
}> {
  return { created: false, alreadyExists: false };
}

/** @deprecated Use addExtension */
export const createExtension = addExtension;

export async function listExtensions(
  _params?: Record<string, unknown>,
): Promise<{
  extensions: Array<{ name: string; [key: string]: unknown }>;
  [key: string]: unknown;
}> {
  return { extensions: [] };
}

export function resolveSubsectionTarget(
  _params?: string | Record<string, unknown>,
): {
  target: string;
  extensionName?: string;
  subsectionName?: string;
  [key: string]: unknown;
} {
  return { target: "" };
}
