import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  _resetState,
  generateClientConfig,
  getSetupState,
  getToolInstallCommand,
  initWizard,
  mergeConfig,
  runSetupWizard,
} from "../../src/cli/setup-wizard";

// ---------------------------------------------------------------------------
// Unit Tests
// ---------------------------------------------------------------------------

describe("TASK-48: CLI — Setup Wizard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    _resetState();
  });

  describe("TTY requirements [CLI-06]", () => {
    it("init in TTY mode: interactive prompts displayed [CLI-06]", async () => {
      const result = await initWizard({ isTTY: true });
      expect(result.interactive).toBe(true);
    });

    it("init in non-TTY mode without --yes: clear error about terminal requirement [CLI-06]", async () => {
      await expect(
        initWizard({ isTTY: false, yesFlag: false }),
      ).rejects.toThrow(/terminal|interactive/i);
    });

    it("init in non-TTY mode with --yes: defaults accepted [CLI-06]", async () => {
      const result = await initWizard({ isTTY: false, yesFlag: true });
      expect(result.defaultsAccepted).toBe(true);
    });
  });

  describe("config generation [CONF-04]", () => {
    it("AI client selection: correct config format generated [CONF-04]", () => {
      const config = generateClientConfig({ client: "claude" });
      expect(config).toBeDefined();
      expect(config.format).toBe("claude");
    });

    it("existing config file present: merged, not silently overwritten [CONF-04]", () => {
      const merged = mergeConfig({ existingTool: {} }, { newTool: {} });
      expect(merged.existingTool).toBeDefined();
      expect(merged.newTool).toBeDefined();
    });

    it("config diff: displayed before write, confirmation required [CONF-04]", async () => {
      const result = await initWizard({
        isTTY: true,
        simulateConfigExists: true,
      });
      expect(result.diffShown).toBe(true);
      expect(result.diffContent).toBeDefined();
      expect(result.diffContent).toMatch(/[+-\w]/);
    });
  });

  describe("tool installation [SEC-12]", () => {
    it("tool install command: displayed to user, confirmation required before execution [SEC-12]", async () => {
      const result = await initWizard({
        isTTY: true,
        selectedTools: ["tool-a"],
      });
      expect(result.commandsDisplayed).toBe(true);
    });

    it("command execution uses execFile/spawn with args array, never exec with string [SEC-12]", async () => {
      const cmd = await getToolInstallCommand({
        tool: "brief-mcp",
        client: "cursor",
      });
      // Command must be an args array, never a string with shell metacharacters
      expect(Array.isArray(cmd.args)).toBe(true);
      expect(typeof cmd.executable).toBe("string");
      // Should not contain shell injection vectors in any args
      cmd.args.forEach((arg: string) => {
        expect(arg).not.toMatch(/[;&|`$]/); // No shell metacharacters
      });
    });

    it("child process invocations use pipe stdio (not inherit)", async () => {
      const result = await runSetupWizard({
        nonInteractive: true,
        checkStdioConfig: true,
      });
      const stdioConfig = result.childProcessStdioConfig;
      expect(String(stdioConfig)).not.toMatch(/inherit/i);
      expect(String(stdioConfig)).toMatch(/pipe/i);
    });
  });

  describe("directory setup [COMPAT-08]", () => {
    it("~/.brief/ directory creation: directory and structure created [COMPAT-08]", async () => {
      const result = await initWizard({ isTTY: true });
      expect(result.directoryCreated).toBe(true);
    });

    it("bundled packs and guides: installed to correct locations [COMPAT-08]", async () => {
      const result = await initWizard({ isTTY: true });
      expect(result.bundledInstalled).toBe(true);
    });
  });

  describe("npx cold-start guidance [CLI-09, T48-01]", () => {
    it("npx --yes cold-start: generated config includes workspace root guidance [CLI-09, T48-01]", async () => {
      const result = await initWizard({
        isTTY: false,
        yesFlag: true,
        npxColdStart: true,
      });
      expect(result.generatedConfig).toBeDefined();
      expect(JSON.stringify(result.generatedConfig)).toMatch(
        /workspace.?root|workspaceRoot/i,
      );
    });
  });

  describe("workspace root path validation [CLI-08, T48-02]", () => {
    it("valid absolute workspace root path: accepted [CLI-08, T48-02]", async () => {
      const result = await initWizard({
        isTTY: false,
        yesFlag: true,
        workspaceRoot: "/valid/path",
      });
      expect(result.workspaceRootValid).toBe(true);
    });

    it("workspace root path is a file (not directory): validation error [CLI-08, T48-02]", async () => {
      await expect(
        initWizard({
          isTTY: false,
          yesFlag: true,
          workspaceRoot: "/etc/hosts",
        }),
      ).rejects.toThrow(/directory|not.*dir|invalid.*path/i);
    });
  });

  describe("resumable state [CONF-04]", () => {
    it("wizard interrupted and restarted: resumes from setup_state [CONF-04]", async () => {
      // Simulate a partial wizard run
      await initWizard({
        isTTY: true,
        simulateInterrupt: true,
        interruptAfterStep: 2,
      });
      const state = getSetupState();
      expect(state).toBeDefined();
      expect(state.lastCompletedStep).toBeDefined();
      expect(state.lastCompletedStep).toBeGreaterThanOrEqual(2);
    });

    it("completed step re-run: idempotent, no side effects [CONF-04]", async () => {
      const result1 = await initWizard({ isTTY: true });
      const result2 = await initWizard({ isTTY: true });
      expect(result1.directoryCreated).toBe(true);
      // Second run should not error and should indicate no changes needed
      expect(result2).toBeDefined();
      expect(result2.alreadyComplete).toBe(true);
    });

    it("config written: persisted to disk immediately [CONF-04]", async () => {
      const result = await initWizard({ isTTY: true });
      expect(result.configPersisted).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe("TASK-48: Property Tests", () => {
  it("forAll(tool install): command always displayed and confirmed before execution [SEC-12]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom("tool-a", "tool-b", "tool-c"),
        async (tool) => {
          const result = await initWizard({
            isTTY: true,
            selectedTools: [tool],
          });
          expect(result.commandsDisplayed).toBe(true);
        },
      ),
      { numRuns: 3 },
    );
  });

  it("forAll(config write): changes persisted to disk immediately [CONF-04]", async () => {
    await fc.assert(
      fc.asyncProperty(fc.constantFrom("claude", "cursor"), async (client) => {
        const result = await initWizard({ isTTY: true, client });
        expect(result.configPersisted).toBe(true);
      }),
      { numRuns: 2 },
    );
  });

  it("forAll(existing config): never silently overwritten [CONF-04]", () => {
    fc.assert(
      fc.property(
        fc.record({
          existing: fc.string({ minLength: 1, maxLength: 20 }),
          incoming: fc.string({ minLength: 1, maxLength: 20 }),
        }),
        ({ existing, incoming }) => {
          const merged = mergeConfig({ [existing]: {} }, { [incoming]: {} });
          expect(merged[existing]).toBeDefined();
        },
      ),
      { numRuns: 25 },
    );
  });

  it("forAll(wizard step): idempotent on re-execution [CONF-04]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          home: fc
            .string({ minLength: 1, maxLength: 20 })
            .filter((s) => /^\w+$/.test(s)),
        }),
        async (config) => {
          await runSetupWizard({ ...config, nonInteractive: true });
          const result2 = await runSetupWizard({
            ...config,
            nonInteractive: true,
          });
          expect(result2.alreadyComplete).toBe(true);
        },
      ),
      { numRuns: 3 },
    );
  });

  it("forAll(non-TTY without --yes): always rejects with terminal error [CLI-06]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .string({ minLength: 1, maxLength: 20 })
          .filter((s) => /^\w+$/.test(s)),
        async (client) => {
          await expect(
            initWizard({ isTTY: false, yesFlag: false, client }),
          ).rejects.toThrow(/terminal|interactive/i);
        },
      ),
      { numRuns: 10 },
    );
  });

  it("forAll(initWizard TTY): result always has expected shape [CONF-04]", async () => {
    await fc.assert(
      fc.asyncProperty(fc.constantFrom("claude", "cursor"), async (client) => {
        const result = await initWizard({ isTTY: true, client });
        expect(Object.keys(result)).toEqual(
          expect.arrayContaining(["directoryCreated", "configPersisted"]),
        );
      }),
      { numRuns: 2 },
    );
  });
});
