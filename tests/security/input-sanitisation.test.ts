import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  detectHomoglyphs,
  normalizeForMatching,
  sanitizeObject,
  stripBidiCharacters,
  validateEntryId,
  validateMutualExclusion,
  validateOntologyPackSchema,
  validateParameterLimits,
  validateRequiredString,
} from "../../src/security/input-sanitisation";

// ---------------------------------------------------------------------------
// Unit Tests
// ---------------------------------------------------------------------------

describe("TASK-05b: Security — Input Sanitisation & Parameter Validation", () => {
  describe("unicode normalization [SEC-20]", () => {
    it("zero-width spaces in string are stripped, letters adjacent [SEC-20]", () => {
      // U+200B zero-width space between letters
      const input = "he\u200Bllo";
      const result = normalizeForMatching(input);
      expect(result).not.toContain("\u200B");
      expect(result).toContain("hello");
    });

    it("bidi override U+202E in string is removed, visible text preserved [SEC-20]", () => {
      const input = "hello\u202Eworld";
      const result = normalizeForMatching(input);
      expect(result).not.toContain("\u202E");
      expect(result).toContain("hello");
      expect(result).toContain("world");
    });

    it("decomposed e-acute becomes NFC precomposed after normalization [SEC-20]", () => {
      // e + combining acute accent (U+0301)
      const decomposed = "e\u0301";
      const result = normalizeForMatching(decomposed);
      // Should be NFC form: single precomposed character
      expect(result).toBe("\u00E9");
    });

    it("CJK text preserved unchanged by normalizeForMatching [SEC-20, F1, M2]", () => {
      // F1: NFC normalization of CJK text must be a no-op — CJK characters are already
      // in NFC and must not be stripped or mangled by the zero-width/bidi removal pass.
      const cjk = "\u65E5\u672C\u8A9E\u30C6\u30B9\u30C8"; // 日本語テスト
      const result = normalizeForMatching(cjk);
      expect(result).toContain(cjk);
    });
  });

  describe("required string validation [SEC-19]", () => {
    it("empty/whitespace required param produces user_error naming the parameter [MCP-03]", () => {
      expect(() => validateRequiredString("", "title")).toThrow(/title/i);
      expect(() => validateRequiredString("   ", "title")).toThrow(/title/i);
      expect(() => validateRequiredString(undefined as any, "query")).toThrow(
        /query/i,
      );
      expect(() => validateRequiredString(null as any, "name")).toThrow(
        /name/i,
      );
    });
  });

  describe("parameter length limits [SEC-19]", () => {
    it("title at 500 chars is accepted; 501 is rejected with limit details [SEC-19]", () => {
      expect(() =>
        validateParameterLimits("a".repeat(500), "title", "title"),
      ).not.toThrow();
      expect(() =>
        validateParameterLimits("a".repeat(501), "title", "title"),
      ).toThrow(/500/);
    });

    it("content at 102400 bytes is accepted; 102401 is rejected [SEC-19]", () => {
      expect(() =>
        validateParameterLimits("a".repeat(102400), "content", "content"),
      ).not.toThrow();
      expect(() =>
        validateParameterLimits("a".repeat(102401), "content", "content"),
      ).toThrow(/102400|100.*KB|content/i);
    });

    it("query at 1000 chars is accepted; 1001 is rejected [SEC-19]", () => {
      expect(() =>
        validateParameterLimits("a".repeat(1000), "query", "query"),
      ).not.toThrow();
      expect(() =>
        validateParameterLimits("a".repeat(1001), "query", "query"),
      ).toThrow(/1000|query/i);
    });

    it("label at 200 chars is accepted; 201 is rejected [SEC-19]", () => {
      expect(() =>
        validateParameterLimits("a".repeat(200), "label", "label"),
      ).not.toThrow();
      expect(() =>
        validateParameterLimits("a".repeat(201), "label", "label"),
      ).toThrow(/200|label/i);
    });

    it("path at 4096 chars is accepted; 4097 is rejected [SEC-19]", () => {
      expect(() =>
        validateParameterLimits("a".repeat(4096), "path", "path"),
      ).not.toThrow();
      expect(() =>
        validateParameterLimits("a".repeat(4097), "path", "path"),
      ).toThrow(/4096|path/i);
    });
  });

  describe("mutual exclusion [MCP-03]", () => {
    it("both replaces and exception_to present produces user_error listing conflict [MCP-03]", () => {
      expect(() =>
        validateMutualExclusion({ replaces: "dec-1", exception_to: "dec-2" }, [
          ["replaces", "exception_to"],
        ]),
      ).toThrow(/replaces.*exception_to|exception_to.*replaces/i);
    });

    it("only one of mutually exclusive params present does not throw [MCP-03]", () => {
      expect(() =>
        validateMutualExclusion({ replaces: "dec-1" }, [
          ["replaces", "exception_to"],
        ]),
      ).not.toThrow();
    });

    it('"A requires B" dependency: A present without B throws naming both [MCP-03]', () => {
      // If param A is present, param B is required
      expect(() =>
        validateMutualExclusion(
          { format: "detailed" },
          [],
          [{ if: "format", requires: "heading" }],
        ),
      ).toThrow(/format|heading/i);
    });

    it('"A requires B" dependency: both A and B present does not throw [MCP-03]', () => {
      expect(() =>
        validateMutualExclusion(
          { format: "detailed", heading: "My Heading" },
          [],
          [{ if: "format", requires: "heading" }],
        ),
      ).not.toThrow();
    });
  });

  describe("prototype pollution prevention [SEC-04]", () => {
    it("__proto__ key nested in object produces security_error [SEC-04]", () => {
      const malicious = {
        normal: "value",
        nested: {
          __proto__: { admin: true },
        },
      };
      expect(() => sanitizeObject(malicious)).toThrow(/security|proto/i);
    });

    it("__proto__ key at multiple nesting depths is rejected at every level [SEC-04]", () => {
      // Single level (top-level __proto__)
      const topLevel = { __proto__: { admin: true } };
      expect(() => sanitizeObject(topLevel)).toThrow(/security|proto/i);

      // Double nesting
      const doubleNested = {
        level1: {
          level2: {
            __proto__: { elevated: true },
          },
        },
      };
      expect(() => sanitizeObject(doubleNested)).toThrow(/security|proto/i);

      // constructor key also rejected
      const constructorPollution = {
        safe: "value",
        nested: { constructor: { prototype: { admin: true } } },
      };
      expect(() => sanitizeObject(constructorPollution)).toThrow(
        /security|constructor|proto/i,
      );
    });

    it("prototype key standalone at top level produces security_error [SEC-04, SEC-09, M2]", () => {
      // SEC-09 explicitly requires rejecting __proto__, constructor, AND prototype keys
      // This tests prototype as a standalone top-level attack vector
      const prototypePollution = { prototype: { isAdmin: true } };
      expect(() => sanitizeObject(prototypePollution)).toThrow(
        /security|prototype/i,
      );

      // Also nested independently (not inside constructor)
      const nestedPrototype = {
        safe: "value",
        inner: { prototype: { elevated: true } },
      };
      expect(() => sanitizeObject(nestedPrototype)).toThrow(
        /security|prototype/i,
      );
    });
  });

  describe("entry ID validation [SEC-18]", () => {
    it("valid-entry_123 is accepted; ID with / or . is rejected [SEC-18]", () => {
      expect(() => validateEntryId("valid-entry_123")).not.toThrow();
      expect(() => validateEntryId("path/traversal")).toThrow();
      expect(() => validateEntryId("has.dots")).toThrow();
      expect(() => validateEntryId("has spaces")).toThrow();
    });
  });

  describe("homoglyph detection [SEC-20]", () => {
    it('Cyrillic "a" vs Latin "a" produces advisory warning [SEC-20]', () => {
      // Cyrillic а (U+0430) looks identical to Latin a (U+0061)
      const result = detectHomoglyphs("\u0430bc", "abc");
      expect(result.hasHomoglyphs).toBe(true);
    });
  });

  describe("stripBidiCharacters [SEC-20]", () => {
    it("string with bidi override characters has them stripped [SEC-20]", () => {
      // U+202E RIGHT-TO-LEFT OVERRIDE and U+202D LEFT-TO-RIGHT OVERRIDE
      const withBidi = "safe\u202Etext\u202Dhere";
      const result = stripBidiCharacters(withBidi);
      expect(result).not.toContain("\u202E");
      expect(result).not.toContain("\u202D");
      expect(result).toContain("safetext");
    });

    it("string without bidi characters is returned unchanged [SEC-20]", () => {
      const clean = "hello world 123";
      const result = stripBidiCharacters(clean);
      expect(result).toBe(clean);
    });

    it("string with multiple bidi categories all stripped [SEC-20]", () => {
      const allBidi = "\u202A\u202B\u202C\u202D\u202E\u2066\u2067\u2068\u2069";
      const result = stripBidiCharacters(allBidi);
      expect(result).toBe("");
    });
  });

  describe("ontology pack array size limits [SEC-07]", () => {
    it("pack with exactly 50000 entries is accepted; 50001 is rejected [SEC-07]", () => {
      const makeEntry = (id: string) => ({
        id,
        label: "x",
        keywords: [],
        description: "",
      });
      const atLimit = {
        name: "test",
        version: "1.0.0",
        entries: Array.from({ length: 50000 }, (_, i) => makeEntry(`e${i}`)),
      };
      expect(() => validateOntologyPackSchema(atLimit)).not.toThrow();

      const overLimit = {
        name: "test",
        version: "1.0.0",
        entries: Array.from({ length: 50001 }, (_, i) => makeEntry(`e${i}`)),
      };
      expect(() => validateOntologyPackSchema(overLimit)).toThrow(
        /entries|50000|limit/i,
      );
    });

    it("entry with exactly 100 keywords is accepted; 101 is rejected [SEC-07]", () => {
      const validEntry = {
        name: "test",
        version: "1.0.0",
        entries: [
          {
            id: "e1",
            label: "test",
            keywords: Array(100).fill("kw"),
            description: "",
          },
        ],
      };
      expect(() => validateOntologyPackSchema(validEntry)).not.toThrow();

      const overEntry = {
        name: "test",
        version: "1.0.0",
        entries: [
          {
            id: "e1",
            label: "test",
            keywords: Array(101).fill("kw"),
            description: "",
          },
        ],
      };
      expect(() => validateOntologyPackSchema(overEntry)).toThrow(
        /keywords|100|limit/i,
      );
    });

    it("entry with exactly 50 synonyms is accepted; 51 is rejected [SEC-07, T05b-04]", () => {
      const validEntry = {
        name: "test",
        version: "1.0.0",
        entries: [
          {
            id: "e1",
            label: "test",
            keywords: [],
            description: "",
            synonyms: Array(50).fill("syn"),
          },
        ],
      };
      expect(() => validateOntologyPackSchema(validEntry)).not.toThrow();

      const overEntry = {
        name: "test",
        version: "1.0.0",
        entries: [
          {
            id: "e1",
            label: "test",
            keywords: [],
            description: "",
            synonyms: Array(51).fill("syn"),
          },
        ],
      };
      expect(() => validateOntologyPackSchema(overEntry)).toThrow(
        /synonyms|50|limit/i,
      );
    });

    it("entry with exactly 500 references is accepted; 501 is rejected [SEC-07, T05b-04]", () => {
      const makeRef = (i: number) => ({
        creator: `Author ${i}`,
        title: `Work ${i}`,
      });
      const validEntry = {
        name: "test",
        version: "1.0.0",
        entries: [
          {
            id: "e1",
            label: "test",
            keywords: [],
            description: "",
            references: Array.from({ length: 500 }, (_, i) => makeRef(i)),
          },
        ],
      };
      expect(() => validateOntologyPackSchema(validEntry)).not.toThrow();

      const overEntry = {
        name: "test",
        version: "1.0.0",
        entries: [
          {
            id: "e1",
            label: "test",
            keywords: [],
            description: "",
            references: Array.from({ length: 501 }, (_, i) => makeRef(i)),
          },
        ],
      };
      expect(() => validateOntologyPackSchema(overEntry)).toThrow(
        /references|500|limit/i,
      );
    });
  });

  describe("ontology pack schema validation [SEC-07]", () => {
    it("pack with valid schema passes [SEC-07]", () => {
      const validPack = {
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
      expect(() => validateOntologyPackSchema(validPack)).not.toThrow();
    });

    it("pack missing name field produces error naming the field [SEC-07]", () => {
      const invalidPack = {
        version: "1.0.0",
        entries: [],
      };
      expect(() => validateOntologyPackSchema(invalidPack)).toThrow(/name/i);
    });

    it("pack entry label over 500 chars produces error [SEC-07]", () => {
      const invalidPack = {
        name: "test",
        version: "1.0.0",
        entries: [
          { id: "e1", label: "a".repeat(501), keywords: [], description: "" },
        ],
      };
      expect(() => validateOntologyPackSchema(invalidPack)).toThrow(
        /label|length|limit/i,
      );
    });

    it("<script> in description is rejected [SEC-07]", () => {
      const maliciousPack = {
        name: "test",
        version: "1.0.0",
        entries: [
          {
            id: "e1",
            label: "test",
            keywords: [],
            description: '<script>alert("xss")</script>',
          },
        ],
      };
      expect(() => validateOntologyPackSchema(maliciousPack)).toThrow(
        /script|html/i,
      );
    });
  });
});

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe("TASK-05b: Property Tests", () => {
  it("forAll(string): normalized output has no zero-width or bidi chars [SEC-20]", () => {
    const zeroWidthAndBidi = [
      "\u200B",
      "\u200C",
      "\u200D",
      "\uFEFF",
      "\u2060",
      "\u180E",
      "\u200E",
      "\u200F",
      "\u202A",
      "\u202B",
      "\u202C",
      "\u202D",
      "\u202E",
      "\u2066",
      "\u2067",
      "\u2068",
      "\u2069",
    ];
    fc.assert(
      fc.property(fc.string(), (input) => {
        const result = normalizeForMatching(input);
        for (const char of zeroWidthAndBidi) {
          expect(result).not.toContain(char);
        }
      }),
    );
  });

  it("forAll(string): normalizing twice produces the same result as normalizing once (idempotent) [SEC-20]", () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const once = normalizeForMatching(input);
        const twice = normalizeForMatching(once);
        expect(twice).toBe(once);
      }),
    );
  });

  it("forAll(ID matching [a-zA-Z0-9_-]+): entry ID validation passes [SEC-18]", () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[a-zA-Z0-9_-]+$/), (id) => {
        expect(() => validateEntryId(id)).not.toThrow();
      }),
    );
  });

  it("forAll(object without proto/constructor keys): sanitizeObject passes [SEC-04]", () => {
    const safeKey = fc
      .string()
      .filter(
        (s) =>
          !["__proto__", "constructor", "prototype"].includes(s) &&
          s.length > 0,
      );
    fc.assert(
      fc.property(
        // Generate nested objects (not just flat dictionaries) to test deep sanitization
        fc.object({
          key: safeKey,
          values: [fc.string(), fc.integer(), fc.boolean()],
          maxDepth: 3,
          maxKeys: 5,
        }),
        (obj) => {
          expect(() => sanitizeObject(obj)).not.toThrow();
        },
      ),
    );
  });
});
