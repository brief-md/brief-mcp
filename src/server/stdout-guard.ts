// src/server/stdout-guard.ts — re-exports from observability/stdout-guard
// with additional helpers for CI pipeline tests (OBS-11)

import { createLogger } from "../observability/logger.js";
import {
  installStdoutGuard as _installStdoutGuard,
  removeStdoutGuard,
} from "../observability/stdout-guard.js";

export { removeStdoutGuard };

/**
 * Install the stdout guard. When called without arguments, creates a default
 * logger internally so the guard can be used without requiring an external
 * logger instance (matches CI test expectations).
 */
export function installStdoutGuard(): void {
  const logger = createLogger({ module: "stdout-guard" });
  _installStdoutGuard(logger);
}

/**
 * Capture all stdout output produced during the execution of a callback.
 * Returns the captured string. Used for verifying stdout purity (OBS-11).
 */
export async function captureStdout(fn: () => Promise<void>): Promise<string> {
  const chunks: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);

  process.stdout.write = ((chunk: string | Buffer | Uint8Array): boolean => {
    chunks.push(
      typeof chunk === "string" ? chunk : Buffer.from(chunk).toString(),
    );
    return true;
  }) as typeof process.stdout.write;

  try {
    await fn();
  } finally {
    process.stdout.write = originalWrite;
  }

  return chunks.join("");
}
