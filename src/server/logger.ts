// src/server/logger.ts — re-exports server-facing logger

export { createLogger } from "../observability/logger.js";

export function info(message: string, ...args: unknown[]): void {
  process.stderr.write(`[INFO] ${message} ${args.join(" ")}\n`);
}

export function error(message: string, ...args: unknown[]): void {
  process.stderr.write(`[ERROR] ${message} ${args.join(" ")}\n`);
}

export function debug(message: string, ...args: unknown[]): void {
  process.stderr.write(`[DEBUG] ${message} ${args.join(" ")}\n`);
}
