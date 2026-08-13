import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { stripFaDiacritics } from "./farsi";

const VocabSchema = z.object({
  farsi: z.string().trim().min(1), transliteration: z.string().trim().min(1),
  english: z.string().trim().min(1), farsi_vocalized: z.string().trim().min(1).nullish(),
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
  // No defaults here: absent fields must stay absent so a partial package (e.g. the
  // number+title+exercises shape /prompts tells agents to emit) doesn't overwrite
  // existing lesson data with these fallbacks. Defaults are applied in
  // buildLessonPayload, but only for genuinely NEW lessons.
  grammar_points: z.array(z.string()).optional(),
  estimated_minutes: z.number().int().positive().optional(),
  is_review: z.boolean().optional(), is_assessment: z.boolean().optional(),
  body_md: z.string().nullish(),
  vocab: z.array(VocabSchema).optional(),
  exercises: z.array(ExerciseSchema).optional(),  // absent = leave existing alone
});
export type Lesson = z.infer<typeof LessonSchema>;

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

// vocab_items are upserted on (course, lesson, farsi), so diacritics in the farsi
// field would mint a NEW row and orphan the word's SRS history. The plain form is
// always the identity key; the vocalized form (explicit, or farsi itself when an
// agent baked marks into it) rides along in farsi_vocalized.
export function deriveVocabScript(
  farsi: string, vocalized?: string | null,
): { farsi: string; farsi_vocalized?: string } {
  const plain = stripFaDiacritics(farsi);
  const voc = vocalized ?? (plain !== farsi ? farsi : undefined);
  return voc ? { farsi: plain, farsi_vocalized: voc } : { farsi: plain };
}

export function slugify(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// Pure payload builder for the lessons upsert. Presence-aware: a field is only
// included in the payload when it was actually provided in the package, EXCEPT
// for genuinely new lessons (isNew=true), where the DB requires slug and the
// historical defaults (grammar [], 60min, not review/assessment) are applied so
// a brand-new lesson always lands in a fully-populated state.
export function buildLessonPayload(
  l: Lesson, isNew: boolean, courseId: string, unitId: Map<number, string>,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    course_id: courseId, number: l.number, title: l.title,
    ...(l.unit ? { unit_id: unitId.get(l.unit) } : {}),
  };

  if (l.slug != null) payload.slug = l.slug;
  else if (isNew) payload.slug = slugify(l.title);

  if (l.grammar_points !== undefined) payload.grammar_points = l.grammar_points;
  else if (isNew) payload.grammar_points = [];

  if (l.estimated_minutes !== undefined) payload.estimated_minutes = l.estimated_minutes;
  else if (isNew) payload.estimated_minutes = 60;

  if (l.is_review !== undefined) payload.is_review = l.is_review;
  else if (isNew) payload.is_review = false;

  if (l.is_assessment !== undefined) payload.is_assessment = l.is_assessment;
  else if (isNew) payload.is_assessment = false;

  if (l.vocab !== undefined) payload.new_vocab_count = l.vocab.length;

  if (l.body_md != null) payload.body_md = l.body_md;

  return payload;
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
  const { data: units, error: uErr } = await supabase.from("units").select("id, number").eq("course_id", courseId);
  if (uErr) throw uErr;
  const unitId = new Map((units ?? []).map((u) => [u.number, u.id]));

  const { data: existingLessons, error: elErr } = await supabase
    .from("lessons").select("number").eq("course_id", courseId);
  if (elErr) throw elErr;
  const existingNumbers = new Set((existingLessons ?? []).map((l) => l.number));

  let vocabCount = 0, exCount = 0;
  for (const l of pkg.lessons) {
    const isNew = !existingNumbers.has(l.number);
    const payload = buildLessonPayload(l, isNew, courseId, unitId);
    const { data: lesson, error: lErr } = await supabase.from("lessons").upsert(
      payload, { onConflict: "course_id,number" },
    ).select("id").single();
    if (lErr) throw lErr;

    for (const v of l.vocab ?? []) {
      // Presence-aware: farsi_vocalized joins the payload only when derivable, so a
      // re-import without it doesn't null out an existing vocalized form.
      const script = deriveVocabScript(v.farsi, v.farsi_vocalized);
      const { error } = await supabase.from("vocab_items").upsert({
        course_id: courseId, lesson_id: lesson.id,
        ...script, transliteration: v.transliteration, english: v.english,
        part_of_speech: v.part_of_speech ?? null, present_stem: v.present_stem ?? null,
        past_stem: v.past_stem ?? null, colloquial: v.colloquial ?? null,
        tags: v.tags, notes: v.notes ?? null,
      }, { onConflict: "course_id,lesson_id,farsi" });
      if (error) throw error;
      vocabCount++;
    }

    if (l.exercises) {  // replace-per-lesson, only when provided
      const { error: delErr } = await supabase.from("exercises").delete().eq("lesson_id", lesson.id);
      if (delErr) throw delErr;
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
  const { error: pErr } = await supabase.from("profiles").update({ active_course_id: courseId })
    .eq("id", ownerId).is("active_course_id", null);
  if (pErr) throw pErr;

  return { courseId, units: unitNumbers.size, lessons: pkg.lessons.length,
           vocab: vocabCount, exercises: exCount };
}
