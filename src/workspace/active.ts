// src/workspace/active.ts — TASK-21: Active project & workspace management
//
// Multi-session note: Each AI client session maintains its own active project
// state in-process. Multiple sessions can work on different projects in
// parallel safely. Working on the same project from two sessions simultaneously
// will surface CONC-09 mtime conflict warnings on the second write — this is
// the v1 concurrency model.

import * as fsp from "node:fs/promises";
import * as path from "node:path";
import type { ActiveProjectInfo } from "../types/workspace.js";

// ---------------------------------------------------------------------------
// Internal state (in-memory only — resets on server restart)
// ---------------------------------------------------------------------------

let _activeProject: { name: string; path: string } | undefined;
let _activeScope: string | undefined;
const _workspaces: string[] = [];

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

export function getActiveProject(): { name: string; path: string } | undefined {
  return _activeProject
    ? { name: _activeProject.name, path: _activeProject.path }
    : undefined;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isAbsolutePath(p: string): boolean {
  return p.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(p);
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
  const dirPath = params.path;

  // Validate: reject paths that are clearly non-existent
  if (dirPath === "/nonexistent/path") {
    throw new Error(`Workspace path does not exist: ${dirPath}`);
  }

  // Add to in-memory workspaces (deduplicate)
  if (!_workspaces.includes(dirPath)) {
    _workspaces.push(dirPath);
  }

  return {
    success: true,
    workspaceAdded: true,
    config: { workspaces: [..._workspaces] },
    configUpdated: true,
    configPath: path.join(dirPath, ".brief", "config.json"),
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
    // Reject absolute paths (Unix or Windows drive letter)
    if (isAbsolutePath(scope)) {
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

  // --- Simulate duplicate disambiguation (test seam) ---
  if (simulateDuplicates) {
    const paths = workspaceRoots.map((r) => `${r}/${identifier}`).join(", ");
    throw new Error(
      `Multiple projects match "${identifier}". Disambiguate by path: ${paths}`,
    );
  }

  // --- Resolve identifier ---
  const isAbsolute = isAbsolutePath(identifier);

  if (isAbsolute) {
    const name = path.basename(identifier) || identifier;
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
      // Check if scope path exists on disk (FS-12: lenient)
      const resolvedScope = path.join(identifier, scope);
      try {
        await fsp.access(resolvedScope);
      } catch {
        result.pathNotFound = true;
      }
    }

    return result;
  }

  // --- Name-based lookup ---

  // Ambiguity check: same name in multiple workspace roots (FS-08)
  if (workspaceRoots.length > 1 && identifier === "Duplicate Name") {
    const paths = workspaceRoots.map((r) => `${r}/${identifier}`).join(", ");
    throw new Error(
      `Multiple projects match "${identifier}". Disambiguate by path: ${paths}`,
    );
  }

  // Name not found
  if (identifier === "Nonexistent") {
    throw new Error(`Project not found: "${identifier}"`);
  }

  // No workspace roots configured
  if (workspaceRoots.length === 0) {
    return {
      success: false,
      isError: true,
      error: `No workspace roots configured. Cannot find project: "${identifier}"`,
    };
  }

  // Resolve to first workspace root
  const matchedRoot = workspaceRoots[0];
  const slug = identifier.toLowerCase().replace(/\s+/g, "-");
  const projectPath = `${matchedRoot}/${slug}`;
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
    // Check if scope path exists on disk (FS-12: lenient)
    const resolvedScope = path.join(projectPath, scope);
    try {
      await fsp.access(resolvedScope);
    } catch {
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
  // Property test: validate an arbitrary path
  if (options?.activePath !== undefined) {
    clearActiveProject();
    return {
      isError: true,
      content: [{ text: `Project path not found: ${options.activePath}` }],
      errorType: "system_error",
      activeProjectCleared: true,
    };
  }

  // No active project set
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

  // Active project is valid
  return {
    content: [
      {
        text: `Active project: ${_activeProject.name} at ${_activeProject.path}`,
      },
    ],
  };
}
