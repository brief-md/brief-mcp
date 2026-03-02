// src/types/server.ts

export type ShutdownReason =
  | "sigint"
  | "sigterm"
  | "sighup"
  | "sigpipe"
  | "stdin-end"
  | "inactivity"
  | "error";

export interface ShutdownState {
  readonly isShuttingDown: boolean;
  readonly inFlightWrites: number;
  readonly reason?: ShutdownReason;
  readonly startedAt?: number;
}

export interface ServerStartupInfo {
  readonly version: string;
  readonly transport: string;
  readonly workspaceRoots: string[];
  readonly loadedPacksCount: number;
  readonly loadedGuidesCount: number;
  readonly startupDurationMs: number;
  readonly isFirstRun?: boolean;
}

export interface RateLimiterConfig {
  readonly readRatePerSec: number;
  readonly readBurstSize: number;
  readonly writeRatePerSec: number;
  readonly writeBurstSize: number;
}

export interface RateLimiterState {
  readonly readTokens: number;
  readonly writeTokens: number;
  readonly lastRefillTime: number;
}
