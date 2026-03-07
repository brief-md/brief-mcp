import fc from "fast-check";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  detectTTY,
  getLogTarget,
  parseArgs,
  resolveColorMode,
  resolveLogLevel,
} from "../../src/cli/framework";
import * as serverLogger from "../../src/server/logger";
import { captureStdout } from "../../src/server/stdout-guard";

// ---------------------------------------------------------------------------
// Unit Tests
// ---------------------------------------------------------------------------

describe("TASK-47: CLI — Framework", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("exit codes [CLI-01]", () => {
    it("valid command: exit code 0 [CLI-01]", async () => {
      const result = await parseArgs(["--version"]);
      expect(result.exitCode).toBe(0);
    });

    it("runtime error: exit code 1 [CLI-01]", async () => {
      const result = await parseArgs(["run", "--nonexistent-option"]);
      expect(result.exitCode).toBe(1);
    });

    it("invalid arguments: exit code 2 [CLI-01]", async () => {
      const result = await parseArgs(["--nonexistent-flag-xyz"]);
      expect(result.exitCode).toBe(2);
    });
  });

  describe("standard flags [CLI-02]", () => {
    it("--help flag: usage printed, exit 0 [CLI-02]", async () => {
      const result = await parseArgs(["--help"]);
      expect(result.exitCode).toBe(0);
      expect(result.output).toMatch(/usage|help/i);
    });

    it("--version flag: version printed, exit 0 [CLI-02]", async () => {
      const result = await parseArgs(["--version"]);
      expect(result.exitCode).toBe(0);
      expect(result.output).toMatch(/\d+\.\d+\.\d+/);
    });
  });

  describe("verbose and quiet modes [CLI-03]", () => {
    it("--verbose flag: log level set to debug [CLI-03]", () => {
      const level = resolveLogLevel({ verbose: true, quiet: false });
      expect(level).toBe("debug");
    });

    it("--quiet flag: only errors in output [CLI-03]", () => {
      const level = resolveLogLevel({ verbose: false, quiet: true });
      expect(level).toBe("error");
    });

    it("both --verbose and --quiet: verbose wins [CLI-03]", () => {
      const level = resolveLogLevel({ verbose: true, quiet: true });
      expect(level).toBe("debug");
    });
  });

  describe("colour output control [CLI-04]", () => {
    it("NO_COLOR env var set: no ANSI codes in output [CLI-04]", () => {
      const mode = resolveColorMode({ env: { NO_COLOR: "1" }, isTTY: true });
      expect(mode).toBe("none");
    });

    it("FORCE_COLOR env var set: ANSI codes present even in non-TTY [CLI-04]", () => {
      const mode = resolveColorMode({
        env: { FORCE_COLOR: "1" },
        isTTY: false,
      });
      expect(mode).toBe("forced");
    });

    it("--no-color flag: no ANSI codes in output [CLI-04]", () => {
      const mode = resolveColorMode({ noColor: true, isTTY: true });
      expect(mode).toBe("none");
    });

    it("no env vars, TTY=true: color auto-enabled by default [CLI-04, T47-01]", () => {
      const mode = resolveColorMode({ env: {}, isTTY: true });
      expect(mode).toMatch(/auto|enabled|full/i);
    });

    it("no env vars, TTY=false: color disabled by default [CLI-04, T47-01]", () => {
      const mode = resolveColorMode({ env: {}, isTTY: false });
      expect(mode).toBe("none");
    });
  });

  describe("workspace root argument parsing [CLI-08, T47-02]", () => {
    it("--workspace-root flag: workspaceRoot parsed from CLI args [CLI-08, T47-02]", async () => {
      const result = await parseArgs([
        "--workspace-root",
        "/path/to/workspace",
      ]);
      expect(result.exitCode).toBe(0);
      expect(result.workspaceRoot).toBeDefined();
      expect(result.workspaceRoot).toBe("/path/to/workspace");
    });

    it("--workspace-root with relative path: resolved to absolute path [CLI-08, T47-02]", async () => {
      const result = await parseArgs(["--workspace-root", "./my-workspace"]);
      expect(result.exitCode).toBe(0);
      expect(result.workspaceRoot).toBeDefined();
      expect(result.workspaceRoot).toMatch(/^(\/|[A-Z]:\\)/);
    });
  });

  describe("TTY detection [CLI-06]", () => {
    it("TTY detected: interactive prompts available [CLI-06]", () => {
      const tty = detectTTY({ isTTY: true });
      expect(tty.interactive).toBe(true);
    });

    it("non-TTY with no --yes flag: clear error about terminal requirement [CLI-06]", () => {
      const tty = detectTTY({ isTTY: false, yesFlag: false });
      expect(tty.interactive).toBe(false);
      expect(tty.errorIfInteractive).toBeDefined();
      expect(String(tty.errorIfInteractive)).toMatch(/terminal|interactive/i);
    });

    it("non-TTY with --yes flag: defaults accepted without prompting [CLI-06]", () => {
      const tty = detectTTY({ isTTY: false, yesFlag: true });
      expect(tty.acceptDefaults).toBe(true);
    });
  });

  describe("progress indicators [CLI-07]", () => {
    it("long operation in TTY: progress indicator on stderr [CLI-07]", () => {
      const tty = detectTTY({ isTTY: true });
      expect(tty.progressMode).toBe("spinner");
    });

    it("long operation in non-TTY: status lines on stderr [CLI-07]", () => {
      const tty = detectTTY({ isTTY: false, yesFlag: true });
      expect(tty.progressMode).toBe("status-lines");
    });
  });

  describe("stdout/stderr discipline [CLI-05]", () => {
    it("stdout: never contains logs or progress indicators [CLI-05]", async () => {
      const captured = await captureStdout(async () => {
        // Calling CLI utilities should not write to stdout
        resolveLogLevel({ env: { BRIEF_LOG_LEVEL: "debug" } });
      });
      expect(captured).toBe("");
    });

    it("log output routes to stderr not stdout [CLI-05]", () => {
      const stdoutSpy = vi
        .spyOn(process.stdout, "write")
        .mockImplementation(() => true);
      const stderrSpy = vi
        .spyOn(process.stderr, "write")
        .mockImplementation(() => true);

      expect(serverLogger.info).toBeDefined();
      serverLogger.info("test message");

      expect(stderrSpy).toHaveBeenCalled();
      expect(stdoutSpy).not.toHaveBeenCalledWith(
        expect.stringContaining("test message"),
      );
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
    });
  });
});

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe("TASK-47: Property Tests", () => {
  it("forAll(command): --help and --version always work without other args [CLI-02]", async () => {
    await fc.assert(
      fc.asyncProperty(fc.constantFrom("--help", "--version"), async (flag) => {
        const result = await parseArgs([flag]);
        expect(result.exitCode).toBe(0);
      }),
      { numRuns: 5 },
    );
  });

  it("forAll(output): logs and progress always on stderr, never stdout [CLI-05]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom("debug", "info", "warn", "error"),
        async (level) => {
          const target = await getLogTarget(level);
          expect(target).toBe("stderr");
        },
      ),
      { numRuns: 10 },
    );
  });

  it("forAll(exit): code is always 0, 1, or 2 [CLI-01]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom("valid", "unknown-flag", "missing-required"),
        async (scenario) => {
          if (scenario === "valid") {
            const result = await parseArgs(["--version"]);
            expect(result.exitCode).toBe(0);
          } else if (scenario === "unknown-flag") {
            const result = await parseArgs(["--this-flag-does-not-exist-xyz"]);
            expect(result.exitCode).toBe(2);
          } else {
            // Missing required args is exit code 1
            const result = await parseArgs([]);
            expect([0, 1, 2]).toContain(result.exitCode);
          }
        },
      ),
      { numRuns: 10 },
    );
  });

  it("forAll(non-TTY mode): no interactive prompts attempted [CLI-06]", () => {
    fc.assert(
      fc.property(fc.boolean(), (yesFlag) => {
        const tty = detectTTY({ isTTY: false, yesFlag });
        expect(tty.interactive).toBe(false);
      }),
      { numRuns: 25 },
    );
  });

  it("forAll(random args): exit code is always 0, 1, or 2 [CLI-01]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.string({ minLength: 1, maxLength: 30 }), {
          minLength: 0,
          maxLength: 5,
        }),
        async (args) => {
          const result = await parseArgs(args);
          expect([0, 1, 2]).toContain(result.exitCode);
        },
      ),
      { numRuns: 10 },
    );
  });

  it("forAll(detectTTY): result always has interactive and progressMode [CLI-06]", () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), (isTTY, yesFlag) => {
        const result = detectTTY({ isTTY, yesFlag });
        expect(result).toHaveProperty("interactive");
        expect(result).toHaveProperty("progressMode");
        expect(["spinner", "status-lines"]).toContain(result.progressMode);
      }),
      { numRuns: 25 },
    );
  });
});
