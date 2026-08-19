import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLanguage } from "@/lib/languages";
import { importContentPackage, deriveVocabScript, type ContentPackage } from "@/lib/content-package";
import { buildTutorSkill, buildFirstCurriculumGuidance } from "@/lib/tutor-skill";
import { pickWeakSkills, rankErrors, curriculumConflictMessage, DIRECTIONS, drillGrade, drillDirection } from "./helpers";
import type { GradeDirection } from "./helpers";
import type { Drill } from "../exercises/schema";

// Re-exported so any caller that only needs the data layer's surface can import
// from a single module; tests import the pure functions directly from ./helpers
// (this file starts with "server-only" and can't be loaded from vitest).
export { pickWeakSkills, rankErrors, curriculumConflictMessage } from "./helpers";
export type { GradeDirection } from "./helpers";

type Admin = ReturnType<typeof createAdminClient>;

// Same env var and fallback as route.ts's SITE const — duplicated rather than threaded
// through getTutorInstructions's params because every other MCP data-layer function takes
// only (userId, ...domain args), and this one follows that same call shape from route.ts.
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export type StudyState = {
  streak: number;
  cardsDue: number;
  nextLesson: { number: number; title: string; slug: string } | null;
  lessonsThisWeek: number;
  weeklyTarget: number;
  weakSkills: { skill: string; rating: number }[];
  topErrors: { error: string; count: number }[];
  curriculum: { name: string; language: string } | null;
};

export type PracticeSessionInput = {
  lesson_number?: number | null;
  duration_minutes?: number | null;
  mode?: string;
  errors?: string[] | null;
  strengths?: string[] | null;
  raw_log?: string | null;
};

export type CompleteLessonInput = {
  lesson_number: number;
  minutes_spent?: number | null;
  homework_done?: boolean;
  negar_drill_done?: boolean;
  confidence?: number | null;
  notes?: string | null;
  // mirrors the `skill:<name>` formData fields in src/app/lessons/actions.ts —
  // one rating per skill, keyed by skill name.
  skills?: Record<string, number>;
};

export type VocabInput = {
  term: string;
  term_vocalized?: string | null;
  transliteration: string;
  translation: string;
  part_of_speech?: string | null;
  lesson_id?: number | null;
  morphology?: Record<string, string> | null;
  colloquial?: string | null;
};

// Every curriculum-content query (lessons, vocab_items) must be scoped through this —
// the admin client bypasses RLS entirely, so tenant isolation here is on us, not Postgres.
async function ownedCurriculumIds(admin: Admin, userId: string): Promise<string[]> {
  const { data, error } = await admin.from("curriculums").select("id").eq("owner_id", userId);
  if (error) throw error;
  return (data ?? []).map((c) => c.id as string);
}

// Resolves the caller's active curriculum (name + language code), for embedding into
// get_study_state and for picking the right normalizer in searchVocab. Returns null when
// the profile has no active_curriculum_id, or it doesn't resolve to a row the caller owns.
//
// active_curriculum_id is user-mutable via PostgREST and its RLS policy has no FK-target
// ownership check (a user can PATCH it to any curriculum UUID, not just one they own); the
// admin client also bypasses RLS entirely. So this can't be a plain lookup — it must
// re-verify ownership itself, exactly like addVocab's active-curriculum check, or a foreign
// curriculum's name/language could leak into get_study_state and steer searchVocab's
// normalizer. Two explicit queries (not a profiles->curriculums embed): PostgREST rejects an
// embed here as ambiguous anyway, since two FKs connect profiles and curriculums
// (curriculums.owner_id -> profiles.id and profiles.active_curriculum_id -> curriculums.id).
async function activeCurriculum(
  admin: Admin, userId: string,
): Promise<{ name: string; language: string } | null> {
  const { data: profile, error: pErr } = await admin.from("profiles")
    .select("active_curriculum_id").eq("id", userId).single();
  if (pErr) throw pErr;
  if (!profile?.active_curriculum_id) return null;

  const { data: curriculum, error: cErr } = await admin.from("curriculums")
    .select("name, language_code")
    .eq("id", profile.active_curriculum_id).eq("owner_id", userId).maybeSingle();
  if (cErr) throw cErr;
  return curriculum ? { name: curriculum.name as string, language: curriculum.language_code as string } : null;
}

export async function getStudyState(userId: string): Promise<StudyState> {
  const admin = createAdminClient();
  const curriculumIds = await ownedCurriculumIds(admin, userId);
  const today = new Date().toISOString().slice(0, 10);
  // Monday-anchored week, matching src/app/page.tsx's "lessons this week" tile.
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  weekStart.setHours(0, 0, 0, 0);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 864e5).toISOString();

  // cardsDue is scoped through vocab_items!inner + curriculum_id so a planted vocab_reviews
  // row pointing at foreign vocab (e.g. via a bypassed toggleSuspend) can't inflate the
  // count — mirrors getDueVocab/getStrugglingVocab's scoping below.
  const cardsDuePromise = curriculumIds.length === 0
    ? Promise.resolve({ count: 0, error: null })
    : admin.from("vocab_reviews")
        .select("id, vocab_items!inner(curriculum_id)", { count: "exact", head: true })
        .eq("user_id", userId).eq("suspended", false).lte("due_on", today)
        .in("vocab_items.curriculum_id", curriculumIds);

  const [
    { data: streakData, error: streakErr },
    { count: cardsDue, error: cardsErr },
    { data: nextLessonRows, error: nextErr },
    { data: profile, error: profErr },
    { data: comps, error: compsErr },
    { data: ratings, error: ratingsErr },
    { data: sessions, error: sessionsErr },
    curriculum,
  ] = await Promise.all([
    admin.rpc("current_streak", { p_user: userId }),
    cardsDuePromise,
    admin.rpc("next_lesson_for", { p_user: userId, p_limit: 1 }),
    admin.from("profiles").select("target_lessons_per_week").eq("id", userId).single(),
    admin.from("lesson_completions").select("completed_at").eq("user_id", userId)
      .gte("completed_at", weekStart.toISOString()),
    admin.from("skill_ratings").select("skill, rating, rated_at").eq("user_id", userId),
    admin.from("practice_sessions").select("errors").eq("user_id", userId)
      .gte("occurred_at", thirtyDaysAgo),
    activeCurriculum(admin, userId),
  ]);

  if (streakErr) throw streakErr;
  if (cardsErr) throw cardsErr;
  if (nextErr) throw nextErr;
  if (profErr) throw profErr;
  if (compsErr) throw compsErr;
  if (ratingsErr) throw ratingsErr;
  if (sessionsErr) throw sessionsErr;

  const nextRow = (nextLessonRows ?? [])[0] as
    | { number: number; title: string; slug: string }
    | undefined;

  return {
    streak: Number(streakData ?? 0),
    cardsDue: cardsDue ?? 0,
    nextLesson: nextRow ? { number: nextRow.number, title: nextRow.title, slug: nextRow.slug } : null,
    lessonsThisWeek: (comps ?? []).length,
    weeklyTarget: profile?.target_lessons_per_week ?? 5,
    weakSkills: pickWeakSkills(ratings ?? []),
    topErrors: rankErrors(sessions ?? []),
    curriculum,
  };
}

const LESSON_COLS_NO_BODY =
  "id, curriculum_id, number, unit_id, title, slug, filename, grammar_points, new_vocab_count, estimated_minutes, is_review, is_assessment";
const LESSON_COLS_WITH_BODY = `${LESSON_COLS_NO_BODY}, body_md`;

export async function getLesson(userId: string, lessonNumber: number, includeBody: boolean) {
  const admin = createAdminClient();
  const curriculumIds = await ownedCurriculumIds(admin, userId);
  if (curriculumIds.length === 0) return null;
  const { data, error } = await admin.from("lessons")
    .select(includeBody ? LESSON_COLS_WITH_BODY : LESSON_COLS_NO_BODY)
    .in("curriculum_id", curriculumIds).eq("number", lessonNumber).maybeSingle();
  if (error) throw error;
  return data ?? null;
}

// !inner turns the embed into an inner join so .in("vocab_items.curriculum_id", ...) actually
// filters the vocab_reviews rows (a left-embed filter here would only null out the nested
// object, not drop the row) — this is what closes the cross-tenant leak: a vocab_reviews
// row planted against foreign vocab_items (e.g. via a bypassed toggleSuspend upsert) is
// excluded rather than surfaced with its real (foreign) vocab data.
const VOCAB_REVIEW_JOIN_COLS =
  "vocab_id, due_on, ease, repetitions, lapses, vocab_items!inner(id, term, term_vocalized, transliteration, translation, part_of_speech, morphology, colloquial, curriculum_id)";

export async function getDueVocab(userId: string, limit: number) {
  const admin = createAdminClient();
  const curriculumIds = await ownedCurriculumIds(admin, userId);
  if (curriculumIds.length === 0) return [];
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await admin.from("vocab_reviews")
    .select(VOCAB_REVIEW_JOIN_COLS)
    .eq("user_id", userId).eq("suspended", false).lte("due_on", today)
    .in("vocab_items.curriculum_id", curriculumIds)
    .order("due_on").limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function getStrugglingVocab(userId: string, limit: number) {
  const admin = createAdminClient();
  const curriculumIds = await ownedCurriculumIds(admin, userId);
  if (curriculumIds.length === 0) return [];
  const { data, error } = await admin.from("vocab_reviews")
    .select(VOCAB_REVIEW_JOIN_COLS)
    .eq("user_id", userId).or("lapses.gte.2,ease.lte.1.6")
    .in("vocab_items.curriculum_id", curriculumIds)
    .order("lapses", { ascending: false }).order("ease", { ascending: true }).limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function searchVocab(userId: string, query: string, limit: number) {
  const admin = createAdminClient();
  const curriculumIds = await ownedCurriculumIds(admin, userId);
  if (curriculumIds.length === 0) return [];
  let q = admin.from("vocab_items")
    .select("id, term, transliteration, translation, part_of_speech, lesson_id, tags")
    .in("curriculum_id", curriculumIds).order("term").limit(limit);
  const isTargetScript = /[؀-ۿ]/.test(query);
  if (isTargetScript) {
    // Diacritics/search normalization is language-specific — resolve it from the caller's
    // active curriculum rather than hardcoding Farsi's normalizer, mirroring src/app/vocab/page.tsx.
    const curriculum = await activeCurriculum(admin, userId);
    const language = getLanguage(curriculum?.language ?? "");
    q = q.ilike("term_normalized", `%${language.normalize(query)}%`);
  } else {
    // Same sanitizer as src/app/vocab/page.tsx: strip characters that would break
    // out of the .or() filter-string grammar (commas separate clauses, parens/quotes
    // are structural) rather than reject or escape them.
    const safe = query.replace(/[,()"]/g, " ");
    q = q.or(`translation.ilike.%${safe}%,transliteration.ilike.%${safe}%`);
  }
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function logPracticeSession(userId: string, input: PracticeSessionInput): Promise<string> {
  const admin = createAdminClient();
  let lessonId: number | null = null;
  if (input.lesson_number != null) {
    const curriculumIds = await ownedCurriculumIds(admin, userId);
    const { data: lesson, error: lErr } = await admin.from("lessons").select("id")
      .in("curriculum_id", curriculumIds).eq("number", input.lesson_number).maybeSingle();
    if (lErr) throw lErr;
    if (!lesson) throw new Error(`lesson ${input.lesson_number} not found`);
    lessonId = lesson.id as number;
  }
  const { data, error } = await admin.from("practice_sessions").insert({
    user_id: userId,
    lesson_id: lessonId,
    duration_minutes: input.duration_minutes ?? null,
    mode: input.mode ?? "lesson",
    errors: input.errors ?? null,
    strengths: input.strengths ?? null,
    raw_log: input.raw_log ?? null,
  }).select("id").single();
  if (error) throw error;
  return data.id as string;
}

// Mirrors src/app/lessons/actions.ts exactly: 23505 (duplicate completion) is
// tolerated and treated as a no-op re-submit; bump_study_day_for only runs on a
// genuinely fresh insert; invalid skill ratings are silently skipped (not thrown —
// only insert errors are), same as the original formData loop.
export async function completeLesson(userId: string, input: CompleteLessonInput) {
  const admin = createAdminClient();
  const curriculumIds = await ownedCurriculumIds(admin, userId);
  const { data: lesson, error: lErr } = await admin.from("lessons").select("id")
    .in("curriculum_id", curriculumIds).eq("number", input.lesson_number).maybeSingle();
  if (lErr) throw lErr;
  if (!lesson) throw new Error(`lesson ${input.lesson_number} not found`);
  const lessonId = lesson.id as number;

  const confidence = input.confidence != null && input.confidence >= 1 && input.confidence <= 5
    ? input.confidence : null;

  const { error } = await admin.from("lesson_completions").insert({
    user_id: userId,
    lesson_id: lessonId,
    minutes_spent: input.minutes_spent ?? null,
    homework_done: !!input.homework_done,
    negar_drill_done: !!input.negar_drill_done,
    confidence,
    notes: input.notes ?? null,
  });
  // Tolerate re-submits: a unique-violation on (user_id, lesson_id) means this lesson
  // was already marked complete. PostgREST surfaces that as Postgres error code 23505
  // with a "duplicate key value violates unique constraint" message — check both.
  const isDuplicate = !!error && (error.code === "23505" || error.message.includes("duplicate"));
  if (error && !isDuplicate) throw error;
  if (!isDuplicate) {
    const { error: bumpErr } = await admin.rpc("bump_study_day_for", { p_user: userId });
    if (bumpErr) throw bumpErr;
  }

  for (const [skill, ratingRaw] of Object.entries(input.skills ?? {})) {
    const n = Number(ratingRaw);
    if (Number.isInteger(n) && n >= 1 && n <= 5) {
      const { error: skillErr } = await admin.from("skill_ratings").insert({
        user_id: userId, lesson_id: lessonId, skill, rating: n,
      });
      if (skillErr) throw skillErr;
    }
  }

  return { lessonId, alreadyCompleted: isDuplicate };
}

export async function addVocab(userId: string, item: VocabInput): Promise<string> {
  const admin = createAdminClient();
  const term = item.term.trim();
  const translit = item.transliteration.trim();
  const translation = item.translation.trim();
  if (!term || !translit || !translation) throw new Error("term, transliteration, translation required");

  const { data: profile, error: pErr } = await admin.from("profiles")
    .select("active_curriculum_id").eq("id", userId).single();
  if (pErr) throw pErr;
  if (!profile?.active_curriculum_id) throw new Error("no active curriculum — import one first");

  // active_curriculum_id is user-mutable via PostgREST; verify ownership before the admin-client write
  const { data: ownedCurriculum, error: cErr } = await admin.from("curriculums")
    .select("id").eq("id", profile.active_curriculum_id).eq("owner_id", userId).maybeSingle();
  if (cErr) throw cErr;
  if (!ownedCurriculum) throw new Error("no active curriculum — import one first");

  // Same diacritics rule as package import: plain term is the identity key.
  const script = deriveVocabScript(term, item.term_vocalized?.trim() || null);
  const { data, error } = await admin.from("vocab_items").insert({
    curriculum_id: ownedCurriculum.id,
    ...script, transliteration: translit, translation,
    part_of_speech: item.part_of_speech ?? null,
    lesson_id: item.lesson_id ?? null,
    morphology: item.morphology ?? null,
    colloquial: item.colloquial ?? null,
    tags: ["manual"],
  }).select("id").single();
  if (error) throw error;
  return data.id as string;
}

// Same second-curriculum guard and message as src/app/curriculums/import/actions.ts.
export async function importPackage(userId: string, pkg: ContentPackage) {
  const admin = createAdminClient();
  const { data: ownedCurriculums, error: ownedErr } = await admin.from("curriculums")
    .select("name").eq("owner_id", userId);
  if (ownedErr) throw ownedErr;
  const conflict = curriculumConflictMessage(
    (ownedCurriculums ?? []).map((c) => c.name as string), pkg.curriculum.name,
  );
  if (conflict) throw new Error(conflict);
  return importContentPackage(admin, userId, pkg);
}

export async function getReviewQueue(userId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("get_review_queue_for", { p_user: userId });
  if (error) throw error;
  return data ?? [];
}

export async function gradeCard(
  userId: string,
  vocabId: string,
  grade: number,
  direction: GradeDirection = "fa_to_en",
  msTaken?: number | null,
) {
  if (!Number.isInteger(grade) || grade < 0 || grade > 5) throw new Error("grade out of range");
  if (!DIRECTIONS.includes(direction)) throw new Error("invalid direction");
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("grade_card_for", {
    p_user: userId,
    p_vocab_id: vocabId,
    p_grade: grade,
    p_direction: direction,
    p_ms_taken: msTaken ?? null,
  });
  if (error) throw error;
  return data;
}

// userId is accepted (and unused) only to keep this function's call shape consistent with
// every other MCP data-layer function, which route.ts invokes as (userId, ...args) — the
// response itself is language-scoped, not user-scoped: it's the same tutor-skill text for
// every caller who asks for a given language, with no per-user data read or written.
export async function getTutorInstructions(userId: string, language: string): Promise<string> {
  const admin = createAdminClient();
  const { data: languages, error } = await admin.from("languages").select("code, name");
  if (error) throw error;
  const rows = languages ?? [];
  const row = rows.find((l) => l.code === language);
  if (!row) {
    const codes = rows.map((l) => l.code as string);
    throw new Error(`unsupported language "${language}" — supported: ${codes.join(", ")}`);
  }
  const skill = buildTutorSkill({
    languageCode: language,
    languageName: row.name as string,
    siteUrl: SITE,
    flavor: "gpt-instructions",
  });
  return skill + "\n" + buildFirstCurriculumGuidance(row.name as string);
}

export type RecordAttemptInput = {
  drill_id: string;
  exercise_id: string;
  correct: boolean;
  answer_given?: string;
  ms_taken?: number;
};

export type DrillResults = {
  drill_id: string;
  title: string | null;
  total: number;
  answered: number;
  correct: number;
  attempts: { exercise_id: string; correct: boolean; answer_given: string | null; ms_taken: number | null }[];
};

export async function createDrill(
  userId: string,
  drill: Drill,
): Promise<{ drillId: string; exerciseCount: number }> {
  const admin = createAdminClient();

  const { data: lang } = await admin
    .from("languages").select("code").eq("code", drill.language).maybeSingle();
  if (!lang) throw new Error(`unsupported language "${drill.language}"`);

  // Tenant check: every referenced vocab item must live in one of the caller's
  // curriculums (the admin client bypasses RLS, so this is mandatory).
  const vocabIds = [...new Set(drill.exercises.flatMap((e) => (e.vocab_id ? [e.vocab_id] : [])))];
  let curriculumId: string | null = null;
  if (vocabIds.length > 0) {
    const owned = await ownedCurriculumIds(admin, userId);
    const { data: items, error } = await admin
      .from("vocab_items").select("id, curriculum_id")
      .in("id", vocabIds).in("curriculum_id", owned.length ? owned : ["00000000-0000-0000-0000-000000000000"]);
    if (error) throw new Error(error.message);
    if ((items ?? []).length !== vocabIds.length) {
      throw new Error("one or more vocab_id values were not found in your curriculums");
    }
    curriculumId = items![0].curriculum_id;
  }

  const { data, error } = await admin
    .from("drills")
    .insert({
      user_id: userId,
      curriculum_id: curriculumId,
      language_code: drill.language,
      title: drill.title ?? null,
      payload: drill,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { drillId: data.id, exerciseCount: drill.exercises.length };
}

export async function recordAttempt(
  userId: string,
  input: RecordAttemptInput,
): Promise<{ recorded: true; srs_applied: boolean }> {
  const admin = createAdminClient();

  const { data: row, error: dErr } = await admin
    .from("drills").select("id, payload")
    .eq("id", input.drill_id).eq("user_id", userId).maybeSingle();
  if (dErr) throw new Error(dErr.message);
  if (!row) throw new Error("drill not found");

  const drill = row.payload as Drill;
  const ex = drill.exercises.find((e) => e.id === input.exercise_id);
  if (!ex) throw new Error(`exercise "${input.exercise_id}" not in drill`);

  const { error: aErr } = await admin.from("drill_attempts").insert({
    drill_id: input.drill_id,
    user_id: userId,
    exercise_id: input.exercise_id,
    correct: input.correct,
    answer_given: input.answer_given ?? null,
    ms_taken: input.ms_taken ?? null,
  });
  if (aErr) throw new Error(aErr.message);

  let srsApplied = false;
  const srsEnabled = ex.srs ?? drill.srs_default;
  if (srsEnabled && ex.vocab_id) {
    const { error: gErr } = await admin.rpc("grade_card_for", {
      p_user: userId,
      p_vocab_id: ex.vocab_id,
      p_grade: drillGrade(input.correct),
      p_direction: drillDirection(ex),
      p_ms_taken: input.ms_taken ?? null,
    });
    // A grading failure (e.g. vocab deleted mid-drill) must not lose the attempt.
    srsApplied = !gErr;
  }
  return { recorded: true, srs_applied: srsApplied };
}

type DrillAttemptRow = {
  exercise_id: string;
  correct: boolean;
  answer_given: string | null;
  ms_taken: number | null;
  attempted_at: string;
};

export async function getDrillResults(userId: string, drillId: string): Promise<DrillResults> {
  const admin = createAdminClient();
  const { data: row, error: dErr } = await admin
    .from("drills").select("id, title, payload")
    .eq("id", drillId).eq("user_id", userId).maybeSingle();
  if (dErr) throw new Error(dErr.message);
  if (!row) throw new Error("drill not found");

  const { data: attempts, error: aErr } = await admin
    .from("drill_attempts")
    .select("exercise_id, correct, answer_given, ms_taken, attempted_at")
    .eq("drill_id", drillId).eq("user_id", userId)
    .order("attempted_at", { ascending: true });
  if (aErr) throw new Error(aErr.message);

  // Latest attempt per exercise wins (drill can be replayed).
  const latest = new Map<string, DrillAttemptRow>();
  for (const a of attempts ?? []) latest.set(a.exercise_id, a);
  const list = [...latest.values()].map((a) => ({
    exercise_id: a.exercise_id, correct: a.correct,
    answer_given: a.answer_given, ms_taken: a.ms_taken,
  }));
  return {
    drill_id: row.id,
    title: row.title,
    total: (row.payload as Drill).exercises.length,
    answered: list.length,
    correct: list.filter((a) => a.correct).length,
    attempts: list,
  };
}
