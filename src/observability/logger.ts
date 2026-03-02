// src/observability/logger.ts — stub for TASK-03
// Replace with real implementation during build loop.

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

export function createLogger(_config?: LoggerConfig): Logger {
  throw new Error("Not implemented: createLogger");
}
