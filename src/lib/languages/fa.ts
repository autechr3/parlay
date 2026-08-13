import type { DrillCard, LanguageModule } from "./types";

export const ZWNJ = "‌";
export const PRONOUNS = ["من", "تو", "او", "ما", "شما", "آنها"];

// Harakat + Quranic marks (U+064B–U+0655) and superscript alef (U+0670) used in
// vocalized Persian. Deliberately excludes ZWNJ (U+200C) — that carries meaning.
export function stripFaDiacritics(s: string): string {
  return s.replace(new RegExp("[\\u064B-\\u0655\\u0670]", "g"), "");
}

// Mirrors SQL fa_normalize exactly. For search/comparison ONLY — never for display or storage.
export function faNormalize(s: string): string {
  return s
    .replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/ة/g, "ه")
    .replace(/[أإآ]/g, "ا").replace(/ؤ/g, "و").replace(/ئ/g, "ی")
    .replace(/[ً-ْ]/g, "")
    .replace(/‌/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const PRESENT_ENDINGS = ["م", "ی", "د", "یم", "ید", "ند"];
const PAST_ENDINGS = ["م", "ی", "", "یم", "ید", "ند"];

// و-final stems where the و is a vowel (u/ow) take the glide; consonantal و (رو rav-) does not
const VAV_VOWEL_STEMS = new Set(["گو", "جو"]);

export function conjugatePresent(presentStem: string): string[] {
  const glide = /[آا]$/.test(presentStem) || VAV_VOWEL_STEMS.has(presentStem) ? "ی" : "";
  return PRESENT_ENDINGS.map((e) => `می${ZWNJ}${presentStem}${glide}${e}`);
}

export function conjugatePast(pastStem: string): string[] {
  return PAST_ENDINGS.map((e) => `${pastStem}${e}`);
}

// Persian keyboard rows (moved from src/components/FaKeyboard.tsx).
export const KEYBOARD_LAYOUT: string[][] = [
  ["ض", "ص", "ث", "ق", "ف", "غ", "ع", "ه", "خ", "ح", "ج", "چ"],
  ["ش", "س", "ی", "ب", "ل", "ا", "ت", "ن", "م", "ک", "گ"],
  ["ظ", "ط", "ز", "ر", "ذ", "د", "پ", "و", "ژ", "آ"],
];

function buildCards(item: {
  term: string;
  transliteration: string;
  translation: string;
  morphology: Record<string, string> | null;
}): DrillCard[] | null {
  const presentStem = item.morphology?.present_stem;
  if (!presentStem) return null;
  const cards: DrillCard[] = [{ label: "Present", forms: conjugatePresent(presentStem) }];
  const pastStem = item.morphology?.past_stem;
  if (pastStem) cards.push({ label: "Past", forms: conjugatePast(pastStem) });
  return cards;
}

export const fa: LanguageModule = {
  code: "fa",
  normalize: faNormalize,
  stripDiacritics: stripFaDiacritics,
  keyboardLayout: KEYBOARD_LAYOUT,
  drills: { buildCards, pronouns: PRONOUNS },
  sampleText: "سلام، حالت چطوره؟",
};
