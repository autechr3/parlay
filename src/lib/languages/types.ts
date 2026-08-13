export type DrillCard = { label: string; forms: string[] }; // per-pronoun forms

export type DrillProvider = {
  // builds conjugation-style flashcards from a vocab item's morphology; null if not applicable
  buildCards(item: {
    term: string;
    transliteration: string;
    translation: string;
    morphology: Record<string, string> | null;
  }): DrillCard[] | null;
  pronouns: string[];
};

export type LanguageModule = {
  code: string;
  normalize: (s: string) => string;
  stripDiacritics?: (s: string) => string;
  keyboardLayout?: string[][];
  drills?: DrillProvider;
  sampleText: string;
};
