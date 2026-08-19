import { getLanguage, genericLanguage } from "../languages";
import type { Exercise } from "./schema";

export type AnswerValue = string | string[];

// Normalizes for comparison: script answers go through the target language's
// normalize (+ diacritic stripping when available); translit/translation answers
// are language-neutral text and use the generic lower/trim/collapse.
function norm(languageCode: string, script: boolean, s: string): string {
  if (!script) return genericLanguage.normalize(s);
  const lang = getLanguage(languageCode);
  const stripped = lang.stripDiacritics ? lang.stripDiacritics(s) : s;
  return lang.normalize(stripped);
}

export function checkAnswer(
  languageCode: string,
  ex: Exercise,
  answer: AnswerValue,
): { correct: boolean } {
  switch (ex.type) {
    case "choice":
      return { correct: answer === ex.correct_id };
    case "typed": {
      if (typeof answer !== "string") return { correct: false };
      const script = ex.input === "script";
      const got = norm(languageCode, script, answer);
      return { correct: ex.expected.some((e) => norm(languageCode, script, e) === got) };
    }
    case "cloze": {
      const answers = Array.isArray(answer) ? answer : [answer];
      if (answers.length !== ex.blanks.length) return { correct: false };
      return {
        correct: ex.blanks.every((b, i) =>
          b.expected.some((e) => norm(languageCode, true, e) === norm(languageCode, true, answers[i] ?? "")),
        ),
      };
    }
    case "match":
      throw new Error("match exercises are scored in the widget, not via checkAnswer");
  }
}
