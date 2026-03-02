// src/workspace/creation.ts — stub for TASK-22
// Replace with real implementation during build loop.

export interface CreateProjectParams {
  projectName: string;
  displayName?: string;
  type: string;
  workspaceRoot?: string;
  parentProject?: string;
  whatThisIs?: string;
  whatThisIsNot?: string;
  whyThisExists?: string;
}

export interface CreateProjectResult {
  projectPath: string;
  filePath: string;
  created: boolean;
  initializedExisting?: boolean;
  firstProject?: boolean;
  suggestExtensions?: boolean;
}

export interface CreateSubProjectParams {
  name: string;
  displayName?: string;
  type?: string;
  subdirectory?: string;
  whatThisIs?: string;
  parentPath?: string;
}

export async function createProject(
  _params: CreateProjectParams,
): Promise<CreateProjectResult> {
  throw new Error("Not implemented: createProject");
}

export async function createSubProject(
  _params: CreateSubProjectParams,
): Promise<CreateProjectResult> {
  throw new Error("Not implemented: createSubProject");
}

export function slugifyProjectName(_name: string): string {
  throw new Error("Not implemented: slugifyProjectName");
}

export async function isFirstProject(
  _workspaceRoots: string[],
): Promise<boolean> {
  throw new Error("Not implemented: isFirstProject");
}
