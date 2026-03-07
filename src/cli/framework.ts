// src/cli/framework.ts — TASK-47 CLI framework

import { readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

const KNOWN_FLAGS = new Set([
  "--help",
  "-h",
  "--version",
  "-V",
  "--verbose",
  "-v",
  "--quiet",
  "-q",
  "--no-color",
  "--yes",
  "-y",
  "--workspace-root",
]);

function getHelpText(): string {
  return [
    "brief-mcp — MCP server for BRIEF.md project context files",
    "",
    "Usage: brief-mcp [options] [workspace-root]",
    "",
    "Options:",
    "  -h, --help       Show this help message",
    "  -V, --version    Show version number",
    "  -v, --verbose    Set log level to debug",
    "  -q, --quiet      Suppress all output except errors",
    "  --no-color       Disable ANSI color codes",
    "  -y, --yes        Accept all defaults without prompting",
  ].join("\n");
}

function getVersion(): string {
  try {
    const pkgPath = resolve(__dirname, "../../package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/**
 * Parse CLI arguments and return structured result with exit code.
 * --help → exitCode 0 + output. --version → exitCode 0 + output.
 * Unknown flag → exitCode 2 + output.
 */
export async function parseArgs(argv?: string[]): Promise<{
  exitCode: 0 | 1 | 2;
  output?: string;
  workspaceRoot?: string;
}> {
  const args = argv ?? process.argv.slice(2);

  // --help / -h takes highest priority
  if (args.includes("--help") || args.includes("-h")) {
    return { exitCode: 0, output: getHelpText() };
  }

  // --version / -V
  if (args.includes("--version") || args.includes("-V")) {
    return { exitCode: 0, output: getVersion() };
  }

  const result: {
    exitCode: 0 | 1 | 2;
    output?: string;
    workspaceRoot?: string;
  } = { exitCode: 0 };

  let hasPositionalArg = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    // --workspace-root <value> flag
    if (arg === "--workspace-root") {
      const value = args[i + 1];
      if (value) {
        result.workspaceRoot = isAbsolute(value) ? value : resolve(value);
        i++; // skip value arg
      }
      continue;
    }

    if (arg.startsWith("-")) {
      if (!KNOWN_FLAGS.has(arg)) {
        // Unknown flag: exitCode depends on context
        // With a command/positional arg → runtime error (1)
        // Bare unknown flag → usage error (2)
        return {
          exitCode: hasPositionalArg ? 1 : 2,
          output: `Unknown option: ${arg}`,
        };
      }
    } else {
      hasPositionalArg = true;
      // Positional arg as workspace root fallback
      if (!result.workspaceRoot) {
        result.workspaceRoot = isAbsolute(arg) ? arg : resolve(arg);
      }
    }
  }

  return result;
}

/**
 * Resolve log level from flags and environment.
 * --verbose → 'debug'. --quiet → 'error'. BRIEF_LOG_LEVEL env → that value. Default → 'info'.
 * verbose wins over quiet when both provided.
 */
export function resolveLogLevel(options?: {
  verbose?: boolean;
  quiet?: boolean;
  env?: Record<string, string>;
}): string {
  // CLI flags take priority
  if (options?.verbose) return "debug";
  if (options?.quiet) return "error";

  // Env override
  const envLevel = options?.env?.BRIEF_LOG_LEVEL;
  if (envLevel) return envLevel;

  return "info";
}

/**
 * Resolve color mode from flags, environment, and TTY status.
 * FORCE_COLOR env → 'forced'. NO_COLOR env or --no-color → 'none'.
 * Non-TTY → 'none'. TTY → 'auto'.
 */
export function resolveColorMode(options: {
  env?: Record<string, string>;
  noColor?: boolean;
  isTTY: boolean;
}): string {
  const env = options.env ?? {};

  // FORCE_COLOR overrides everything (for CI systems)
  if (env.FORCE_COLOR !== undefined) return "forced";

  // NO_COLOR env or --no-color flag
  if (env.NO_COLOR !== undefined || options.noColor) return "none";

  // Non-TTY → no color
  if (!options.isTTY) return "none";

  // TTY default
  return "auto";
}

/**
 * Detect TTY status and determine interactive mode.
 * TTY → interactive with spinner. Non-TTY + --yes → acceptDefaults with status-lines.
 * Non-TTY without --yes → error message for interactive features.
 */
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

/**
 * Get the log target. All logging goes to stderr (OBS-11, CLI-05).
 */
export async function getLogTarget(_level?: string): Promise<string> {
  return "stderr";
}
