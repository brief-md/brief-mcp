import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { loadPack, validatePackSchema } from "../../src/ontology/schema";

// ---------------------------------------------------------------------------
// Unit Tests
// ---------------------------------------------------------------------------

describe("TASK-31: Ontology — Pack Schema Validation & Loading", () => {
  describe("valid pack [ONT-09]", () => {
    it("valid pack with required fields loads successfully [ONT-09]", () => {
      const pack = {
        name: "test-pack",
        version: "1.0.0",
        entries: [
          {
            id: "entry-1",
            label: "Entry One",
            keywords: ["test"],
            description: "A test entry",
          },
        ],
      };
      expect(() => validatePackSchema(pack)).not.toThrow();
      // Verify the returned pack structure, not just absence of throw
      const result = loadPack(JSON.stringify(pack));
      expect(result.pack).toBeDefined();
      expect(result.pack.name).toBe("test-pack");
    });

    it("pack with correct required fields plus extras: accepted [ONT-09]", () => {
      const pack = {
        name: "test",
        version: "1.0",
        entries: [{ id: "e1", label: "Label", keywords: [], description: "" }],
        custom_field: "value",
      };
      expect(() => validatePackSchema(pack)).not.toThrow();
    });
  });

  describe("missing fields [ONT-09]", () => {
    it("pack missing name field: rejected with clear error [ONT-09]", () => {
      const pack = { version: "1.0", entries: [] };
      expect(() => validatePackSchema(pack)).toThrow(/name/i);
    });

    it("pack missing entries array: rejected with clear error [ONT-09]", () => {
      const pack = { name: "test", version: "1.0" };
      expect(() => validatePackSchema(pack)).toThrow(/entries/i);
    });

    it("entry missing id field: rejected with error identifying the entry [ONT-09]", () => {
      const pack = {
        name: "test",
        version: "1.0",
        entries: [{ label: "No ID", keywords: [], description: "" }],
      };
      expect(() => validatePackSchema(pack)).toThrow(/id/i);
    });
  });

  describe("entry ID validation [SEC-18]", () => {
    it("entry ID with path separator characters: rejected [SEC-18]", () => {
      const pack = {
        name: "test",
        version: "1.0",
        entries: [
          { id: "path/traversal", label: "Bad", keywords: [], description: "" },
        ],
      };
      expect(() => validatePackSchema(pack)).toThrow();
    });
  });

  describe("duplicate detection [ONT-10]", () => {
    it("duplicate entry IDs within pack: validation error [ONT-10]", () => {
      const pack = {
        name: "test",
        version: "1.0",
        entries: [
          { id: "dup", label: "First", keywords: [], description: "" },
          { id: "dup", label: "Second", keywords: [], description: "" },
        ],
      };
      expect(() => validatePackSchema(pack)).toThrow(/duplicate/i);
    });
  });

  describe("size limits [SEC-08]", () => {
    it("entry label exceeding 500 chars: rejected [SEC-07]", () => {
      const pack = {
        name: "test",
        version: "1.0",
        entries: [
          { id: "e1", label: "a".repeat(501), keywords: [], description: "" },
        ],
      };
      expect(() => validatePackSchema(pack)).toThrow(/label|length|limit/i);
    });

    it("pack with 50001 entries: rejected (exceeds limit) [SEC-08]", () => {
      const entries = Array.from({ length: 50001 }, (_, i) => ({
        id: `entry-${i}`,
        label: `Label ${i}`,
        keywords: [],
        description: "",
      }));
      const pack = { name: "big", version: "1.0", entries };
      expect(() => validatePackSchema(pack)).toThrow(/limit|count/i);
    });

    it("pack file exceeding 50MB: rejected before full parse [SEC-08]", () => {
      const oversized = "x".repeat(50 * 1024 * 1024 + 1);
      expect(() => loadPack(oversized)).toThrow(/size|limit/i);
    });
  });

  describe("non-standard fields [ONT-09]", () => {
    it("pack with non-standard fields: loads with warning listing unexpected fields [ONT-09]", () => {
      const pack = {
        name: "test",
        version: "1.0",
        entries: [{ id: "e1", label: "L", keywords: [], description: "" }],
        nonStandardField: true,
      };
      const result = loadPack(JSON.stringify(pack));
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0].fields).toContain("nonStandardField");
    });
  });

  describe("security [SEC-04]", () => {
    it("keys named __proto__ or constructor: ALWAYS rejected (prototype pollution) [SEC-04]", () => {
      // JSON.stringify strips __proto__ so we use a raw JSON string with the key present
      const maliciousJson =
        '{"name":"test","version":"1.0","entries":[],"__proto__":{"admin":true}}';
      // __proto__ must ALWAYS be rejected — no allowed variation
      expect(() => {
        const result = loadPack(maliciousJson);
        // If it doesn't throw, it must explicitly fail validation with a real error
        if (!result.isValid) {
          expect(result.errors).toBeDefined();
          expect(result.errors.length).toBeGreaterThan(0);
          throw new Error(result.errors[0]);
        }
      }).toThrow(/__proto__|prototype|security/i);
    });

    it("key named `constructor` in pack: rejected (prototype pollution) [SEC-04, T31-01]", () => {
      const maliciousJson =
        '{"name":"test","version":"1.0","entries":[],"constructor":{"name":"Evil"}}';
      expect(() => {
        const result = loadPack(maliciousJson);
        if (!result.isValid) throw new Error(result.errors?.[0] ?? "invalid");
      }).toThrow(/constructor|prototype|security/i);
    });

    it("key named `prototype` in pack: rejected (prototype pollution) [SEC-04, T31-01]", () => {
      const maliciousJson =
        '{"name":"test","version":"1.0","entries":[],"prototype":{"isAdmin":true}}';
      expect(() => {
        const result = loadPack(maliciousJson);
        if (!result.isValid) throw new Error(result.errors?.[0] ?? "invalid");
      }).toThrow(/prototype|security/i);
    });

    it("HTML/script injection in entry label/description: sanitized or rejected [SEC-07, T31-03]", () => {
      const maliciousPack = {
        name: "test",
        version: "1.0",
        entries: [
          {
            id: "e1",
            label: '<script>alert("xss")</script>',
            keywords: [],
            description: "<img src=x onerror=alert(1)>",
          },
        ],
      };
      const result = loadPack(JSON.stringify(maliciousPack));
      // Either rejected or HTML stripped from output
      if (result.isValid) {
        const entry = result.pack?.entries[0];
        expect(entry?.label).not.toContain("<script>");
        expect(entry?.description).not.toContain("<img");
      } else {
        expect(result.errors.length).toBeGreaterThan(0);
      }
    });
  });

  describe("multi-pack partial load failure [ERR-11, T31-02]", () => {
    it("one pack fails to load: other packs still loaded, warning returned for failure [ERR-11, T31-02]", async () => {
      const { loadAllPacks } = await import("../../src/ontology/schema");
      const result = await loadAllPacks({
        simulatePartialFailure: true,
        failingPack: "bad-pack",
      });
      expect(result).toBeDefined();
      expect(result.packs.length).toBeGreaterThan(0);
      expect(result.warnings).toBeDefined();
      expect(
        result.warnings.some((w: any) =>
          /bad-pack|failed|error/i.test(String(w)),
        ),
      ).toBe(true);
    });
  });

  describe("edge cases [ONT-09]", () => {
    it("zero packs installed: graceful empty state, not an error [ONT-09]", async () => {
      const { loadAllPacks } = await import("../../src/ontology/schema");
      const result = await loadAllPacks({ simulateNoPacks: true });
      expect(result).toBeDefined();
      // Use canonical property: result.packs (no ?? fallback)
      expect(result.packs).toBeDefined();
      expect(result.packs).toHaveLength(0);
      expect(result.guidance).toBeDefined();
    });

    it("schema_version field present: rejected if not 1, accepted if 1 or absent [ONT-09]", () => {
      // schema_version: '2.0' should be REJECTED
      expect(() =>
        validatePackSchema({
          name: "test-pack",
          version: "1.0.0",
          entries: [],
          schema_version: "2.0",
        }),
      ).toThrow(/schema.version|unsupported|version/i);

      // schema_version: 1 should be ACCEPTED
      expect(() =>
        validatePackSchema({
          name: "test-pack",
          version: "1.0.0",
          entries: [],
          schema_version: 1,
        }),
      ).not.toThrow();

      // schema_version absent should be ACCEPTED
      expect(() =>
        validatePackSchema({
          name: "test-pack",
          version: "1.0.0",
          entries: [],
        }),
      ).not.toThrow();
    });

    it("failed validation: response includes actual field structure for AI assistance [ONT-09]", () => {
      expect.assertions(2);
      try {
        validatePackSchema({ name: 123 }); // invalid: name should be string
      } catch (e: any) {
        expect(e.message).toMatch(/field|structure|required/i);
        // Use canonical error property: e.fieldStructure
        expect(e.fieldStructure).toBeDefined();
      }
    });
  });
});

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe("TASK-31: Property Tests", () => {
  it("forAll(valid pack JSON): loading never throws, returns structured result [ONT-09]", () => {
    fc.assert(
      fc.property(
        fc
          .string({ minLength: 1, maxLength: 20 })
          .filter((s) => /^[a-z-]+$/.test(s)),
        (name) => {
          const pack = {
            name,
            version: "1.0",
            entries: [
              { id: "e1", label: "Label", keywords: [], description: "" },
            ],
          };
          const result = loadPack(JSON.stringify(pack));
          expect(result).toBeDefined();
        },
      ),
    );
  });

  it("forAll(entry ID): only [a-zA-Z0-9_-] characters accepted [SEC-18]", () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[a-zA-Z0-9_-]+$/), (id) => {
        const pack = {
          name: "test",
          version: "1.0",
          entries: [{ id, label: "L", keywords: [], description: "" }],
        };
        expect(() => validatePackSchema(pack)).not.toThrow();
      }),
    );
  });

  it("forAll(pack file): size checked before full parse [SEC-08]", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 50 * 1024 * 1024 + 1, max: 60 * 1024 * 1024 }),
        (size) => {
          const oversized = "x".repeat(Math.min(size, 50 * 1024 * 1024 + 10));
          expect(() => loadPack(oversized)).toThrow();
        },
      ),
      { numRuns: 3 },
    );
  });

  it("forAll(pack): duplicate entry IDs always detected [ONT-10]", () => {
    fc.assert(
      fc.property(
        fc
          .string({ minLength: 1, maxLength: 20 })
          .filter((s) => /^[a-z0-9-]+$/.test(s)),
        (id) => {
          const pack = {
            name: "test",
            version: "1.0",
            entries: [
              { id, label: "A", keywords: [], description: "" },
              { id, label: "B", keywords: [], description: "" },
            ],
          };
          expect(() => validatePackSchema(pack)).toThrow(/duplicate/i);
        },
      ),
    );
  });
});
