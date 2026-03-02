// src/server/signal-handling.ts — stub for TASK-50
// Replace with real implementation during build loop.

import type { Logger } from "../observability/logger.js";
import type { ShutdownState } from "../types/server.js";

export function installSignalHandlers(
  _logger: Logger,
  _onShutdown: () => Promise<void>,
): void {
  throw new Error("Not implemented: installSignalHandlers");
}

export function incrementInFlightWrites(): void {
  throw new Error("Not implemented: incrementInFlightWrites");
}

export function decrementInFlightWrites(): void {
  throw new Error("Not implemented: decrementInFlightWrites");
}

export function getShutdownState(): ShutdownState {
  throw new Error("Not implemented: getShutdownState");
}
