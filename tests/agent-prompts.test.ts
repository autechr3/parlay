import { describe, it, expect } from "vitest";
import { buildCreateCoursePrompt, buildNextLessonsPrompt, buildExercisesPrompt,
  buildAddVocabPrompt, type CourseState } from "../src/lib/agent-prompts";

const state: CourseState = {
  courseName: "Farsi", maxLesson: 10, unitTitles: ["Unit 1"],
  grammarCovered: ["ezâfe", "را", "present stems"],
  recentVocab: ["رفتن", "کتاب"],
  lessons: [{ number: 4, title: "Present Tense I", grammar: ["می- prefix"], vocab: ["رفتن", "آمدن"] }],
};

describe("agent prompts", () => {
  it("every prompt embeds format id, schema and output rule", () => {
    for (const p of [buildCreateCoursePrompt(), buildNextLessonsPrompt(state, 5),
      buildExercisesPrompt(state, 4), buildAddVocabPrompt(state)]) {
      expect(p).toContain("farsi-tracker/content-package");
      expect(p).toContain('"version": 1');
      expect(p).toMatch(/ZWNJ|U\+200C/);
      expect(p).toContain("Output ONLY the JSON");
    }
  });
  it("next-lessons prompt embeds course position", () => {
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
});
