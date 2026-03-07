// src/cli/framework.ts — stub for TASK-47

export function detectTTY(options: { isTTY: boolean; yesFlag?: boolean }): {
  interactive: boolean;
  errorIfInteractive?: string;
  acceptDefaults?: boolean;
  progressMode: "spinner" | "status-lines";
} {
  const isTTY = options.isTTY;
  const yesFlag = options.yesFlag ?? false;

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

export function resolveLogLevel(_options?: {
  verbose?: boolean;
  quiet?: boolean;
  env?: Record<string, string>;
}): string {
  return "info";
}

export function resolveColorMode(_options: {
  env?: Record<string, string>;
  noColor?: boolean;
  isTTY: boolean;
}): string {
  return "auto";
}

export async function parseArgs(
  _argv?: string[],
): Promise<{ exitCode: 0 | 1 | 2; output?: string; workspaceRoot?: string }> {
  return { exitCode: 0 };
}

export async function getLogTarget(_level?: string): Promise<string> {
  return "stderr";
}
