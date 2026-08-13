import { describe, it, expect } from "vitest";
import { ContentPackageSchema, slugify, buildLessonPayload } from "../src/lib/content-package";

const minimal = {
  format: "farsi-tracker/content-package", version: 1,
  course: { name: "Farsi A1" },
  lessons: [{ number: 1, title: "Greetings" }],
};

describe("ContentPackageSchema", () => {
  it("accepts a minimal package", () =>
    expect(ContentPackageSchema.safeParse(minimal).success).toBe(true));
  it("rejects wrong format string", () =>
    expect(ContentPackageSchema.safeParse({ ...minimal, format: "x" }).success).toBe(false));
  it("rejects lesson without number", () => {
    const bad = { ...minimal, lessons: [{ title: "no number" }] };
    expect(ContentPackageSchema.safeParse(bad).success).toBe(false);
  });
  it("rejects vocab missing transliteration", () => {
    const bad = { ...minimal, lessons: [{ number: 1, title: "t",
      vocab: [{ farsi: "کتاب", english: "book" }] }] };
    expect(ContentPackageSchema.safeParse(bad).success).toBe(false);
  });
  it("rejects whitespace-only vocab fields", () => {
    const bad = { ...minimal, lessons: [{ number: 1, title: "t",
      vocab: [{ farsi: "کتاب", transliteration: "   ", english: "book" }] }] };
    expect(ContentPackageSchema.safeParse(bad).success).toBe(false);
  });
  it("rejects unknown exercise type", () => {
    const bad = { ...minimal, lessons: [{ number: 1, title: "t",
      exercises: [{ type: "multiple_choice", prompt: "p", answer: "a" }] }] };
    expect(ContentPackageSchema.safeParse(bad).success).toBe(false);
  });
});

describe("slugify", () => {
  it("derives clean slugs", () =>
    expect(slugify("Ezâfe — the Persian Glue!")).toBe("ez-fe-the-persian-glue"));
});

describe("ContentPackageSchema — presence, not defaults", () => {
  it("a partial lesson (number+title+exercises only) parses without gaining defaults", () => {
    const pkg = {
      format: "farsi-tracker/content-package", version: 1,
      course: { name: "Farsi A1" },
      lessons: [{ number: 1, title: "Saying no", exercises: [
        { type: "en_to_fa", prompt: "no", answer: "na" },
      ] }],
    };
    const parsed = ContentPackageSchema.safeParse(pkg);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const lesson = parsed.data.lessons[0];
    expect(lesson.grammar_points).toBeUndefined();
    expect(lesson.estimated_minutes).toBeUndefined();
    expect(lesson.is_review).toBeUndefined();
    expect(lesson.is_assessment).toBeUndefined();
    expect(lesson.slug).toBeUndefined();
  });
});

describe("buildLessonPayload", () => {
  const partial = ContentPackageSchema.parse({
    format: "farsi-tracker/content-package", version: 1,
    course: { name: "Farsi A1" },
    lessons: [{ number: 1, title: "Saying no", exercises: [
      { type: "en_to_fa", prompt: "no", answer: "na" },
    ] }],
  }).lessons[0];

  it("existing lesson: payload omits slug/grammar_points/flags when absent from package", () => {
    const payload = buildLessonPayload(partial, false, "course-1", new Map());
    expect(payload).not.toHaveProperty("slug");
    expect(payload).not.toHaveProperty("grammar_points");
    expect(payload).not.toHaveProperty("estimated_minutes");
    expect(payload).not.toHaveProperty("is_review");
    expect(payload).not.toHaveProperty("is_assessment");
    expect(payload).not.toHaveProperty("unit_id");
    expect(payload).not.toHaveProperty("new_vocab_count");
    expect(payload).toMatchObject({ course_id: "course-1", number: 1, title: "Saying no" });
  });

  it("new lesson: payload gets slugified title and historical defaults", () => {
    const payload = buildLessonPayload(partial, true, "course-1", new Map());
    expect(payload).toMatchObject({
      course_id: "course-1", number: 1, title: "Saying no",
      slug: slugify("Saying no"),
      grammar_points: [], estimated_minutes: 60,
      is_review: false, is_assessment: false,
    });
  });

  it("provided slug always wins, even for new lessons", () => {
    const lesson = ContentPackageSchema.parse({
      format: "farsi-tracker/content-package", version: 1,
      course: { name: "Farsi A1" },
      lessons: [{ number: 1, title: "Saying no", slug: "saying-no-asking-things-review1" }],
    }).lessons[0];
    const payload = buildLessonPayload(lesson, true, "course-1", new Map());
    expect(payload.slug).toBe("saying-no-asking-things-review1");
  });
});
