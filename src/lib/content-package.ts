import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

const VocabSchema = z.object({
  farsi: z.string().min(1), transliteration: z.string().min(1), english: z.string().min(1),
  part_of_speech: z.string().nullish(), present_stem: z.string().nullish(),
  past_stem: z.string().nullish(), colloquial: z.string().nullish(),
  tags: z.array(z.string()).default([]), notes: z.string().nullish(),
});

const ExerciseSchema = z.object({
  type: z.enum(["en_to_fa", "fa_to_en", "cloze", "scramble"]),
  prompt: z.string().min(1), answer: z.string().min(1),
  accept: z.array(z.string()).default([]), hint: z.string().nullish(),
});

const LessonSchema = z.object({
  number: z.number().int().positive(), title: z.string().min(1),
  unit: z.number().int().positive().nullish(), slug: z.string().nullish(),
  grammar_points: z.array(z.string()).default([]),
  estimated_minutes: z.number().int().positive().default(60),
  is_review: z.boolean().default(false), is_assessment: z.boolean().default(false),
  body_md: z.string().nullish(),
  vocab: z.array(VocabSchema).optional(),
  exercises: z.array(ExerciseSchema).optional(),  // absent = leave existing alone
});

export const ContentPackageSchema = z.object({
  format: z.literal("farsi-tracker/content-package"),
  version: z.literal(1),
  course: z.object({ name: z.string().min(1), description: z.string().nullish() }),
  units: z.array(z.object({
    number: z.number().int().positive(), title: z.string().min(1),
    description: z.string().nullish(),
  })).default([]),
  lessons: z.array(LessonSchema).default([]),
});
export type ContentPackage = z.infer<typeof ContentPackageSchema>;
export type ImportResult = { courseId: string; units: number; lessons: number; vocab: number; exercises: number };

export function slugify(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export async function importContentPackage(
  supabase: SupabaseClient, ownerId: string, pkg: ContentPackage,
): Promise<ImportResult> {
  // course
  const { data: course, error: cErr } = await supabase.from("courses")
    .upsert({ owner_id: ownerId, name: pkg.course.name, description: pkg.course.description ?? null },
      { onConflict: "owner_id,name" })
    .select("id").single();
  if (cErr) throw cErr;
  const courseId = course.id as string;

  // units (explicit + any referenced by lessons)
  const unitNumbers = new Set<number>(pkg.units.map((u) => u.number));
  for (const l of pkg.lessons) if (l.unit) unitNumbers.add(l.unit);
  for (const n of unitNumbers) {
    const explicit = pkg.units.find((u) => u.number === n);
    const { error } = await supabase.from("units").upsert(
      { course_id: courseId, number: n, title: explicit?.title ?? `Unit ${n}`,
        description: explicit?.description ?? null },
      { onConflict: "course_id,number" });
    if (error) throw error;
  }
  const { data: units } = await supabase.from("units").select("id, number").eq("course_id", courseId);
  const unitId = new Map((units ?? []).map((u) => [u.number, u.id]));

  let vocabCount = 0, exCount = 0;
  for (const l of pkg.lessons) {
    const { data: lesson, error: lErr } = await supabase.from("lessons").upsert({
      course_id: courseId, number: l.number, title: l.title,
      slug: l.slug ?? slugify(l.title), unit_id: l.unit ? unitId.get(l.unit) : null,
      grammar_points: l.grammar_points, estimated_minutes: l.estimated_minutes,
      is_review: l.is_review, is_assessment: l.is_assessment,
      new_vocab_count: l.vocab?.length ?? null,
      ...(l.body_md != null ? { body_md: l.body_md } : {}),
    }, { onConflict: "course_id,number" }).select("id").single();
    if (lErr) throw lErr;

    for (const v of l.vocab ?? []) {
      const { error } = await supabase.from("vocab_items").upsert({
        course_id: courseId, lesson_id: lesson.id,
        farsi: v.farsi, transliteration: v.transliteration, english: v.english,
        part_of_speech: v.part_of_speech ?? null, present_stem: v.present_stem ?? null,
        past_stem: v.past_stem ?? null, colloquial: v.colloquial ?? null,
        tags: v.tags, notes: v.notes ?? null,
      }, { onConflict: "course_id,lesson_id,farsi" });
      if (error) throw error;
      vocabCount++;
    }

    if (l.exercises) {  // replace-per-lesson, only when provided
      await supabase.from("exercises").delete().eq("lesson_id", lesson.id);
      if (l.exercises.length) {
        const { error } = await supabase.from("exercises").insert(
          l.exercises.map((e, i) => ({ course_id: courseId, lesson_id: lesson.id,
            position: i + 1, type: e.type, prompt: e.prompt, answer: e.answer,
            accept: e.accept, hint: e.hint ?? null })));
        if (error) throw error;
        exCount += l.exercises.length;
      }
    }
  }

  // first course becomes the active one
  await supabase.from("profiles").update({ active_course_id: courseId })
    .eq("id", ownerId).is("active_course_id", null);

  return { courseId, units: unitNumbers.size, lessons: pkg.lessons.length,
           vocab: vocabCount, exercises: exCount };
}
