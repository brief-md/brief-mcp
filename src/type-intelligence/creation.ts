export async function createTypeGuide(
  _params: Record<string, unknown>,
): Promise<{
  created: boolean;
  filePath?: string;
  frontmatter?: string;
  createdByProject?: string;
  [key: string]: unknown;
}> {
  return { created: false };
}
