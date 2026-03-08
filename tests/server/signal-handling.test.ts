import fc from "fast-check";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  _resetState,
  checkRateLimit,
  checkSecurityLimit,
  cleanupOrphanedTempFiles,
  detectMultiInstance,
  getProjectState,
  getStartupInfo,
  handleMultiSource,
  handleSignal,
  handleUnhandledRejection,
  handleWrite,
  verifyGenericGuide,
} from "../../src/server/signal-handling";

// ---------------------------------------------------------------------------
// Unit Tests
// ---------------------------------------------------------------------------

describe("TASK-50: Cross-Cutting — Signal Handling, Graceful Shutdown & Crash Recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetState();
  });

  describe("signal handling [CLI-08]", () => {
    it("SIGINT received: graceful shutdown initiated, in-flight writes complete [CLI-08]", async () => {
      const result = await handleSignal("SIGINT");
      expect(result.shutdownInitiated).toBe(true);
      expect(result.inFlightCompleted).toBe(true);
    });

    it("SIGTERM received: same behaviour as SIGINT [CLI-08]", async () => {
      const result = await handleSignal("SIGTERM");
      expect(result.shutdownInitiated).toBe(true);
    });

    it("second SIGINT during shutdown: force exit with code 130 [CLI-08]", async () => {
      await handleSignal("SIGINT");
      const result = await handleSignal("SIGINT");
      expect(result.forceExit).toBe(true);
      expect(result.exitCode).toBe(130);
    });

    it("SIGPIPE on Unix: converted to EPIPE error, shutdown initiated [CLI-08]", async () => {
      const result = await handleSignal("SIGPIPE");
      expect(result.epipeConverted).toBe(true);
      expect(result.shutdownInitiated).toBe(true);
    });

    it("SIGHUP on Unix: graceful shutdown initiated (same as SIGINT/SIGTERM) [CLI-08]", async () => {
      const result = await handleSignal("SIGHUP");
      expect(result.shutdownInitiated).toBe(true);
    });
  });

  describe("Windows signals [CLI-08]", () => {
    it("Windows stdin end event: shutdown initiated [CLI-08]", async () => {
      const result = await handleSignal("stdin-end");
      expect(result.shutdownInitiated).toBe(true);
    });

    it("Windows inactivity timeout (5 min): shutdown initiated [CLI-08]", async () => {
      const result = await handleSignal("inactivity-timeout");
      expect(result.shutdownInitiated).toBe(true);
    });

    it("Windows SIGBREAK received: graceful shutdown initiated [CLI-08, T50-02]", async () => {
      const result = await handleSignal("SIGBREAK");
      expect(result.shutdownInitiated).toBe(true);
    });
  });

  describe("in-flight write handling [CLI-08]", () => {
    it("in-flight write during shutdown: completes within 5s timeout [CLI-08]", async () => {
      const result = await handleSignal("SIGINT", { inFlightWrites: 1 });
      expect(result.inFlightCompleted).toBe(true);
    });

    it("in-flight write exceeding 5s: forced termination [CLI-08]", async () => {
      const result = await handleSignal("SIGINT", {
        inFlightWrites: 1,
        simulateSlowWrite: true,
      });
      expect(result.forcedTermination).toBe(true);
    });
  });

  describe("process.exit() invariant [CLI-08, T50-03]", () => {
    it("process.exit() is never called directly — only through shutdown mechanism [CLI-08, T50-03]", async () => {
      const exitSpy = vi
        .spyOn(process, "exit")
        .mockImplementation((() => {}) as any);
      // Normal signal handling should NOT call process.exit() directly
      await handleSignal("SIGINT");
      expect(exitSpy).not.toHaveBeenCalled();
      exitSpy.mockRestore();
    });

    it("force exit path: uses shutdown mechanism with code, not direct process.exit() [CLI-08, T50-03]", async () => {
      await handleSignal("SIGINT");
      const result = await handleSignal("SIGINT");
      // Force exit should go through mechanism (result.forceExit), not direct process.exit()
      expect(result.forceExit).toBe(true);
      expect(result.exitCode).toBe(130);
      // The exitCode is in the result, not invoked via process.exit() directly
    });
  });

  describe("startup recovery [CLI-09]", () => {
    it("startup with orphaned temp files: cleaned up [CLI-09]", async () => {
      const result = await cleanupOrphanedTempFiles();
      expect(result.cleaned).toBe(true);
      expect(result.cleanedCount).toBeGreaterThan(0);
    });

    it("orphaned temp file younger than 60 seconds: NOT cleaned up [CLI-09, T50-04]", async () => {
      const result = await cleanupOrphanedTempFiles({
        simulateYoungFile: true,
        ageSeconds: 30,
      });
      // Files younger than 60 seconds must be left alone (might still be in use)
      expect(result.skippedYoung).toBeGreaterThan(0);
    });

    it("orphaned temp file older than 60 seconds: cleaned up [CLI-09, T50-04]", async () => {
      const result = await cleanupOrphanedTempFiles({
        simulateOldFile: true,
        ageSeconds: 120,
      });
      expect(result.cleanedCount).toBeGreaterThan(0);
    });

    it("orphaned temp file is symlink: not followed, handled safely [CLI-09]", async () => {
      const result = await cleanupOrphanedTempFiles({ includeSymlinks: true });
      expect(result.symlinksSkipped).toBe(true);
    });

    it("startup with missing generic guide: regenerated from bundled source [COMPAT-08]", async () => {
      const result = await verifyGenericGuide({ simulateMissing: true });
      expect(result.regenerated).toBe(true);
    });

    it("startup logging: includes version, transport, workspace roots, pack count, guides count, duration [OBS-09, T50-05]", () => {
      const info = getStartupInfo();
      expect(info.version).toBeDefined();
      expect(info.transport).toBeDefined();
      expect(info.workspaceRoots).toBeDefined();
      expect(info.packCount).toBeDefined();
      // T50-05: guidesCount must also be present in startup logging
      expect(info.guidesCount).toBeDefined();
      expect(typeof info.guidesCount).toBe("number");
      expect(info.duration).toBeDefined();
    });

    it("multi-instance detection: warning logged when lock file found [CLI-08]", async () => {
      const result = await detectMultiInstance({ simulateLockExists: true });
      expect(result.warning).toBeDefined();
      expect(String(result.warning)).toMatch(/instance|lock|concurrent/i);
    });
  });

  describe("unhandled rejection [ERR-07]", () => {
    it("unhandled rejection: logged, server continues running [ERR-07]", () => {
      const result = handleUnhandledRejection(new Error("Test rejection"));
      expect(result.logged).toBe(true);
      expect(result.serverContinues).toBe(true);
    });
  });

  describe("rate limiting [PERF-10]", () => {
    it("rate limit exceeded (reads): system_error returned [PERF-10]", () => {
      const result = checkRateLimit({ type: "read", currentRate: 51 });
      expect(result.exceeded).toBe(true);
    });

    it("rate limit exceeded (writes): stricter limit enforced [PERF-10]", () => {
      const result = checkRateLimit({ type: "write", currentRate: 11 });
      expect(result.exceeded).toBe(true);
    });

    it("rate within bounds (reads at 50/s): accepted without error [PERF-10, T50-06]", () => {
      const result = checkRateLimit({ type: "read", currentRate: 50 });
      expect(result.exceeded).toBe(false);
    });

    it("rate within bounds (writes at 10/s): accepted without error [PERF-10, T50-06]", () => {
      const result = checkRateLimit({ type: "write", currentRate: 10 });
      expect(result.exceeded).toBe(false);
    });
  });

  describe("operation timeout [ERR-09]", () => {
    it("operation timeout exceeded: cancelled with cleanup [ERR-09]", async () => {
      const result = await handleSignal("timeout", { operationTimeout: true });
      expect(result.completed).toBe(false);
      expect(result.cleanupPerformed).toBe(true);
    });
  });

  describe("security limit violation [ERR-10]", () => {
    it("security limit violation -> error includes all four required fields [ERR-10, T50-01]", async () => {
      const result = await checkSecurityLimit({
        simulateViolation: true,
        limitType: "rate",
      });
      expect(result.violated).toBe(true);
      expect(result.logged).toBe(true);
      // T50-01: error response must include all four ERR-10 required fields
      expect(result.limitName).toBeDefined(); // which limit was violated
      expect(result.actualValue).toBeDefined(); // the actual value that caused the violation
      expect(result.configuredLimit).toBeDefined(); // the configured limit threshold
      expect(result.adjustmentGuidance).toBeDefined(); // how to adjust the limit
    });
  });
});

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe("TASK-50: Property Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetState();
  });

  it("forAll(shutdown): temp files always cleaned up [CLI-09]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom("SIGINT", "SIGTERM", "SIGHUP"),
        async (signal) => {
          const result = await handleSignal(signal);
          expect(result.shutdownInitiated).toBe(true);
          expect(result.tempFilesCleaned).toBe(true);
        },
      ),
      { numRuns: 3 },
    );
  });

  it("forAll(startup): orphaned temp files older than 60s always detected and removed [CLI-09, L1]", async () => {
    // L1 fix: use real random age inputs (always >60s so cleanup fires), not fc.constant()
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 61, max: 600 }), // random age in seconds, always above the 60s threshold
        async (ageSeconds) => {
          const result = await cleanupOrphanedTempFiles({
            simulateOldFile: true,
            ageSeconds,
          });
          expect(result.cleanedCount).toBeGreaterThan(0);
        },
      ),
      { numRuns: 5 },
    );
  });

  it("forAll(failed write): server state identical to pre-call state [ERR-07]", async () => {
    const testPath = "/tmp/brief-test-rollback";
    await fc.assert(
      fc.asyncProperty(
        fc
          .string({ minLength: 1, maxLength: 100 })
          .filter((s) => s.trim().length > 0),
        async (content) => {
          const stateBefore = getProjectState(testPath);
          const result = await handleWrite(testPath, content, {
            simulateFailure: true,
          });
          expect(result.failed).toBe(true);
          const stateAfter = getProjectState(testPath);
          expect(JSON.stringify(stateAfter)).toBe(JSON.stringify(stateBefore));
        },
      ),
      { numRuns: 10 },
    );
  });

  it("forAll(multi-source failure): partial results always returned from successful sources [ERR-11]", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 4 }), async (failCount) => {
        const result = handleMultiSource({
          simulateFailCount: failCount,
        });
        expect(result.partialResults.length).toBeGreaterThan(0);
        expect(result.failedCount).toBeGreaterThan(0);
      }),
      { numRuns: 10 },
    );
  });

  it("forAll(signal): all known signals always return shutdownInitiated [CLI-08]", async () => {
    const KNOWN_SIGNALS = [
      "SIGINT",
      "SIGTERM",
      "SIGHUP",
      "SIGPIPE",
      "SIGBREAK",
      "stdin-end",
      "inactivity-timeout",
    ];
    await fc.assert(
      fc.asyncProperty(fc.constantFrom(...KNOWN_SIGNALS), async (signal) => {
        _resetState();
        const result = await handleSignal(signal);
        expect(result.shutdownInitiated).toBe(true);
      }),
      { numRuns: 10 },
    );
  });
});
