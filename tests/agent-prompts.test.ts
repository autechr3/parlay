import { describe, it, expect } from "vitest";
import { buildCreateCoursePrompt, buildNextLessonsPrompt, buildExercisesPrompt,
  buildAddVocabPrompt, SCHEMA_DOC, type CurriculumState } from "../src/lib/agent-prompts";
import { ContentPackageSchema } from "../src/lib/content-package";

const state: CurriculumState = {
  curriculumName: "Farsi", languageCode: "fa", languageName: "Persian",
  maxLesson: 10, unitTitles: ["Unit 1"],
  grammarCovered: ["ezâfe", "را", "present stems"],
  recentVocab: ["رفتن", "کتاب"],
  lessons: [{ number: 4, title: "Present Tense I", grammar: ["می- prefix"], vocab: ["رفتن", "آمدن"] }],
};

// Kept in sync with SCHEMA_DOC's example JSON object by hand — this is the same example
// rendered in the doc string, extracted as a real object so it can be validated against the
// actual schema instead of regex-parsed out of the prose.
const SCHEMA_DOC_EXAMPLE = {
  format: "parlay/content-package",
  version: 2,
  curriculum: { name: "Farsi A1", language: "fa", description: "optional" },
  units: [{ number: 1, title: "Foundations", description: null }],
  lessons: [
    {
      number: 4,
      unit: 1,
      title: "Present Tense I",
      slug: "present-tense-i",
      grammar_points: ["می- prefix", "present stems"],
      estimated_minutes: 60,
      is_review: false,
      is_assessment: false,
      body_md: "# Lesson 04 — ...",
      vocab: [
        { term: "رفتن", term_vocalized: "رَفتَن", transliteration: "raftan",
          translation: "to go", part_of_speech: "verb",
          morphology: { present_stem: "رو", past_stem: "رفت" },
          colloquial: null, tags: [] },
      ],
      exercises: [
        { type: "to_target", prompt: "I am going home",
          answer: "من به خانه می‌روم", accept: [], hint: null },
      ],
    },
  ],
};

const CONNECTED_CLOSING =
  "Import the result yourself with the import_content_package tool, then confirm to the learner what was imported (curriculum, lessons, vocab counts). Do not show them raw JSON.";
const DISCONNECTED_CLOSING = "Output ONLY the JSON object, no prose, no markdown fences.";

describe("agent prompts", () => {
  it("every prompt embeds format id, v2 schema and output rule", () => {
    for (const p of [buildCreateCoursePrompt(), buildNextLessonsPrompt(state, 5),
      buildExercisesPrompt(state, 4), buildAddVocabPrompt(state)]) {
      expect(p).toContain("parlay/content-package");
      expect(p).toContain('"version": 2');
      expect(p).toContain('"term"');
      expect(p).toContain('"language": "fa"');
      expect(p).not.toContain('"farsi":');
    }
  });

  it("defaults to connected mode: emits the connected closing, not the JSON-only closing", () => {
    for (const p of [buildCreateCoursePrompt(), buildNextLessonsPrompt(state, 5),
      buildExercisesPrompt(state, 4), buildAddVocabPrompt(state)]) {
      expect(p).toContain(CONNECTED_CLOSING);
      expect(p).not.toContain(DISCONNECTED_CLOSING);
    }
  });

  it("connected=false emits the JSON-only closing, not the connected closing", () => {
    for (const p of [buildCreateCoursePrompt(false), buildNextLessonsPrompt(state, 5, false),
      buildExercisesPrompt(state, 4, false), buildAddVocabPrompt(state, false)]) {
      expect(p).toContain(DISCONNECTED_CLOSING);
      expect(p).not.toContain(CONNECTED_CLOSING);
    }
  });

  it("emits the Persian language rules section (fa curriculum)", () => {
    const p = buildNextLessonsPrompt(state, 5);
    expect(p).toContain("Language rules (Persian)");
    expect(p).toMatch(/ZWNJ|U\+200C/);
  });

  it("omits the Persian language rules section for a non-fa curriculum", () => {
    const other: CurriculumState = { ...state, languageCode: "es", languageName: "Spanish" };
    const p = buildNextLessonsPrompt(other, 5);
    expect(p).not.toContain("Language rules (Persian)");
    expect(p).not.toMatch(/ZWNJ|U\+200C/);
  });

  it("next-lessons prompt embeds curriculum position", () => {
    const p = buildNextLessonsPrompt(state, 5);
    expect(p).toContain("lesson 11");          // continues after maxLesson 10
    expect(p).toContain("ezâfe");              // covered grammar listed
    expect(p).toContain("رفتن");               // existing vocab to avoid duplicating
  });

  it("exercises prompt scopes to one lesson", () => {
    const p = buildExercisesPrompt(state, 4);
    expect(p).toContain("Present Tense I");
    expect(p).toContain("آمدن");
  });

  it("SCHEMA_DOC's example object parses under ContentPackageSchema", () => {
    expect(() => ContentPackageSchema.parse(SCHEMA_DOC_EXAMPLE)).not.toThrow();
  });

  it("SCHEMA_DOC never mentions the old v1 field names", () => {
    expect(SCHEMA_DOC).not.toContain('"farsi":');
    expect(SCHEMA_DOC).not.toContain("farsi_vocalized");
    expect(SCHEMA_DOC).not.toContain('"english":');
    expect(SCHEMA_DOC).not.toContain("en_to_fa");
    expect(SCHEMA_DOC).not.toContain("fa_to_en");
    expect(SCHEMA_DOC).not.toContain('"course"');
    // present_stem/past_stem are still valid — as nested keys inside the new "morphology" object.
    expect(SCHEMA_DOC).toContain('"morphology"');
  });
});
