// Pure, testable prompt builders for the /prompts agent-prompt library.
// No imports needed — this module has zero dependencies on Next.js or Supabase.

export const SCHEMA_DOC = `
You must return a single JSON object in the "farsi-tracker/content-package" format. Full example:

{
  "format": "farsi-tracker/content-package",
  "version": 1,
  "course": { "name": "Farsi A1", "description": "optional" },
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
        { "farsi": "رفتن", "transliteration": "raftan", "english": "to go",
          "part_of_speech": "verb", "present_stem": "رو", "past_stem": "رفت",
          "colloquial": null, "tags": [] }
      ],
      "exercises": [
        { "type": "en_to_fa", "prompt": "I am going home",
          "answer": "من به خانه می‌روم", "accept": [], "hint": null }
      ]
    }
  ]
}

Field notes:
- "format" (required): must be exactly the literal string "farsi-tracker/content-package".
- "version" (required): must be exactly the number 1.
- "course.name" (required): the course is matched on (owner, name) — an existing course with this
  exact name is updated in place, otherwise a new one is created. "course.description" is optional.
- "units" (optional array): each unit is matched on (course, number); "title" describes it,
  "description" may be null. Units referenced by a lesson's "unit" number are created automatically
  with a default title if not listed here.
- "lessons" (optional array): each lesson requires "number" and "title" — every other lesson field
  is optional. Lessons are matched on (course, number); matching fields (including "body_md") are
  updated in place, never duplicated.
- "lessons[].vocab" (optional array): each item is upserted on (course, lesson, farsi). Only "farsi",
  "transliteration" and "english" are required per vocab item; the rest may be omitted or null.
- "lessons[].exercises" (optional array): when present, it REPLACES all existing exercises for that
  lesson. When the "exercises" key is absent entirely (not just empty), existing exercises for that
  lesson are left untouched — use this to send vocab-only or metadata-only updates.
- Progress data (review history, lesson completions) is never touched by an import, no matter what
  the package contains — re-importing a lesson keeps the learner's SRS history intact.

Persian orthography rules (mandatory):
- Use ZWNJ (U+200C) inside words where Persian requires it: می‌روم, کتاب‌ها — never a plain space, never omitted.
- Use Persian codepoints only: ی (U+06CC) not ي, ک (U+06A9) not ك.
- Digits inside Persian text use the Persian block: ۰۱۲۳۴۵۶۷۸۹.
- exercises[].type must be one of: en_to_fa, fa_to_en, cloze, scramble.
`;

export type CourseState = {
  courseName: string;
  maxLesson: number;
  unitTitles: string[];
  grammarCovered: string[];
  recentVocab: string[];
  lessons: { number: number; title: string; grammar: string[]; vocab: string[] }[];
};

const CLOSING = "Output ONLY the JSON object, no prose, no markdown fences.";

export function buildCreateCoursePrompt(): string {
  return `You are designing a complete beginner Farsi curriculum as a content package.
Design 2 units of 10 lessons each (numbers 1-20), each lesson with 12-18 vocab items
(verbs must include present_stem and past_stem) and 8-12 exercises mixing all four types.
${SCHEMA_DOC}
${CLOSING}`;
}

export function buildNextLessonsPrompt(s: CourseState, count: number): string {
  return `You are extending the Farsi course "${s.courseName}". It currently ends at lesson ${s.maxLesson}.
Generate lessons ${s.maxLesson + 1} through ${s.maxLesson + count} (start at lesson ${s.maxLesson + 1}).
Grammar already covered (build on it, do not re-teach): ${s.grammarCovered.join(", ")}.
Vocabulary already taught (do NOT duplicate): ${s.recentVocab.join("، ")}.
Each lesson: 12-18 new vocab items (verbs with stems) and 8-12 exercises mixing all four types.
${SCHEMA_DOC}
${CLOSING}`;
}

export function buildExercisesPrompt(s: CourseState, lessonNumber: number): string {
  const l = s.lessons.find((x) => x.number === lessonNumber);
  if (!l) throw new Error(`no lesson ${lessonNumber}`);
  return `Generate exercises for lesson ${l.number} "${l.title}" of the Farsi course "${s.courseName}".
Grammar points of this lesson: ${l.grammar.join(", ")}.
Vocabulary of this lesson (use these words): ${l.vocab.join("، ")}.
Return a package whose "lessons" array contains ONLY: {"number": ${l.number}, "title": "${l.title}", "exercises": [10-14 items mixing en_to_fa, fa_to_en, cloze, scramble]}.
${SCHEMA_DOC}
${CLOSING}`;
}

export function buildAddVocabPrompt(s: CourseState): string {
  return `Add supplementary vocabulary to the Farsi course "${s.courseName}".
Existing vocabulary sample (do NOT duplicate): ${s.recentVocab.join("، ")}.
Return a package whose lessons contain only "number", "title" and "vocab" arrays,
attaching new words to the existing lessons they fit best (lessons 1-${s.maxLesson}).
${SCHEMA_DOC}
${CLOSING}`;
}
