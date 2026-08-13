// Language-neutral text helpers (moved from src/lib/farsi.ts).

// Generic digit transliteration: pass a 10-character digit map (e.g. Persian "۰۱۲۳۴۵۶۷۸۹").
export function toDigits(n: string | number, digits: string): string {
  return String(n).replace(/[0-9]/g, (d) => digits[Number(d)]);
}

const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

export function toWesternDigits(s: string): string {
  return s.replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)));
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

export function checkTypedAnswer(input: string, expected: string, normalize: (s: string) => string) {
  const a = normalize(input), b = normalize(expected);
  if (a === b) return { verdict: "exact" as const };
  if (levenshtein(a, b) <= 1) return { verdict: "close" as const };
  return { verdict: "wrong" as const };
}
