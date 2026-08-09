export type Direction = "fa_to_en" | "en_to_fa" | "stem";

export function pickDirection(partOfSpeech: string | null, repetitions: number): Direction {
  if (repetitions < 2) return "fa_to_en";
  if (partOfSpeech === "verb")
    return (["stem", "fa_to_en", "en_to_fa"] as const)[(repetitions - 2) % 3];
  return repetitions % 2 === 0 ? "fa_to_en" : "en_to_fa";
}
