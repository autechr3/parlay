import { describe, it, expect } from "vitest";
import {
  fa, faNormalize, stripFaDiacritics, PRONOUNS,
  conjugatePresent, conjugatePast, ZWNJ, KEYBOARD_LAYOUT,
} from "../src/lib/languages/fa";
import { getLanguage, genericLanguage } from "../src/lib/languages/index";

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

describe("conjugation", () => {
  it("regular present: رو", () =>
    expect(conjugatePresent("رو")).toEqual(["می‌روم", "می‌روی", "می‌رود", "می‌رویم", "می‌روید", "می‌روند"]));
  it("glide insertion for stem ending in ا: آ", () =>
    expect(conjugatePresent("آ")).toEqual(["می‌آیم", "می‌آیی", "می‌آید", "می‌آییم", "می‌آیید", "می‌آیند"]));
  it("glide insertion for stem ending in و: گو", () => expect(conjugatePresent("گو")[0]).toBe("می‌گویم"));
  it("glide insertion for stem ending in و: جو", () => expect(conjugatePresent("جو")[0]).toBe("می‌جویم"));
  it("no glide for consonantal و stem: رو", () => expect(conjugatePresent("رو")[0]).toBe("می‌روم"));
  it("past: رفت — 3sg is bare stem", () =>
    expect(conjugatePast("رفت")).toEqual(["رفتم", "رفتی", "رفت", "رفتیم", "رفتید", "رفتند"]));
});

describe("PRONOUNS", () => {
  it("has six persons", () => expect(PRONOUNS).toHaveLength(6));
});

describe("ZWNJ", () => {
  it("is the zero-width non-joiner", () => expect(ZWNJ).toBe("‌"));
});

describe("KEYBOARD_LAYOUT", () => {
  it("has three rows", () => expect(KEYBOARD_LAYOUT).toHaveLength(3));
  it("first row starts with ض", () => expect(KEYBOARD_LAYOUT[0][0]).toBe("ض"));
});

describe("fa language module", () => {
  it("has code 'fa'", () => expect(fa.code).toBe("fa"));
  it("normalize matches faNormalize", () => expect(fa.normalize("علي")).toBe("علی"));
});

describe("getLanguage", () => {
  it("returns fa module for 'fa'", () => expect(getLanguage("fa").code).toBe("fa"));
  it("falls back to genericLanguage for unknown code", () => {
    expect(getLanguage("xx")).toBe(genericLanguage);
  });
});

describe("genericLanguage.normalize (must mirror SQL default branch)", () => {
  it("lowercases, trims, collapses internal whitespace", () =>
    expect(genericLanguage.normalize("  Hola   Mundo ")).toBe("hola mundo"));
});

describe("fa drills.buildCards", () => {
  it("returns null when morphology lacks present_stem", () => {
    expect(
      getLanguage("fa").drills!.buildCards({
        term: "کتاب", transliteration: "ketab", translation: "book", morphology: null,
      }),
    ).toBeNull();
  });
  it("returns present-only cards when past_stem absent", () => {
    const cards = getLanguage("fa").drills!.buildCards({
      term: "رفتن", transliteration: "raftan", translation: "to go",
      morphology: { present_stem: "رو" },
    });
    expect(cards).not.toBeNull();
    expect(cards!.some((c) => c.label.toLowerCase().includes("past"))).toBe(false);
  });
  it("returns present + past cards with correct forms", () => {
    const cards = getLanguage("fa").drills!.buildCards({
      term: "رفتن", transliteration: "raftan", translation: "to go",
      morphology: { present_stem: "رو", past_stem: "رفت" },
    })!;
    const present = cards.find((c) => c.forms.includes("می‌روم"));
    expect(present).toBeDefined();
    const past = cards.find((c) => c.forms.includes("رفتم"));
    expect(past).toBeDefined();
  });
  it("exposes pronouns", () => expect(getLanguage("fa").drills!.pronouns).toEqual(PRONOUNS));
});
