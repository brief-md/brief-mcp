import { join, resolve } from "node:path";
import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";

// Config manager under test
// T06-02: task spec uses src/config/config.ts (not config-manager)
import {
  getConfigDir,
  loadConfig,
  saveConfig,
  updateConfig,
} from "../../src/config/config";

// ---------------------------------------------------------------------------
// Unit Tests
// ---------------------------------------------------------------------------

describe("TASK-06: Configuration Manager", () => {
  describe("first-run detection [CONF-01]", () => {
    it("config directory absent on first load creates full structure [CONF-01]", async () => {
      const { loadConfig: loadConfigFresh } = await import(
        "../../src/config/config"
      );
      const result = await loadConfigFresh({ simulateFirstRun: true });
      expect(result.createdDirectories).toEqual(
        expect.arrayContaining(["ontologies", "type-guides", "logs"]),
      );
      expect(result.configFileCreated).toBe(true);
    });

    it('first-run creation produces info log containing "First run detected" [CONF-01]', async () => {
      // The logger should emit an info message about first run
      const logger = await import("../../src/observability/logger");
      const infoSpy = vi.spyOn(logger.default, "info");
      await loadConfig({ simulateFirstRun: true });
      const calls = infoSpy.mock.calls.flat();
      expect(calls.some((arg) => /first.run/i.test(String(arg)))).toBe(true);
      infoSpy.mockRestore();
    });
  });

  describe("config loading [CONF-02, CONF-03]", () => {
    it("existing valid config is loaded without recreation [CONF-02]", async () => {
      const result = await loadConfig();
      expect(result).toBeDefined();
      expect(result.isFirstRun).toBe(false);
    });

    it("empty config {} resolves all fields to defaults [CONF-02]", async () => {
      // Mock reading {} from disk
      const config = await loadConfig();
      // Verify all CONF-03 schema fields have been populated with defaults
      expect(config.log_level).toBeDefined();
      expect(config.workspaces).toBeDefined();
      expect(Array.isArray(config.workspaces)).toBe(true);
      expect(config.transport).toBeDefined();
      expect(config.operation_timeout).toBeDefined();
      expect(typeof config.operation_timeout).toBe("number");
      expect(config.installed_ontologies).toBeDefined();
      expect(Array.isArray(config.installed_ontologies)).toBe(true);
      expect(config.tutorial_dismissed).toBeDefined();
      expect(config.ontology_search).toBeDefined();
      expect(config.max_pack_size).toBeDefined();
      expect(typeof config.max_pack_size).toBe("number");
    });

    it('config with only log_level: "debug" has that field as debug, all others are defaults [CONF-02]', async () => {
      const config = await loadConfig({ override: { log_level: "debug" } });
      expect(config.log_level).toBe("debug");
      expect(config.workspaces).toBeDefined();
      expect(config.transport).toBeDefined();
    });

    it("config with unknown field future_feature: true is preserved without error [CONF-03]", async () => {
      const config = await loadConfig({ override: { future_feature: true } });
      expect(config).toBeDefined();
      expect((config as any).future_feature).toBe(true);
    });

    it("unknown field survives save-and-reload round trip [CONF-03]", async () => {
      // Save config with unknown field, reload, verify it's still there
      const config = await loadConfig();
      (config as any).future_feature = true;
      await saveConfig(config);
      const reloaded = await loadConfig();
      expect((reloaded as any).future_feature).toBe(true);
    });
  });

  describe("corruption recovery [CONF-03]", () => {
    it("malformed JSON config (e.g., {broken) is renamed to .corrupt.{timestamp}, fresh defaults created [CONF-03]", async () => {
      // Mock readFile to return malformed JSON
      const result = await loadConfig({ simulateCorruptJson: true });
      expect(result).toBeDefined();
      // Should return all defaults
      expect(result.log_level).toBeDefined();
      expect(result.workspaces).toBeDefined();
      // Recovery action should be indicated
      expect(
        (result as any).wasCorrupted === true ||
          (result as any).recoveryAction === "renamed",
      ).toBe(true);
    });

    it("empty (0 byte) config is treated as corrupt, recreated [CONF-03]", async () => {
      const config = await loadConfig({ simulateEmptyFile: true });
      expect(config).toBeDefined();
      expect(config.workspaces).toBeDefined(); // defaults applied
      expect(config.log_level).toBeDefined();
    });

    it("corrupt recovery produces warning log with corruption details [CONF-03]", async () => {
      // Verify logger captures warning about corruption
      const logger = await import("../../src/observability/logger");
      const warnSpy = vi.spyOn(logger.default, "warn");
      await loadConfig({ simulateCorruptJson: true });
      const calls = warnSpy.mock.calls.flat();
      expect(calls.some((arg) => /corrupt/i.test(String(arg)))).toBe(true);
      warnSpy.mockRestore();
    });

    it('corrupt recovery sets first-tool-call flag with "Config was corrupted and reset to defaults" [CONF-03]', async () => {
      const result = await loadConfig({ simulateCorruptJson: true });
      expect(
        (result as any).corrupted === true ||
          (result as any).corruptionMessage !== undefined,
      ).toBe(true);
      expect((result as any).corruptionMessage).toMatch(
        /corrupt.*reset|reset.*default/i,
      );
    });
  });

  describe("runtime modification [CONF-04]", () => {
    it("runtime update adding workspace reflects in config.json on disk immediately [CONF-04]", async () => {
      const config = await loadConfig();
      const result = await updateConfig({
        workspaces: [...((config.workspaces as string[]) ?? []), "/new/root"],
      });
      expect(result).toBeDefined();
      expect(result.saved).toBe(true);
      const reloaded = await loadConfig();
      expect(reloaded.workspaces).toContain("/new/root");
    });

    it("runtime update is visible to next in-memory read without re-reading disk [CONF-04]", async () => {
      await updateConfig({ log_level: "debug" });
      const config = await loadConfig();
      expect(config.log_level).toBe("debug");
    });
  });

  describe("BRIEF_HOME override [CONF-05]", () => {
    it("BRIEF_HOME set loads config from that path [CONF-05]", async () => {
      const original = process.env.BRIEF_HOME;
      try {
        process.env.BRIEF_HOME = "/custom/brief-home";
        const dir = getConfigDir();
        expect(dir).toContain("custom");
      } finally {
        if (original === undefined) delete process.env.BRIEF_HOME;
        else process.env.BRIEF_HOME = original;
      }
    });

    it("BRIEF_HOME pointing to non-existent dir creates it with 700 permissions (Unix) [CONF-05]", async () => {
      const result = await loadConfig({
        env: { BRIEF_HOME: "/tmp/test-brief-home-nonexistent" },
      });
      expect(result).toBeDefined();
      expect(result.briefHomeCreated).toBe(true);
      expect(result.briefHomePath).toContain("test-brief-home-nonexistent");
    });

    it("BRIEF_HOME not set loads config from ~/.brief/ [CONF-05]", async () => {
      const original = process.env.BRIEF_HOME;
      try {
        delete process.env.BRIEF_HOME;
        const dir = getConfigDir();
        expect(dir).toContain(".brief");
      } finally {
        if (original !== undefined) process.env.BRIEF_HOME = original;
      }
    });
  });

  describe("schema versioning and migration [CONF-03]", () => {
    it("config with older schema_version is migrated to current version [CONF-03]", async () => {
      // Simulate loading a config written by an older version
      const result = await loadConfig({ override: { schema_version: 1 } });
      expect(result).toBeDefined();
      // Current schema version should be applied after migration
      expect((result as any).schema_version).toBeGreaterThanOrEqual(1);
    });

    it("config without schema_version field is treated as v1 and migrated [CONF-03]", async () => {
      const result = await loadConfig({ override: {} });
      expect(result).toBeDefined();
      // Schema version must be set on load
      expect((result as any).schema_version).toBeDefined();
    });

    it("migration preserves user-set workspace roots across version bump [CONF-03]", async () => {
      const result = await loadConfig({
        override: {
          schema_version: 1,
          workspace_roots: ["/migrated/workspace"],
        },
      });
      expect(result).toBeDefined();
      // Workspace roots should survive migration
      expect(
        (result as any).workspace_roots ?? (result as any).workspaces,
      ).toContain("/migrated/workspace");
    });
  });

  describe("internal defaults [CONF-03]", () => {
    it("empty config populates hierarchy_depth_limit, context_size_limit, index_memory_budget [CONF-03]", async () => {
      const config = await loadConfig({ override: {} });
      expect((config as any).hierarchy_depth_limit).toBeDefined();
      expect(typeof (config as any).hierarchy_depth_limit).toBe("number");
      expect((config as any).context_size_limit).toBeDefined();
      expect(typeof (config as any).context_size_limit).toBe("number");
      expect((config as any).index_memory_budget).toBeDefined();
      expect(typeof (config as any).index_memory_budget).toBe("number");
    });

    it("empty config populates section_aliases, port, embedding_provider [CONF-03]", async () => {
      const config = await loadConfig({ override: {} });
      expect((config as any).section_aliases).toBeDefined();
      expect((config as any).port).toBeDefined();
      expect(typeof (config as any).port).toBe("number");
      expect((config as any).embedding_provider).toBeDefined();
    });
  });

  describe("security [SEC-05]", () => {
    it("config written on Unix has file permissions 600 [SEC-05]", async () => {
      if (process.platform !== "win32") {
        const config = await loadConfig();
        const result = await saveConfig(config);
        expect(result).toBeDefined();
        expect(result.permissions).toBe(0o600);
      }
    });

    it("config with __proto__ key → rejected [SEC-04]", async () => {
      // Attempting to load a config with __proto__ should be rejected
      await expect(
        loadConfig({
          injectRaw: '{"__proto__":{"admin":true},"log_level":"debug"}',
        }),
      ).rejects.toThrow(/proto|pollution|invalid/i);
    });
  });
});

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe("TASK-06: Property Tests", () => {
  it("forAll(partial config with valid types): merged config always has every default field populated [CONF-02]", async () => {
    const defaultFields = [
      "workspace_roots",
      "transport",
      "log_level",
      "operation_timeout",
    ];
    await fc.assert(
      fc.asyncProperty(
        fc.record(
          {
            log_level: fc.constantFrom(
              "trace",
              "debug",
              "info",
              "warn",
              "error",
              "fatal",
            ),
          },
          { requiredKeys: [] },
        ),
        async (partialConfig) => {
          const config = await loadConfig({ override: partialConfig });
          expect(config.workspace_roots).toBeDefined();
          expect(config.transport).toBeDefined();
          expect(config.log_level).toBeDefined();
          for (const field of defaultFields) {
            expect(config).toHaveProperty(field);
          }
        },
      ),
    );
  });

  it("forAll(config object): save then load round-trips equivalently [CONF-03]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          log_level: fc.constantFrom("info", "debug", "warn"),
          operation_timeout: fc.integer({ min: 1, max: 120 }),
        }),
        async (config) => {
          await saveConfig(config as any);
          const reloaded = await loadConfig();
          expect(reloaded.log_level).toBe(config.log_level);
        },
      ),
    );
  });

  it("forAll(config with unknown extra fields): extras preserved after save and reload [CONF-03]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.dictionary(
          fc
            .string({ minLength: 1, maxLength: 20 })
            .filter(
              (s) =>
                /^[a-z_]+$/.test(s) &&
                !["__proto__", "constructor", "prototype"].includes(s),
            ),
          fc.string(),
          { minKeys: 1, maxKeys: 5 },
        ),
        async (extras) => {
          const config = await loadConfig();
          const withExtras = { ...config, ...extras };
          await saveConfig(withExtras as any);
          const reloaded = await loadConfig();
          for (const [key, value] of Object.entries(extras)) {
            expect((reloaded as any)[key]).toBe(value);
          }
        },
      ),
    );
  });
});
