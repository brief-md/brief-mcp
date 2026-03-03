// src/observability/logger.ts

// Suppress Node.js deprecation warnings to prevent stdout contamination (OBS-11)
process.env.NODE_NO_WARNINGS = "1";

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

export interface LoggerConfig {
  level?: LogLevel;
  output?: NodeJS.WritableStream;
  format?: "json" | "pretty";
  module?: string;
}

export interface Logger {
  trace(msg: string, context?: Record<string, unknown>): void;
  debug(msg: string, context?: Record<string, unknown>): void;
  info(msg: string, context?: Record<string, unknown>): void;
  warn(msg: string, context?: Record<string, unknown>): void;
  error(msg: string, context?: Record<string, unknown>): void;
  fatal(msg: string, context?: Record<string, unknown>): void;
}

// Internal resolved configuration — exported for use by child-logger
export interface _ResolvedConfig {
  level: LogLevel;
  output: NodeJS.WritableStream;
  format: "json" | "pretty";
  moduleName: string;
}

const LEVEL_ORDER: Record<LogLevel, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
  fatal: 5,
};

// At info+ level, sanitize context to prevent sensitive data leakage (OBS-10)
// Sensitive values: multi-line strings (file contents) or deep absolute paths (workspace paths)
function isSensitiveValue(value: unknown): boolean {
  if (typeof value !== "string") return false;
  // Multi-line strings are file contents or BRIEF.md data
  if (value.includes("\n")) return true;
  // Absolute paths with > 2 path segments are workspace paths
  if (value.startsWith("/") && value.split("/").length > 3) return true;
  return false;
}

function sanitizeContext(
  context: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(context)) {
    if (!isSensitiveValue(val)) result[key] = val;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

const ANSI_RESET = "\x1b[0m";
const LEVEL_COLORS: Record<LogLevel, string> = {
  trace: "\x1b[90m", // dim gray
  debug: "\x1b[36m", // cyan
  info: "\x1b[32m", // green
  warn: "\x1b[33m", // yellow
  error: "\x1b[31m", // red
  fatal: "\x1b[1m\x1b[31m", // bold red
};

function padTwo(n: number): string {
  return n.toString().padStart(2, "0");
}

function formatTime(d: Date): string {
  return `${padTwo(d.getHours())}:${padTwo(d.getMinutes())}:${padTwo(d.getSeconds())}`;
}

function resolveLevel(config?: LoggerConfig): LogLevel {
  const envLevel = process.env.BRIEF_LOG_LEVEL;
  if (envLevel && LEVEL_ORDER[envLevel as LogLevel] !== undefined) {
    return envLevel as LogLevel;
  }
  if (config?.level) return config.level;
  return "info";
}

// WeakMap to store resolved configs for loggers we created
const loggerConfigs = new WeakMap<Logger, _ResolvedConfig>();

export function _getLoggerConfig(logger: Logger): _ResolvedConfig | undefined {
  return loggerConfigs.get(logger);
}

export function _createLoggerFromConfig(config: _ResolvedConfig): Logger {
  const { level, output, format, moduleName } = config;

  function log(
    msgLevel: LogLevel,
    msg: string,
    context?: Record<string, unknown>,
  ): void {
    if (LEVEL_ORDER[msgLevel] < LEVEL_ORDER[level]) return;

    // At info+ level, sanitize context to strip sensitive values (OBS-10)
    const isInfoPlus = LEVEL_ORDER[msgLevel] >= LEVEL_ORDER.info;
    const effectiveContext =
      context === undefined
        ? undefined
        : isInfoPlus
          ? sanitizeContext(context)
          : context;

    if (format === "json") {
      const entry: Record<string, unknown> = {
        timestamp: new Date().toISOString(),
        level: msgLevel,
        module: moduleName,
        message: msg,
      };
      if (effectiveContext !== undefined) {
        entry.context = effectiveContext;
      }
      output.write(`${JSON.stringify(entry)}\n`);
    } else {
      const color = LEVEL_COLORS[msgLevel];
      const levelStr = msgLevel.toUpperCase().padEnd(5);
      let line = `${color}[${formatTime(new Date())}] ${levelStr}${ANSI_RESET} [${moduleName}] ${msg}`;
      if (effectiveContext !== undefined) {
        line += ` ${JSON.stringify(effectiveContext)}`;
      }
      output.write(`${line}\n`);
    }
  }

  const logger: Logger = {
    trace: (msg, ctx) => log("trace", msg, ctx),
    debug: (msg, ctx) => log("debug", msg, ctx),
    info: (msg, ctx) => log("info", msg, ctx),
    warn: (msg, ctx) => log("warn", msg, ctx),
    error: (msg, ctx) => log("error", msg, ctx),
    fatal: (msg, ctx) => log("fatal", msg, ctx),
  };

  loggerConfigs.set(logger, config);
  return logger;
}

export function createLogger(config?: LoggerConfig): Logger {
  const level = resolveLevel(config);
  const output = config?.output ?? process.stderr;
  const isTTY = (output as NodeJS.WriteStream).isTTY === true;
  const format = config?.format ?? (isTTY ? "pretty" : "json");
  const moduleName = config?.module ?? "app";

  return _createLoggerFromConfig({ level, output, format, moduleName });
}

const _defaultLogger = createLogger({ module: "app" });
export default _defaultLogger;

// ---------------------------------------------------------------------------
// CI-facing helpers (OBS-09, OBS-10)
// ---------------------------------------------------------------------------

/**
 * Resolve log level from an options bag containing an env record.
 * This allows tests to pass a simulated environment without touching process.env.
 */
export function resolveLogLevel(options: {
  env?: Record<string, string | undefined>;
}): LogLevel {
  const envLevel = options.env?.BRIEF_LOG_LEVEL;
  if (envLevel && LEVEL_ORDER[envLevel as LogLevel] !== undefined) {
    return envLevel as LogLevel;
  }
  return "info";
}

/** Sensitive field names that must be redacted in info-level logs (OBS-10). */
const SENSITIVE_FIELDS = new Set([
  "token",
  "secret",
  "password",
  "key",
  "auth",
  "credential",
  "apiKey",
  "filePath",
  "briefContent",
]);

/**
 * Sanitize a JSON log line by redacting values of sensitive fields.
 * Returns valid JSON with sensitive values replaced by "[REDACTED]".
 */
export function sanitizeLogOutput(logLine: string): string {
  try {
    const obj = JSON.parse(logLine) as Record<string, unknown>;
    for (const field of Object.keys(obj)) {
      if (SENSITIVE_FIELDS.has(field)) {
        obj[field] = "[REDACTED]";
      }
    }
    return JSON.stringify(obj);
  } catch {
    // Not valid JSON — return as-is
    return logLine;
  }
}
