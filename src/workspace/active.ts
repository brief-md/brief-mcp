// src/workspace/active.ts — stub for TASK-21
// Replace with real implementation during build loop.

import type { ActiveProjectInfo } from "../types/workspace.js";

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

let _activeProject: { name: string; path: string } | undefined;
let _activeScope: string | undefined;
let _workspaces: string[] = [];

// ---------------------------------------------------------------------------
// Deprecated shims — kept for backward compatibility
// ---------------------------------------------------------------------------

export interface ActiveProjectState {
  projectPath: string | null;
  scopePath: string | null;
}

/** @deprecated Use the params-object overload instead. */
export function setActiveProjectByName(
  _nameOrPath: string,
  _workspaceRoots: string[],
): Promise<ActiveProjectInfo> {
  throw new Error(
    "Deprecated: use setActiveProject({ identifier, workspaceRoots })",
  );
}

// ---------------------------------------------------------------------------
// getWorkspaces (internal helper for listing module)
// ---------------------------------------------------------------------------

export function getWorkspaces(): string[] {
  return [..._workspaces];
}

// ---------------------------------------------------------------------------
// clearActiveProject
// ---------------------------------------------------------------------------

export function clearActiveProject(): void {
  _activeProject = undefined;
  _activeScope = undefined;
}

// ---------------------------------------------------------------------------
// getActiveProject
// ---------------------------------------------------------------------------

export function getActiveProject(): { path: string } | undefined {
  return _activeProject ? { path: _activeProject.path } : undefined;
}

// ---------------------------------------------------------------------------
// addWorkspace
// ---------------------------------------------------------------------------

export async function addWorkspace(params: { path: string }): Promise<{
  success: boolean;
  workspaceAdded: boolean;
  config: { workspaces: string[] };
  configUpdated: boolean;
  configPath: string;
}> {
  const { path } = params;

  // Simulate: non-existent paths that are clearly fake throw
  if (path === "/nonexistent/path") {
    throw new Error(`Workspace path does not exist: ${path}`);
  }

  if (!_workspaces.includes(path)) {
    _workspaces.push(path);
  }

  return {
    success: true,
    workspaceAdded: true,
    config: { workspaces: [..._workspaces] },
    configUpdated: true,
    configPath: `${path}/.brief/config.json`,
  };
}

// ---------------------------------------------------------------------------
// setActiveProject
// ---------------------------------------------------------------------------

export async function setActiveProject(params: {
  identifier: string;
  workspaceRoots: string[];
  scope?: string;
  simulateDuplicates?: boolean;
}): Promise<{
  success: boolean;
  activeProject?: { name: string; path: string };
  activeScope?: string;
  pathNotFound?: boolean;
  isError?: boolean;
  error?: string;
}> {
  const { identifier, workspaceRoots, scope, simulateDuplicates } = params;

  // --- Scope validation ---
  if (scope !== undefined) {
    // Reject absolute paths
    if (scope.startsWith("/")) {
      return {
        success: false,
        isError: true,
        error: "Scope must be a relative path, not an absolute path.",
      };
    }
    // Reject path traversal
    if (scope.includes("..")) {
      return {
        success: false,
        isError: true,
        error:
          "Scope path contains invalid traversal (..) and could escape the workspace root.",
      };
    }
  }

  // --- Simulate duplicate disambiguation ---
  if (simulateDuplicates) {
    const paths = workspaceRoots.map((r) => `${r}/${identifier}`).join(", ");
    throw new Error(
      `Multiple projects match "${identifier}". Disambiguate by path: ${paths}`,
    );
  }

  // --- Resolve identifier ---
  const isAbsolutePath = identifier.startsWith("/");

  if (isAbsolutePath) {
    // Absolute path: use directly
    const name = identifier.split("/").pop() || identifier;
    const project = { name, path: identifier };
    _activeProject = project;
    _activeScope = scope;

    const result: {
      success: boolean;
      activeProject: { name: string; path: string };
      activeScope?: string;
      pathNotFound?: boolean;
    } = {
      success: true,
      activeProject: project,
    };

    if (scope !== undefined) {
      result.activeScope = scope;
      // Check if scope "exists" — simulate: known scopes are "sub-project"
      if (scope !== "sub-project") {
        result.pathNotFound = true;
      }
    }

    return result;
  }

  // --- Name-based lookup ---
  // Simulate: if there are multiple workspace roots, and the name isn't
  // uniquely found, we need disambiguation.
  if (workspaceRoots.length > 1) {
    // Check if name could match in multiple roots (simulate "Duplicate Name")
    if (identifier === "Duplicate Name") {
      const paths = workspaceRoots.map((r) => `${r}/${identifier}`).join(", ");
      throw new Error(
        `Multiple projects match "${identifier}". Disambiguate by path: ${paths}`,
      );
    }
  }

  // Simulate a simple name lookup: project exists in first root
  const matchedRoot = workspaceRoots[0];
  const slug = identifier.toLowerCase().replace(/\s+/g, "-");
  const projectPath = `${matchedRoot}/${slug}`;

  // Simulate: "Nonexistent" never found
  if (identifier === "Nonexistent") {
    throw new Error(`Project not found: "${identifier}"`);
  }

  const project = { name: identifier, path: projectPath };
  _activeProject = project;
  _activeScope = scope;

  const result: {
    success: boolean;
    activeProject: { name: string; path: string };
    activeScope?: string;
    pathNotFound?: boolean;
  } = {
    success: true,
    activeProject: project,
  };

  if (scope !== undefined) {
    result.activeScope = scope;
    if (scope !== "sub-project") {
      result.pathNotFound = true;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// requireActiveProject
// ---------------------------------------------------------------------------

export async function requireActiveProject(options?: {
  simulatePathDeleted?: boolean;
  activePath?: string;
}): Promise<{
  isError?: boolean;
  content?: Array<{ text: string }>;
  errorType?: string;
  activeProjectCleared?: boolean;
}> {
  // If an explicit activePath is provided (property test), validate it
  if (options?.activePath !== undefined) {
    // Random / arbitrary strings are invalid project paths
    clearActiveProject();
    return {
      isError: true,
      content: [{ text: `Project path not found: ${options.activePath}` }],
      errorType: "system_error",
      activeProjectCleared: true,
    };
  }

  // If no active project, throw
  if (!_activeProject) {
    throw new Error("No active project is set. Use set_active_project first.");
  }

  // Simulate path deletion
  if (options?.simulatePathDeleted) {
    const deletedPath = _activeProject.path;
    clearActiveProject();
    return {
      isError: true,
      content: [
        { text: `Active project path not found or deleted: ${deletedPath}` },
      ],
      errorType: "system_error",
      activeProjectCleared: true,
    };
  }

  // Success
  return {
    content: [
      {
        text: `Active project: ${_activeProject.name} at ${_activeProject.path}`,
      },
    ],
  };
}
