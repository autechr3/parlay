import { describe, it, expect } from "vitest";
import { ContentPackageSchema, slugify, buildLessonPayload, deriveVocabScript } from "../src/lib/content-package";

const minimal = {
  format: "farsi-tracker/content-package", version: 2,
  curriculum: { name: "Farsi A1", language: "fa" },
  lessons: [{ number: 1, title: "Greetings" }],
};

describe("ContentPackageSchema", () => {
  it("accepts a minimal package", () =>
    expect(ContentPackageSchema.safeParse(minimal).success).toBe(true));
  it("rejects wrong format string", () =>
    expect(ContentPackageSchema.safeParse({ ...minimal, format: "x" }).success).toBe(false));
  it("rejects wrong version", () =>
    expect(ContentPackageSchema.safeParse({ ...minimal, version: 1 }).success).toBe(false));
  it("rejects curriculum missing language", () => {
    const bad = { ...minimal, curriculum: { name: "Farsi A1" } };
    expect(ContentPackageSchema.safeParse(bad).success).toBe(false);
  });
  it("rejects lesson without number", () => {
    const bad = { ...minimal, lessons: [{ title: "no number" }] };
    expect(ContentPackageSchema.safeParse(bad).success).toBe(false);
  });
  it("rejects vocab missing transliteration", () => {
    const bad = { ...minimal, lessons: [{ number: 1, title: "t",
      vocab: [{ term: "کتاب", translation: "book" }] }] };
    expect(ContentPackageSchema.safeParse(bad).success).toBe(false);
  });
  it("rejects whitespace-only vocab fields", () => {
    const bad = { ...minimal, lessons: [{ number: 1, title: "t",
      vocab: [{ term: "کتاب", transliteration: "   ", translation: "book" }] }] };
    expect(ContentPackageSchema.safeParse(bad).success).toBe(false);
  });
  it("rejects whitespace-only term", () => {
    const bad = { ...minimal, lessons: [{ number: 1, title: "t",
      vocab: [{ term: "   ", transliteration: "ketab", translation: "book" }] }] };
    expect(ContentPackageSchema.safeParse(bad).success).toBe(false);
  });
  it("rejects unknown exercise type", () => {
    const bad = { ...minimal, lessons: [{ number: 1, title: "t",
      exercises: [{ type: "multiple_choice", prompt: "p", answer: "a" }] }] };
    expect(ContentPackageSchema.safeParse(bad).success).toBe(false);
  });
  it("accepts to_target/from_target/cloze/scramble exercise types", () => {
    const pkg = { ...minimal, lessons: [{ number: 1, title: "t",
      exercises: [
        { type: "to_target", prompt: "p1", answer: "a1" },
        { type: "from_target", prompt: "p2", answer: "a2" },
        { type: "cloze", prompt: "p3", answer: "a3" },
        { type: "scramble", prompt: "p4", answer: "a4" },
      ] }] };
    expect(ContentPackageSchema.safeParse(pkg).success).toBe(true);
  });
  it("accepts a morphology bag on vocab items", () => {
    const pkg = { ...minimal, lessons: [{ number: 1, title: "t",
      vocab: [{ term: "رفتن", transliteration: "raftan", translation: "to go",
        morphology: { present_stem: "رو", past_stem: "رفت" } }] }] };
    expect(ContentPackageSchema.safeParse(pkg).success).toBe(true);
  });
});

describe("deriveVocabScript — diacritics never leak into the identity key", () => {
  it("plain term, no vocalized form → plain only", () =>
    expect(deriveVocabScript("کتاب")).toEqual({ term: "کتاب" }));
  it("explicit vocalized form is kept, term stripped to plain", () =>
    expect(deriveVocabScript("رفتن", "رَفتَن"))
      .toEqual({ term: "رفتن", term_vocalized: "رَفتَن" }));
  it("diacritics baked into term migrate to term_vocalized", () =>
    expect(deriveVocabScript("رَفتَن"))
      .toEqual({ term: "رفتن", term_vocalized: "رَفتَن" }));
  it("schema accepts term_vocalized on vocab items", () => {
    const pkg = { ...minimal, lessons: [{ number: 1, title: "t",
      vocab: [{ term: "رفتن", term_vocalized: "رَفتَن", transliteration: "raftan", translation: "to go" }] }] };
    expect(ContentPackageSchema.safeParse(pkg).success).toBe(true);
  });
});

describe("slugify", () => {
  it("derives clean slugs", () =>
    expect(slugify("Ezâfe — the Persian Glue!")).toBe("ez-fe-the-persian-glue"));
});

describe("ContentPackageSchema — presence, not defaults", () => {
  it("a partial lesson (number+title+exercises only) parses without gaining defaults", () => {
    const pkg = {
      format: "farsi-tracker/content-package", version: 2,
      curriculum: { name: "Farsi A1", language: "fa" },
      lessons: [{ number: 1, title: "Saying no", exercises: [
        { type: "to_target", prompt: "no", answer: "na" },
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
    format: "farsi-tracker/content-package", version: 2,
    curriculum: { name: "Farsi A1", language: "fa" },
    lessons: [{ number: 1, title: "Saying no", exercises: [
      { type: "to_target", prompt: "no", answer: "na" },
    ] }],
  }).lessons[0];

  it("existing lesson: payload omits slug/grammar_points/flags when absent from package", () => {
    const payload = buildLessonPayload(partial, false, "curriculum-1", new Map());
    expect(payload).not.toHaveProperty("slug");
    expect(payload).not.toHaveProperty("grammar_points");
    expect(payload).not.toHaveProperty("estimated_minutes");
    expect(payload).not.toHaveProperty("is_review");
    expect(payload).not.toHaveProperty("is_assessment");
    expect(payload).not.toHaveProperty("unit_id");
    expect(payload).not.toHaveProperty("new_vocab_count");
    expect(payload).toMatchObject({ curriculum_id: "curriculum-1", number: 1, title: "Saying no" });
  });

  it("new lesson: payload gets slugified title and historical defaults", () => {
    const payload = buildLessonPayload(partial, true, "curriculum-1", new Map());
    expect(payload).toMatchObject({
      curriculum_id: "curriculum-1", number: 1, title: "Saying no",
      slug: slugify("Saying no"),
      grammar_points: [], estimated_minutes: 60,
      is_review: false, is_assessment: false,
    });
  });

  it("provided slug always wins, even for new lessons", () => {
    const lesson = ContentPackageSchema.parse({
      format: "farsi-tracker/content-package", version: 2,
      curriculum: { name: "Farsi A1", language: "fa" },
      lessons: [{ number: 1, title: "Saying no", slug: "saying-no-asking-things-review1" }],
    }).lessons[0];
    const payload = buildLessonPayload(lesson, true, "curriculum-1", new Map());
    expect(payload.slug).toBe("saying-no-asking-things-review1");
  });
});
