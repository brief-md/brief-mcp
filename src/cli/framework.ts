// src/cli/framework.ts — stub for TASK-47

export function detectTTY(options?: {
  isTTY?: boolean;
  yesFlag?: boolean;
  [key: string]: unknown;
}): {
  interactive: boolean;
  errorIfInteractive?: string;
  acceptDefaults?: boolean;
  progressMode?: string;
  [key: string]: unknown;
} {
  const isTTY = options?.isTTY ?? process.stdout.isTTY === true;
  const yesFlag = options?.yesFlag ?? false;

  if (isTTY) {
    return { interactive: true, progressMode: "spinner" };
  }
  if (yesFlag) {
    return {
      interactive: false,
      acceptDefaults: true,
      progressMode: "status-lines",
    };
  }
  return {
    interactive: false,
    errorIfInteractive:
      "Non-interactive terminal: use --yes flag or run in a terminal",
    progressMode: "status-lines",
  };
}

export function resolveLogLevel(_options?: Record<string, unknown>): string {
  return "info";
}

export function resolveColorMode(_options?: Record<string, unknown>): string {
  return "auto";
}

export async function parseArgs(
  _argv?: string[],
): Promise<{ exitCode: number; [key: string]: unknown }> {
  return { exitCode: 0 };
}

export async function getLogTarget(_level?: string): Promise<string> {
  return "stderr";
}
