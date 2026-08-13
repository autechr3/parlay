import { describe, it, expect } from "vitest";
import { toDigits, toWesternDigits, levenshtein, checkTypedAnswer } from "../src/lib/text";
import { fa } from "../src/lib/languages/fa";

describe("toDigits", () => {
  it("converts to Persian digits given a digit map", () =>
    expect(toDigits(1404, "۰۱۲۳۴۵۶۷۸۹")).toBe("۱۴۰۴"));
});

describe("toWesternDigits", () => {
  it("converts back", () => expect(toWesternDigits("۲۵")).toBe("25"));
});

describe("levenshtein", () => {
  it("basic", () => expect(levenshtein("kitten", "sitting")).toBe(3));
});

describe("checkTypedAnswer (normalizer passed in)", () => {
  it("exact after normalization", () =>
    expect(checkTypedAnswer("کتابِ", "کتاب", fa.normalize).verdict).toBe("exact"));
  it("ZWNJ vs space is not an error", () =>
    expect(checkTypedAnswer("می روم", "می‌روم", fa.normalize).verdict).toBe("exact"));
  it("one letter off = close", () =>
    expect(checkTypedAnswer("کتاپ", "کتاب", fa.normalize).verdict).toBe("close"));
  it("two letters off = wrong", () =>
    expect(checkTypedAnswer("کتپپ", "کتاب", fa.normalize).verdict).toBe("wrong"));
  it("works with a non-fa normalizer too", () =>
    expect(checkTypedAnswer("  Hola ", "hola", (s) => s.trim().toLowerCase()).verdict).toBe("exact"));
});
