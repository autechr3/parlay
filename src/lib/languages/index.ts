import type { LanguageModule } from "./types";
import { fa } from "./fa";

// Mirrors the SQL normalize_term() default branch exactly:
// lower(btrim(regexp_replace(term, '\s+', ' ', 'g')))
export const genericLanguage: LanguageModule = {
  code: "generic",
  normalize: (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase(),
  sampleText: "Hello world",
};

const registry: Record<string, LanguageModule> = {
  fa,
};

export function getLanguage(code: string): LanguageModule {
  return registry[code] ?? genericLanguage;
}
