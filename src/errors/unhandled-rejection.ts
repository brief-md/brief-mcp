// src/errors/unhandled-rejection.ts

import type { Logger } from "../observability/logger.js";

type RejectionHandler = (reason: unknown, promise: Promise<unknown>) => void;

let activeHandler: RejectionHandler | undefined;

export function installUnhandledRejectionHandler(logger: Logger): void {
  // Remove any previously installed handler first
  if (activeHandler !== undefined) {
    process.off("unhandledRejection", activeHandler);
  }

  activeHandler = (reason: unknown, _promise: Promise<unknown>): void => {
    const message =
      reason instanceof Error
        ? reason.message
        : typeof reason === "string"
          ? reason
          : "Unknown rejection reason";

    logger.fatal("Unhandled promise rejection — initiating shutdown", {
      error: message,
    });

    if (reason instanceof Error && reason.stack !== undefined) {
      logger.debug("Unhandled rejection stack trace", { stack: reason.stack });
    }
  };

  process.on("unhandledRejection", activeHandler);
}

export function removeUnhandledRejectionHandler(): void {
  if (activeHandler !== undefined) {
    process.off("unhandledRejection", activeHandler);
    activeHandler = undefined;
  }
}
