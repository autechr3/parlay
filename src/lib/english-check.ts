import { levenshtein } from "./farsi";

const norm = (s: string) =>
  s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();

export function checkEnglishAnswer(input: string, answer: string, accept: string[]): boolean {
  const a = norm(input);
  return [answer, ...accept].some((c) => {
    const b = norm(c);
    return a === b || levenshtein(a, b) <= 1;
  });
}
