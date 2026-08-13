import { describe, it, expect } from "vitest";
import { upconvertV1 } from "../src/lib/package-v1";
import { parseAnyPackage, ContentPackageSchema } from "../src/lib/content-package";

// The exact v1 fixture shape from the pre-Task-5 content-package.test.ts: course + farsi/english
// vocab (with a vocalized form) + an en_to_fa exercise + present/past stems.
const v1Fixture = {
  format: "farsi-tracker/content-package", version: 1,
  course: { name: "Farsi A1", description: "Intro course" },
  units: [{ number: 1, title: "Basics" }],
  lessons: [{
    number: 1, title: "Greetings",
    vocab: [{
      farsi: "رفتن", farsi_vocalized: "رَفتَن", transliteration: "raftan", english: "to go",
      present_stem: "رو", past_stem: "رفت",
    }],
    exercises: [{ type: "en_to_fa", prompt: "to go", answer: "رفتن" }],
  }],
};

describe("upconvertV1", () => {
  it("returns raw unchanged when version !== 1", () => {
    const v2 = { format: "farsi-tracker/content-package", version: 2,
      curriculum: { name: "x", language: "fa" }, lessons: [] };
    expect(upconvertV1(v2)).toEqual(v2);
  });

  it("returns raw unchanged for non-object input", () => {
    expect(upconvertV1(null)).toBe(null);
    expect(upconvertV1("nope")).toBe("nope");
  });
});

describe("parseAnyPackage — v1 upconversion", () => {
  const parsed = parseAnyPackage(v1Fixture);

  it("maps course → curriculum with language fa", () => {
    expect(parsed.curriculum).toEqual({ name: "Farsi A1", description: "Intro course", language: "fa" });
  });

  it("maps farsi/english → term/translation", () => {
    const v = parsed.lessons[0].vocab![0];
    expect(v.term).toBe("رفتن");
    expect(v.term_vocalized).toBe("رَفتَن");
    expect(v.translation).toBe("to go");
  });

  it("maps present_stem/past_stem → morphology", () => {
    const v = parsed.lessons[0].vocab![0];
    expect(v.morphology).toEqual({ present_stem: "رو", past_stem: "رفت" });
  });

  it("maps en_to_fa → to_target", () => {
    expect(parsed.lessons[0].exercises![0].type).toBe("to_target");
  });

  it("preserves units untouched", () => {
    expect(parsed.units).toEqual([{ number: 1, title: "Basics" }]);
  });
});

describe("parseAnyPackage — v2 input passes through untouched", () => {
  it("parses identically to calling ContentPackageSchema.parse directly", () => {
    const v2 = {
      format: "farsi-tracker/content-package", version: 2,
      curriculum: { name: "Farsi A1", language: "fa" },
      lessons: [{ number: 1, title: "Greetings", vocab: [
        { term: "کتاب", transliteration: "ketab", translation: "book" },
      ] }],
    };
    expect(parseAnyPackage(v2)).toEqual(ContentPackageSchema.parse(v2));
  });
});

describe("parseAnyPackage — whitespace-only term still rejected post-conversion", () => {
  it("throws when a v1 farsi field is whitespace-only", () => {
    const bad = {
      ...v1Fixture,
      lessons: [{
        number: 1, title: "Greetings",
        vocab: [{ farsi: "   ", transliteration: "raftan", english: "to go" }],
      }],
    };
    expect(() => parseAnyPackage(bad)).toThrow();
  });
});
