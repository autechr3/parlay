// Pure, testable prompt builders for the /prompts agent-prompt library.
// No imports needed — this module has zero dependencies on Next.js or Supabase.

export const SCHEMA_DOC = `
You must return a single JSON object in the "parlay/content-package" format. Full example:

{
  "format": "parlay/content-package",
  "version": 2,
  "curriculum": { "name": "Farsi A1", "language": "fa", "description": "optional" },
  "units": [ { "number": 1, "title": "Foundations", "description": null } ],
  "lessons": [
    {
      "number": 4,
      "unit": 1,
      "title": "Present Tense I",
      "slug": "present-tense-i",
      "grammar_points": ["می- prefix", "present stems"],
      "estimated_minutes": 60,
      "is_review": false,
      "is_assessment": false,
      "body_md": "# Lesson 04 — ...",
      "vocab": [
        { "term": "رفتن", "term_vocalized": "رَفتَن", "transliteration": "raftan",
          "translation": "to go", "part_of_speech": "verb",
          "morphology": { "present_stem": "رو", "past_stem": "رفت" },
          "colloquial": null, "tags": [] }
      ],
      "exercises": [
        { "type": "to_target", "prompt": "I am going home",
          "answer": "من به خانه می‌روم", "accept": [], "hint": null }
      ]
    }
  ]
}

Field notes:
- "format" (required): must be exactly the literal string "parlay/content-package".
- "version" (required): must be exactly the number 2.
- "curriculum.name" (required): the curriculum is matched on (owner, name) — an existing curriculum
  with this exact name is updated in place, otherwise a new one is created. "curriculum.language"
  (required) is the target language's code (e.g. "fa" for Persian). "curriculum.description" is
  optional.
- "units" (optional array): each unit is matched on (curriculum, number); "title" describes it,
  "description" may be null. Units referenced by a lesson's "unit" number are created automatically
  with a default title if not listed here.
- "lessons" (optional array): each lesson requires "number" and "title" — every other lesson field
  is optional. Lessons are matched on (curriculum, number); matching fields (including "body_md") are
  updated in place, never duplicated.
- "lessons[].vocab" (optional array): each item is upserted on (curriculum, lesson, term). Only
  "term", "transliteration" and "translation" are required per vocab item; the rest may be omitted
  or null.
- "lessons[].vocab[].term_vocalized" (strongly encouraged): the word with FULL diacritics/vowel
  marks so learners can toggle them on. "term" itself must stay PLAIN — no diacritics — because it
  is the identity key that preserves the learner's review history across re-imports. Re-sending
  existing vocab with term_vocalized added enriches the existing rows in place.
- "lessons[].vocab[].morphology" (optional object, language-dependent): for Persian verbs, include
  {"present_stem": ..., "past_stem": ...} so the app can generate conjugation drills.
- "lessons[].exercises" (optional array): when present, it REPLACES all existing exercises for that
  lesson. When the "exercises" key is absent entirely (not just empty), existing exercises for that
  lesson are left untouched — use this to send vocab-only or metadata-only updates.
- "lessons[].exercises[].type" must be one of: to_target, from_target, cloze, scramble.
- Progress data (review history, lesson completions) is never touched by an import, no matter what
  the package contains — re-importing a lesson keeps the learner's SRS history intact.
`;

// Language-specific writing rules layered on top of SCHEMA_DOC. Only Persian has rules worth
// stating today (the only configured language) — emitted purely by languageCode so this stays
// correct if/when a second language is registered without any of these prompts changing shape.
export function buildLanguageRules(languageCode: string): string {
  if (languageCode !== "fa") return "";
  return `
Language rules (Persian):
- Use ZWNJ (U+200C) inside words where Persian requires it: می‌روم, کتاب‌ها — never a plain space, never omitted.
- Use Persian codepoints only: ی (U+06CC) not ي, ک (U+06A9) not ك.
- Digits inside Persian text use the Persian block: ۰۱۲۳۴۵۶۷۸۹.
`;
}

function schemaBlock(languageCode: string): string {
  return `${SCHEMA_DOC}${buildLanguageRules(languageCode)}`;
}

export type CurriculumState = {
  curriculumName: string;
  languageCode: string;
  languageName: string;
  maxLesson: number;
  unitTitles: string[];
  grammarCovered: string[];
  recentVocab: string[];
  lessons: { number: number; title: string; grammar: string[]; vocab: string[] }[];
};

const DISCONNECTED_CLOSING = "Output ONLY the JSON object, no prose, no markdown fences.";
const CONNECTED_CLOSING =
  "Import the result yourself with the import_content_package tool, then confirm to the learner what was imported (curriculum, lessons, vocab counts). Do not show them raw JSON.";

function closing(connected: boolean): string {
  return connected ? CONNECTED_CLOSING : DISCONNECTED_CLOSING;
}

export function buildCreateCoursePrompt(connected: boolean = true): string {
  return `You are designing a complete beginner Farsi curriculum as a content package.
Design 2 units of 10 lessons each (numbers 1-20), each lesson with 12-18 vocab items
(verbs must include morphology.present_stem and morphology.past_stem) and 8-12 exercises mixing all four types.
${schemaBlock("fa")}
${closing(connected)}`;
}

export function buildNextLessonsPrompt(s: CurriculumState, count: number, connected: boolean = true): string {
  return `You are extending the ${s.languageName} curriculum "${s.curriculumName}". It currently ends at lesson ${s.maxLesson}.
Generate lessons ${s.maxLesson + 1} through ${s.maxLesson + count} (start at lesson ${s.maxLesson + 1}).
Grammar already covered (build on it, do not re-teach): ${s.grammarCovered.join(", ")}.
Vocabulary already taught (do NOT duplicate): ${s.recentVocab.join("، ")}.
Each lesson: 12-18 new vocab items (verbs with morphology stems) and 8-12 exercises mixing all four types.
${schemaBlock(s.languageCode)}
${closing(connected)}`;
}

export function buildExercisesPrompt(s: CurriculumState, lessonNumber: number, connected: boolean = true): string {
  const l = s.lessons.find((x) => x.number === lessonNumber);
  if (!l) throw new Error(`no lesson ${lessonNumber}`);
  return `Generate exercises for lesson ${l.number} "${l.title}" of the ${s.languageName} curriculum "${s.curriculumName}".
Grammar points of this lesson: ${l.grammar.join(", ")}.
Vocabulary of this lesson (use these words): ${l.vocab.join("، ")}.
Return a package whose "lessons" array contains ONLY: {"number": ${l.number}, "title": "${l.title}", "exercises": [10-14 items mixing to_target, from_target, cloze, scramble]}.
${schemaBlock(s.languageCode)}
${closing(connected)}`;
}

export function buildAddVocabPrompt(s: CurriculumState, connected: boolean = true): string {
  return `Add supplementary vocabulary to the ${s.languageName} curriculum "${s.curriculumName}".
Existing vocabulary sample (do NOT duplicate): ${s.recentVocab.join("، ")}.
Return a package whose lessons contain only "number", "title" and "vocab" arrays,
attaching new words to the existing lessons they fit best (lessons 1-${s.maxLesson}).
${schemaBlock(s.languageCode)}
${closing(connected)}`;
}
