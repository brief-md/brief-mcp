import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { installOntology, listOntologies } from "../../src/ontology/management";

// ---------------------------------------------------------------------------
// Unit Tests
// ---------------------------------------------------------------------------

describe("TASK-35: Ontology — Pack Management", () => {
  describe("listing [ONT-19]", () => {
    it("list installed packs: returns metadata for each (name, version, entry count, trust level) [ONT-07]", async () => {
      const result = await listOntologies();
      expect(result.packs).toBeDefined();
      expect(Array.isArray(result.packs)).toBe(true);
      for (const pack of result.packs) {
        expect(pack.name).toBeDefined();
        expect(pack.version).toBeDefined();
        expect(pack.entryCount).toBeDefined();
        expect(pack.trustLevel).toBeDefined();
      }
    });

    it("list installed packs: each pack includes description, referenceCoverage, vectorAvailability [ONT-07, T35-01]", async () => {
      const result = await listOntologies();
      expect(result.packs).toBeDefined();
      expect(Array.isArray(result.packs)).toBe(true);
      for (const pack of result.packs) {
        // T35-01: These fields must be present in listOntologies metadata
        expect(pack.description).toBeDefined();
        expect(typeof pack.description).toBe("string");
        expect(pack.referenceCoverage).toBeDefined();
        expect(pack.vectorAvailability).toBeDefined();
      }
    });

    it("no packs installed: empty array, not an error [ONT-19]", async () => {
      const result = await listOntologies({ emptyState: true });
      expect(result.packs).toHaveLength(0);
      expect(result.packs).toBeDefined();
    });
  });

  describe("install from URL [SEC-11]", () => {
    it("install from HTTPS URL: pack downloaded, validated, installed [SEC-11]", async () => {
      const result = await installOntology({
        url: "https://example.com/test-pack.json",
      });
      expect(result.installed).toBe(true);
      // Verify the pack name/path is reported, not just self-reported success
      expect(result.packName).toBeDefined();
    });

    it("install from HTTP URL: rejected (HTTPS only) [SEC-11]", async () => {
      await expect(
        installOntology({ url: "http://example.com/test-pack.json" }),
      ).rejects.toThrow(/https|secure/i);
    });

    it("redirect to HTTP: rejected [SEC-11]", async () => {
      await expect(
        installOntology({
          url: "https://redirect-to-http.example.com/pack.json",
        }),
      ).rejects.toThrow(/https|redirect/i);
    });

    it("download exceeding size limit (Content-Length check): rejected before full download [SEC-11]", async () => {
      await expect(
        installOntology({ url: "https://example.com/oversized-pack.json" }),
      ).rejects.toThrow(/size|limit/i);
    });

    it("download timeout: error after 30 seconds [SEC-11]", async () => {
      await expect(
        installOntology({ url: "https://slow-server.example.com/pack.json" }),
      ).rejects.toThrow(/timeout/i);
    }, 35_000);

    it("downloaded pack fails schema validation: rejected with field structure in error [ONT-10]", async () => {
      expect.assertions(3);
      try {
        await installOntology({ url: "https://example.com/invalid-pack.json" });
      } catch (e: any) {
        expect(e.message).toMatch(/schema|validation|invalid/i);
        expect(e.fieldStructure).toBeDefined();
        expect(e.message.length).toBeGreaterThan(0);
      }
    });

    it("download with non-JSON Content-Type → rejected before processing [SEC-11]", async () => {
      await expect(
        installOntology({
          url: "https://example.com/theme-pack.json",
          simulateContentType: "text/html",
        }),
      ).rejects.toThrow(/content.type|invalid|html/i);
    });
  });

  describe("post-install [ONT-07]", () => {
    it("valid pack installed: index rebuilt, config updated [ONT-07]", async () => {
      const result = await installOntology({
        url: "https://example.com/valid-pack.json",
      });
      expect(result.installed).toBe(true);
      expect(result.indexRebuilt).toBe(true);
      // Verify pack name is reported in the result
      expect(result.packName).toBeDefined();
    });
  });

  describe("checksum verification [SEC-11]", () => {
    it("checksum provided and matches: install succeeds [SEC-11]", async () => {
      const result = await installOntology({
        url: "https://registry.example.com/pack.json",
        checksum: "abc123valid",
      });
      expect(result.installed).toBe(true);
    });

    it("checksum provided and mismatches: rejected [SEC-11]", async () => {
      await expect(
        installOntology({
          url: "https://registry.example.com/pack.json",
          checksum: "wrong-checksum",
        }),
      ).rejects.toThrow(/checksum|mismatch/i);
    });
  });

  describe("pack update integrity", () => {
    it("re-installing existing pack: old version backed up as .bak before overwrite", async () => {
      const result = await installOntology({
        url: "https://example.com/theme-pack.json",
        simulateExistingVersion: "v1.0",
        checksum: "abc123",
      });
      expect(result.backupCreated).toBe(true);
      expect(result.backupPath).toMatch(/\.bak$/);
    });

    it("re-installing: version comparison logged", async () => {
      const result = await installOntology({
        url: "https://example.com/theme-pack.json",
        simulateExistingVersion: "v1.0",
        simulateNewVersion: "v2.0",
        checksum: "abc123",
      });
      expect(result.versionComparison).toBeDefined();
      expect(result.versionComparison.previous).toBe("v1.0");
      expect(result.versionComparison.incoming).toBe("v2.0");
    });

    it("update checksum mismatch: .bak restored, new pack deleted", async () => {
      const result = await installOntology({
        url: "https://example.com/theme-pack.json",
        simulateExistingVersion: "v1.0",
        checksum: "wrong-checksum",
        simulateChecksumMismatch: true,
      });
      expect(result.success).toBe(false);
      expect(result.backupRestored).toBe(true);
      // Verify restoredFilePath matches the pack file pattern (json extension)
      expect(result.restoredFilePath).toBeDefined();
      expect(result.restoredFilePath).toMatch(/\.json$/);
    });
  });

  describe("trust level [SEC-15]", () => {
    it("trust level in response: correctly indicates bundled/registry/url [SEC-15]", async () => {
      const result = await installOntology({
        url: "https://example.com/pack.json",
      });
      expect(result.trustLevel).toBe("url");
    });

    it("install from URL: response includes trust warning [SEC-15]", async () => {
      const result = await installOntology({
        url: "https://example.com/pack.json",
      });
      expect(result.trustWarning).toBeDefined();
      expect(result.trustWarning).toMatch(/not.*reviewed/i);
    });
  });

  describe("SSRF protection [SEC-11]", () => {
    it("private IP address in URL: rejected (SSRF protection) [SEC-11]", async () => {
      await expect(
        installOntology({ url: "https://192.168.1.1/pack.json" }),
      ).rejects.toThrow(/private|ssrf|blocked/i);
    });

    it("file:// protocol URL: rejected [SEC-11]", async () => {
      await expect(
        installOntology({ url: "file:///etc/passwd" }),
      ).rejects.toThrow(/protocol|file/i);
    });

    it("DNS rebinding protection: hostname resolved once, IP used for TCP connection [SEC-11]", async () => {
      // Note: Real DNS behavior is tested in integration tests.
      // The simulateDnsPinning flag verifies the implementation honors DNS pinning semantics.
      const result = await installOntology({
        url: "https://ontologies.example.com/theme-pack.json",
        simulateDnsPinning: true, // Should resolve DNS once and reuse IP
      });
      expect(result.dnsResolvedOnce).toBe(true);
      expect(result.dnsPinned).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe("TASK-35: Property Tests", () => {
  it("forAll(install URL): only HTTPS URLs accepted [SEC-11]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom("http://", "ftp://", "file://"),
        fc
          .string({ minLength: 5, maxLength: 30 })
          .filter((s) => /^[a-z.]+$/.test(s)),
        async (protocol, host) => {
          await expect(
            installOntology({ url: `${protocol}${host}/pack.json` }),
          ).rejects.toThrow();
        },
      ),
      { numRuns: 5 },
    );
  });

  it("forAll(installed pack): always validated before saving to ontologies directory [SEC-04]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .string({ minLength: 10 })
          .map(
            (s) => `https://example.com/${s.replace(/[^a-z0-9]/gi, "-")}.json`,
          ),
        async (url) => {
          const result = await installOntology({ url });
          expect(result.validated).toBe(true);
        },
      ),
      { numRuns: 3 },
    );
  });

  it("forAll(install): index always rebuilt after successful install [ONT-07]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .string({ minLength: 5, maxLength: 20 })
          .filter((s) => /^[a-z0-9-]+$/.test(s))
          .map((name) => `https://example.com/${name}-pack.json`),
        async (url) => {
          const result = await installOntology({ url });
          expect(result.installed).toBe(true);
          expect(result.indexRebuilt).toBe(true);
        },
      ),
      { numRuns: 3 },
    );
  });

  it("forAll(installed pack): auto-update never triggered without explicit user action [SEC-16]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          packName: fc
            .string({ minLength: 3, maxLength: 20 })
            .filter((s) => /^[a-z][a-z0-9-]*$/.test(s)),
          version: fc.constantFrom("v1.0", "v2.0", "v3.0"),
        }),
        async ({ packName, version }) => {
          const { getAutoUpdateStatus } = await import(
            "../../src/ontology/management"
          );
          const status = await getAutoUpdateStatus({ packName, version });
          // Auto-update should NEVER be enabled without explicit user action
          expect(status.autoUpdateEnabled).toBe(false);
          // Update check may happen, but actual install requires user confirmation
          expect(status.requiresUserAction).toBe(true);
        },
      ),
      { numRuns: 3 },
    );
  });
});
