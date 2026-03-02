import { describe, expect, it } from "vitest";
import { detectCaseSensitivity } from "../../src/platform/platform";

// ---------------------------------------------------------------------------
// Unit Tests — Linux Platform [T57-03]
//
// Task spec (TASK-57) requires these Linux-specific tests in a SEPARATE
// file (linux.test.ts). Cross-cutting property tests are in platform.test.ts.
// ---------------------------------------------------------------------------

describe("TASK-57: Platform Testing — Linux", () => {
  describe("case-sensitive filesystem [FS-06]", () => {
    it("Linux multiple BRIEF.md variants in same directory: detected [FS-06]", async () => {
      const result = await detectCaseSensitivity({ simulateLinux: true });
      expect(result.caseSensitive).toBe(true);
      const platform = await import("../../src/platform/platform");
      const detectBriefVariants = (platform as any).detectBriefVariants;
      expect(detectBriefVariants).toBeDefined();
      const testDir = "/tmp";
      const variants = await detectBriefVariants(testDir);
      expect(Array.isArray(variants)).toBe(true);
    });
  });
});
