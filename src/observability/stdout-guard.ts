// src/observability/stdout-guard.ts

import type { Logger } from "./logger.js";

let origConsoleLog: ((...args: unknown[]) => void) | null = null;
let origConsoleInfo: ((...args: unknown[]) => void) | null = null;
let guardLogger: Logger | null = null;

export function installStdoutGuard(logger: Logger): void {
  if (origConsoleLog !== null) {
    // Guard already installed — update logger reference only
    guardLogger = logger;
    return;
  }
  guardLogger = logger;
  origConsoleLog = console.log as (...args: unknown[]) => void;
  origConsoleInfo = console.info as (...args: unknown[]) => void;

  console.log = (...args: unknown[]): void => {
    guardLogger?.info(`[console.log] ${args.map(String).join(" ")}`);
  };

  console.info = (...args: unknown[]): void => {
    guardLogger?.info(`[console.info] ${args.map(String).join(" ")}`);
  };
}

export function removeStdoutGuard(): void {
  if (origConsoleLog !== null) {
    console.log = origConsoleLog as typeof console.log;
    origConsoleLog = null;
  }
  if (origConsoleInfo !== null) {
    console.info = origConsoleInfo as typeof console.info;
    origConsoleInfo = null;
  }
  guardLogger = null;
}
