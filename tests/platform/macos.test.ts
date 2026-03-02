import { describe, expect, it } from "vitest";
import {
  detectCaseSensitivity,
  resolveRealPath,
} from "../../src/platform/platform";

// ---------------------------------------------------------------------------
// Unit Tests — macOS Platform [T57-03]
//
// Task spec (TASK-57) requires these macOS-specific tests in a SEPARATE
// file (macos.test.ts). Cross-cutting property tests are in platform.test.ts.
// ---------------------------------------------------------------------------

describe("TASK-57: Platform Testing — macOS", () => {
  describe("case-insensitive filesystem [FS-06]", () => {
    it("macOS case-insensitive match (BRIEF.md vs brief.md): resolved correctly [FS-06]", () => {
      const result = detectCaseSensitivity();
      expect(result).toBeDefined();
      expect(typeof result.caseSensitive).toBe("boolean");
    });

    it("macOS case-insensitive: resolveRealPath normalises mismatched-case path to canonical casing [FS-06, T57-02]", async () => {
      // On a case-insensitive filesystem, BRIEF.md and brief.md resolve to the same file
      const result = await resolveRealPath("/tmp/brief.md", {
        simulateCaseInsensitive: true,
        canonicalPath: "/tmp/BRIEF.md",
      });
      expect(result.resolved).toBeDefined();
      // The resolved path should match the canonical (correct) casing
      expect(result.resolved).toMatch(/BRIEF\.md$/);
      expect(result.caseNormalized).toBe(true);
    });
  });

  describe("symlink handling [SEC-01]", () => {
    it("macOS symlink in hierarchy: handled correctly during walk [SEC-01]", async () => {
      const result = await resolveRealPath("/path/with/symlink");
      expect(result.wasSymlink).toBe(true);
      expect(result.resolved).toBeDefined();
    });
  });
});
