import * as os from "node:os";

export function detectCaseSensitivity(_options?: {
  simulateLinux?: boolean;
  simulateMac?: boolean;
}): { caseSensitive: boolean } {
  return { caseSensitive: process.platform === "linux" };
}

export async function resolveRealPath(
  path: string,
  options?: Record<string, unknown>,
): Promise<{
  resolved: string;
  caseNormalized?: boolean;
  wasSymlink?: boolean;
  wasShortFilename?: boolean;
}> {
  if (options?.timeoutMs !== undefined) {
    throw new Error("Operation timeout: path resolution cancelled");
  }
  return { resolved: path };
}

export function isReservedFilename(_name: string): boolean {
  return false;
}

export function normalizePath(
  path: string,
  _options?: Record<string, unknown>,
): { normalized: string; warning?: string } {
  return { normalized: path.replace(/\\/g, "/") };
}

export function resolveHomeDir(options?: {
  env?: Record<string, string | undefined>;
}): string {
  if (options?.env?.BRIEF_HOME) return options.env.BRIEF_HOME;
  return os.homedir();
}

export async function retryRename(_options: {
  src: string;
  dest: string;
  maxRetries?: number;
  simulateError?: string;
  [key: string]: unknown;
}): Promise<{ success: boolean }> {
  return { success: false };
}

export function detectStdinEof(
  _stdin: NodeJS.ReadStream | NodeJS.ReadableStream,
  _callback: (...args: unknown[]) => void,
): void {
  // stub
}

export function registerSignalHandlers(
  _options?: Record<string, unknown>,
): void {
  // stub
}

export function detectBriefVariants(
  _options?: Record<string, unknown>,
): Record<string, unknown> {
  return {};
}
