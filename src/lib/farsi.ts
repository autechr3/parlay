const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
export const ZWNJ = "‌";
export const PRONOUNS = ["من", "تو", "او", "ما", "شما", "آنها"];

export function toPersianDigits(n: string | number): string {
  return String(n).replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)]);
}

export function toWesternDigits(s: string): string {
  return s.replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)));
}

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

export function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
  return dp[m][n];
}

export function checkTypedAnswer(input: string, expected: string) {
  const a = faNormalize(input), b = faNormalize(expected);
  if (a === b) return { verdict: "exact" as const };
  if (levenshtein(a, b) <= 1) return { verdict: "close" as const };
  return { verdict: "wrong" as const };
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
