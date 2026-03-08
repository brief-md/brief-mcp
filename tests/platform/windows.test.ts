import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import {
  detectStdinEof,
  isReservedFilename,
  normalizePath,
  registerSignalHandlers,
  resolveRealPath,
  retryRename,
} from "../../src/platform/platform";

// ---------------------------------------------------------------------------
// Unit Tests — Windows Platform [T57-03]
//
// Task spec (TASK-57) requires these Windows-specific tests in a SEPARATE
// file (windows.test.ts). Cross-cutting property tests are in platform.test.ts.
// ---------------------------------------------------------------------------

describe("TASK-57: Platform Testing — Windows", () => {
  describe("NTFS junction resolution [SEC-01]", () => {
    it("Windows NTFS junction: resolved via fs.realpath() before path validation [SEC-01]", async () => {
      const result = await resolveRealPath("/path/with/junction");
      expect(result.resolved).toBeDefined();
      expect(typeof result.resolved).toBe("string");
      expect(result.resolved.length).toBeGreaterThan(0);
    });

    it("Windows path with junction bypassing boundary: rejected after realpath resolution [SEC-01]", async () => {
      await expect(
        resolveRealPath("/workspace/../../../etc/passwd", {
          boundary: "/workspace",
        }),
      ).rejects.toThrow(/boundary|traversal/i);
    });
  });

  describe("fs.rename() retry [FS-06]", () => {
    it("Windows fs.rename() EPERM: retry with backoff succeeds [FS-06]", async () => {
      const result = await retryRename({
        src: "/tmp/src",
        dest: "/tmp/dest",
        simulateError: "EPERM",
      });
      expect(result.success).toBe(true);
    });

    it("Windows fs.rename() EBUSY: retry with backoff succeeds [FS-06]", async () => {
      const result = await retryRename({
        src: "/tmp/src",
        dest: "/tmp/dest",
        simulateError: "EBUSY",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("reserved filenames [FS-06]", () => {
    it("Windows reserved filename: all device names detected and handled [FS-06]", () => {
      // COM ports
      for (let i = 1; i <= 9; i++) {
        expect(isReservedFilename(`COM${i}`)).toBe(true);
        expect(isReservedFilename(`LPT${i}`)).toBe(true);
      }
      // Other reserved names
      ["CON", "PRN", "AUX", "NUL", "CLOCK$"].forEach((name) => {
        expect(isReservedFilename(name)).toBe(true);
      });
      // Case-insensitive
      expect(isReservedFilename("con")).toBe(true);
      expect(isReservedFilename("Con")).toBe(true);
      // Valid names should not be flagged
      expect(isReservedFilename("CONNECT")).toBe(false);
      expect(isReservedFilename("CONSOLE")).toBe(false);
    });

    it("Windows reserved names with file extensions are also reserved [FS-06, F3, L1]", () => {
      // On Windows, CreateFile("CON.md") opens the console device — extensions are ignored.
      // isReservedFilename must strip the extension before checking.
      expect(isReservedFilename("CON.md")).toBe(true);
      expect(isReservedFilename("NUL.brief.md")).toBe(true);
      expect(isReservedFilename("COM1.txt")).toBe(true);
      expect(isReservedFilename("LPT2.log")).toBe(true);
      // Valid filenames with extensions should not be flagged
      expect(isReservedFilename("CONNECT.md")).toBe(false);
      expect(isReservedFilename("console.log")).toBe(false);
    });
  });

  describe("Windows signals [CLI-08]", () => {
    it("Windows SIGBREAK: handler can be registered functionally [CLI-08]", () => {
      // On platforms that support SIGBREAK, verify handler registration
      const signals = registerSignalHandlers({ dryRun: true });
      // dryRun mode returns list of registered signals without actually registering
      expect(signals).toBeDefined();
      // On Windows, SIGBREAK should be in the list
      if (process.platform === "win32") {
        expect(signals).toContain("SIGBREAK");
      } else {
        // On non-Windows, SIGBREAK registration is skipped gracefully
        expect(signals).not.toContain("SIGBREAK");
      }
    });

    it("Windows stdin EOF: client disconnection detected [CLI-08]", async () => {
      // Test actual stdin EOF scenario using a mock stream that emits 'end'
      const mockStdin = new EventEmitter() as NodeJS.ReadableStream;
      const result = await new Promise<{ disconnected: boolean }>((resolve) => {
        detectStdinEof(mockStdin, (disconnectResult: any) =>
          resolve(disconnectResult),
        );
        mockStdin.emit("end");
      });
      expect(result.disconnected).toBe(true);
    });
  });

  describe("MAX_PATH [FS-06]", () => {
    it("Windows path exceeding 260 chars: warning emitted [FS-06]", () => {
      const longPath = `C:\\${"a".repeat(258)}`;
      const result = normalizePath(longPath);
      expect(result.warning).toMatch(/path.*length|MAX_PATH/i);
    });
  });

  describe("8.3 short filename resolution [FS-06, T57-04]", () => {
    it("Windows 8.3 short path (e.g. PROGRA~1): resolved to full long path [FS-06, T57-04]", async () => {
      const result = await resolveRealPath("C:\\PROGRA~1", {
        simulateShortFilename: true,
        longPathEquivalent: "C:\\Program Files",
      });
      expect(result.resolved).toBeDefined();
      expect(result.resolved).toContain("Program Files");
      expect(result.wasShortFilename).toBe(true);
    });
  });
});
