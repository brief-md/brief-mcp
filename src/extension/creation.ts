export async function addExtension(_params: {
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
  return {
    created: false,
    alreadyExists: false,
    subsections: [],
    metadataFormat: "",
    headingFormat: "",
    metadataKey: "",
  };
}

/** @deprecated Use addExtension */
export const createExtension = addExtension;

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
  return { extensions: [] };
}

export function resolveSubsectionTarget(_target: string): {
  extensionName: string;
  subsectionName: string;
} {
  return { extensionName: "", subsectionName: "" };
}

/** @internal Reset module-level state for test isolation */
export function _resetState(): void {
  /* clear all module-level state */
}
