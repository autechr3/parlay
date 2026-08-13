import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
// Language behavior (diacritic stripping) lives in the per-language TS modules, but content
// packages are validated and their scripts derived BEFORE any language dispatch happens — the
// package doesn't carry a resolved language module yet, just a language code string. Since fa
// is presently the only language configured with diacritics, we import its strip rule directly;
// this only matters for scripts that have diacritics to strip in the first place.
import { stripFaDiacritics } from "./languages/fa";
import { upconvertV1 } from "./package-v1";

const VocabSchema = z.object({
  term: z.string().trim().min(1),
  term_vocalized: z.string().trim().min(1).nullish(),
  transliteration: z.string().trim().min(1),
  translation: z.string().trim().min(1),
  part_of_speech: z.string().trim().min(1).nullish(),
  morphology: z.record(z.string(), z.string()).optional(),
  colloquial: z.string().trim().min(1).nullish(),
  tags: z.array(z.string()).default([]),
  notes: z.string().trim().min(1).nullish(),
});

const ExerciseSchema = z.object({
  type: z.enum(["to_target", "from_target", "cloze", "scramble"]),
  prompt: z.string().trim().min(1), answer: z.string().trim().min(1),
  accept: z.array(z.string()).default([]), hint: z.string().trim().min(1).nullish(),
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
  version: z.literal(2),
  curriculum: z.object({
    name: z.string().trim().min(1),
    language: z.string().trim().min(1),
    description: z.string().nullish(),
  }),
  units: z.array(z.object({
    number: z.number().int().positive(), title: z.string().min(1),
    description: z.string().nullish(),
  })).default([]),
  lessons: z.array(LessonSchema).default([]),
});
export type ContentPackage = z.infer<typeof ContentPackageSchema>;
export type ImportResult = { curriculumId: string; units: number; lessons: number; vocab: number; exercises: number };

// Parses a package of either version: a v1 payload is upconverted to v2 first, a v2 payload
// (or anything else) passes straight to the schema so validation errors surface normally.
export function parseAnyPackage(raw: unknown): ContentPackage {
  return ContentPackageSchema.parse(upconvertV1(raw));
}

// vocab_items are upserted on (curriculum, lesson, term), so diacritics in the term
// field would mint a NEW row and orphan the word's SRS history. The plain form is
// always the identity key; the vocalized form (explicit, or term itself when an
// agent baked marks into it) rides along in term_vocalized.
export function deriveVocabScript(
  term: string, vocalized?: string | null,
): { term: string; term_vocalized?: string } {
  const plain = stripFaDiacritics(term);
  const voc = vocalized ?? (plain !== term ? term : undefined);
  return voc ? { term: plain, term_vocalized: voc } : { term: plain };
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
  l: Lesson, isNew: boolean, curriculumId: string, unitId: Map<number, string>,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    curriculum_id: curriculumId, number: l.number, title: l.title,
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
  // language: validate against the actual configured set before touching curriculums
  const { data: languages, error: langErr } = await supabase.from("languages").select("code");
  if (langErr) throw langErr;
  const supportedCodes = (languages ?? []).map((l) => l.code as string);
  if (!supportedCodes.includes(pkg.curriculum.language)) {
    throw new Error(`unsupported language "${pkg.curriculum.language}" — supported: ${supportedCodes.join(", ")}`);
  }

  // curriculum
  const { data: curriculum, error: curErr } = await supabase.from("curriculums")
    .upsert({ owner_id: ownerId, name: pkg.curriculum.name, description: pkg.curriculum.description ?? null,
      language_code: pkg.curriculum.language },
      { onConflict: "owner_id,name" })
    .select("id").single();
  if (curErr) throw curErr;
  const curriculumId = curriculum.id as string;

  // units (explicit + any referenced by lessons)
  const unitNumbers = new Set<number>(pkg.units.map((u) => u.number));
  for (const l of pkg.lessons) if (l.unit) unitNumbers.add(l.unit);
  for (const n of unitNumbers) {
    const explicit = pkg.units.find((u) => u.number === n);
    const { error } = await supabase.from("units").upsert(
      { curriculum_id: curriculumId, number: n, title: explicit?.title ?? `Unit ${n}`,
        description: explicit?.description ?? null },
      { onConflict: "curriculum_id,number" });
    if (error) throw error;
  }
  const { data: units, error: uErr } = await supabase.from("units").select("id, number").eq("curriculum_id", curriculumId);
  if (uErr) throw uErr;
  const unitId = new Map((units ?? []).map((u) => [u.number, u.id]));

  const { data: existingLessons, error: elErr } = await supabase
    .from("lessons").select("number").eq("curriculum_id", curriculumId);
  if (elErr) throw elErr;
  const existingNumbers = new Set((existingLessons ?? []).map((l) => l.number));

  let vocabCount = 0, exCount = 0;
  for (const l of pkg.lessons) {
    const isNew = !existingNumbers.has(l.number);
    const payload = buildLessonPayload(l, isNew, curriculumId, unitId);
    const { data: lesson, error: lErr } = await supabase.from("lessons").upsert(
      payload, { onConflict: "curriculum_id,number" },
    ).select("id").single();
    if (lErr) throw lErr;

    for (const v of l.vocab ?? []) {
      // Presence-aware: term_vocalized joins the payload only when derivable, and morphology
      // only when the package actually supplied it — a re-import without either doesn't null
      // out an existing vocalized form or existing morphology.
      const script = deriveVocabScript(v.term, v.term_vocalized);
      const { error } = await supabase.from("vocab_items").upsert({
        curriculum_id: curriculumId, lesson_id: lesson.id,
        ...script, transliteration: v.transliteration, translation: v.translation,
        part_of_speech: v.part_of_speech ?? null,
        ...(v.morphology !== undefined ? { morphology: v.morphology } : {}),
        colloquial: v.colloquial ?? null,
        tags: v.tags, notes: v.notes ?? null,
      }, { onConflict: "curriculum_id,lesson_id,term" });
      if (error) throw error;
      vocabCount++;
    }

    if (l.exercises) {  // replace-per-lesson, only when provided
      const { error: delErr } = await supabase.from("exercises").delete().eq("lesson_id", lesson.id);
      if (delErr) throw delErr;
      if (l.exercises.length) {
        const { error } = await supabase.from("exercises").insert(
          l.exercises.map((e, i) => ({ curriculum_id: curriculumId, lesson_id: lesson.id,
            position: i + 1, type: e.type, prompt: e.prompt, answer: e.answer,
            accept: e.accept, hint: e.hint ?? null })));
        if (error) throw error;
        exCount += l.exercises.length;
      }
    }
  }

  // first curriculum becomes the active one
  const { error: pErr } = await supabase.from("profiles").update({ active_curriculum_id: curriculumId })
    .eq("id", ownerId).is("active_curriculum_id", null);
  if (pErr) throw pErr;

  return { curriculumId, units: unitNumbers.size, lessons: pkg.lessons.length,
           vocab: vocabCount, exercises: exCount };
}
