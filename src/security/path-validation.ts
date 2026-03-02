// src/security/path-validation.ts — stub for TASK-05a
// Replace with real implementation during build loop.

import type { SecurityLimitCheck } from "../types/security.js";

export async function validatePath(
  _inputPath: string,
  _allowedRoots: string[],
): Promise<string> {
  throw new Error("Not implemented: validatePath");
}

export function checkSecurityLimits(_options: SecurityLimitCheck): void {
  throw new Error("Not implemented: checkSecurityLimits");
}

export function slugify(_name: string): string {
  throw new Error("Not implemented: slugify");
}

export async function setFilePermissions(
  _filePath: string,
  _type: "file" | "dir",
): Promise<void> {
  throw new Error("Not implemented: setFilePermissions");
}

export async function acquireFileDescriptor(): Promise<() => void> {
  throw new Error("Not implemented: acquireFileDescriptor");
}

export function toStoragePath(_p: string): string {
  throw new Error("Not implemented: toStoragePath");
}

export function toNativePath(_p: string): string {
  throw new Error("Not implemented: toNativePath");
}
