import { describe, it, expect } from "vitest";
import {
  toPersianDigits, toWesternDigits, faNormalize, levenshtein,
  checkTypedAnswer, conjugatePresent, conjugatePast, stripFaDiacritics,
} from "../src/lib/farsi";

describe("digits", () => {
  it("converts to Persian digits", () => expect(toPersianDigits(1404)).toBe("۱۴۰۴"));
  it("converts back", () => expect(toWesternDigits("۲۵")).toBe("25"));
});

describe("faNormalize (must mirror SQL fa_normalize)", () => {
  it("maps Arabic yeh/kaf/teh-marbuta", () => {
    expect(faNormalize("علي")).toBe("علی");
    expect(faNormalize("كتاب")).toBe("کتاب");
    expect(faNormalize("مدرسة")).toBe("مدرسه");
  });
  it("strips diacritics", () => expect(faNormalize("کتابِ خوب")).toBe("کتاب خوب"));
  it("ZWNJ becomes space", () => expect(faNormalize("می‌روم")).toBe("می روم"));
  it("collapses whitespace", () => expect(faNormalize("  سلام   دنیا ")).toBe("سلام دنیا"));
});

describe("stripFaDiacritics", () => {
  it("removes harakat, tashdid, sukun, tanvin", () =>
    expect(stripFaDiacritics("مَنْ کِتابِ خُوبٌ مُعَلِّم")).toBe("من کتاب خوب معلم"));
  it("preserves ZWNJ and base letters", () =>
    expect(stripFaDiacritics("می‌رَوَم")).toBe("می‌روم"));
  it("leaves plain text untouched", () =>
    expect(stripFaDiacritics("کتاب‌ها")).toBe("کتاب‌ها"));
});

describe("checkTypedAnswer", () => {
  it("exact after normalization", () =>
    expect(checkTypedAnswer("کتابِ", "کتاب").verdict).toBe("exact"));
  it("ZWNJ vs space is not an error", () =>
    expect(checkTypedAnswer("می روم", "می‌روم").verdict).toBe("exact"));
  it("one letter off = close", () =>
    expect(checkTypedAnswer("کتاپ", "کتاب").verdict).toBe("close"));
  it("two letters off = wrong", () =>
    expect(checkTypedAnswer("کتپپ", "کتاب").verdict).toBe("wrong"));
});

describe("conjugation", () => {
  it("regular present: رو", () =>
    expect(conjugatePresent("رو")).toEqual(["می‌روم","می‌روی","می‌رود","می‌رویم","می‌روید","می‌روند"]));
  it("glide insertion for stem ending in ا: آ", () =>
    expect(conjugatePresent("آ")).toEqual(["می‌آیم","می‌آیی","می‌آید","می‌آییم","می‌آیید","می‌آیند"]));
  it("glide insertion for stem ending in و: گو", () => expect(conjugatePresent("گو")[0]).toBe("می‌گویم"));
  it("past: رفت — 3sg is bare stem", () =>
    expect(conjugatePast("رفت")).toEqual(["رفتم","رفتی","رفت","رفتیم","رفتید","رفتند"]));
});

describe("levenshtein", () => {
  it("basic", () => expect(levenshtein("kitten", "sitting")).toBe(3));
});
