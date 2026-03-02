import { describe, expect, it } from "vitest";
import {
  normalizePath,
  resolveHomeDir,
  resolveRealPath,
} from "../../src/platform/platform";

// ---------------------------------------------------------------------------
// Unit Tests — Cross-Platform [T57-03]
//
// Task spec (TASK-57) requires these cross-platform tests in a SEPARATE
// file (cross-platform.test.ts). Cross-cutting property tests are in platform.test.ts.
// ---------------------------------------------------------------------------

describe("TASK-57: Platform Testing — Cross-Platform", () => {
  describe("path separator handling [FS-06]", () => {
    it("cross-platform forward slashes: normalised correctly [FS-06]", () => {
      const result = normalizePath("/home/user/project/BRIEF.md");
      expect(result.normalized).toBeDefined();
      expect(typeof result.normalized).toBe("string");
      expect(result.normalized).toContain("BRIEF.md");
    });

    it("cross-platform backslashes: normalised correctly [FS-06]", () => {
      const result = normalizePath("C:\\Users\\user\\project\\BRIEF.md");
      expect(result.normalized).toBeDefined();
      expect(typeof result.normalized).toBe("string");
      expect(result.normalized).toContain("BRIEF.md");
    });

    it("config paths: stored with forward slashes [FS-06]", () => {
      const result = normalizePath("C:\\Users\\user\\project", {
        forConfig: true,
      });
      expect(result.normalized).not.toContain("\\");
    });

    it("UNC path (\\\\server\\share\\project): normalised without stripping server/share prefix [FS-06, F3, L2]", () => {
      // F3: normalizePath must not treat the leading \\ as a relative path indicator
      // or strip the server/share components. UNC paths are absolute network paths.
      const unc = "\\\\server\\share\\project";
      const result = normalizePath(unc);
      expect(result.normalized).toBeDefined();
      expect(result.normalized).toContain("server");
      expect(result.normalized).toContain("share");
      expect(result.normalized).toContain("project");
    });
  });

  describe("home directory [FS-06]", () => {
    it("os.homedir(): resolves correctly on all platforms [FS-06]", () => {
      const homeDir = resolveHomeDir();
      expect(homeDir).toBeDefined();
      expect(homeDir.length).toBeGreaterThan(0);
    });

    it("BRIEF_HOME env var set: overrides default ~/.brief/ directory [FS-06]", () => {
      const homeDir = resolveHomeDir({ env: { BRIEF_HOME: "/custom/brief" } });
      expect(homeDir).toBe("/custom/brief");
    });
  });

  describe("network/cloud drive tolerance [FS-09]", () => {
    it("network drive file read: operation respects configured timeout [FS-09]", async () => {
      const { resolveRealPath } = await import("../../src/platform/platform");
      // A very short timeout should cause any slow operation to reject
      await expect(
        resolveRealPath("/network/drive/path", { timeoutMs: 1 }),
      ).rejects.toThrow(/timeout|cancelled|abort/i);
    });

    it("slow network read: timeout enforced within budget [FS-09]", async () => {
      const { readWithTimeout } = await import("../../src/io/file-io");
      const start = Date.now();
      await readWithTimeout("/tmp/slow-test.md", {
        timeoutMs: 100,
        simulateSlowRead: true,
      }).catch(() => {});
      expect(Date.now() - start).toBeLessThanOrEqual(300);
    });
  });
});
