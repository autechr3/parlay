// Pure(ish) core of the curriculum actions, decoupled from `createClient()` so it can be unit
// tested with a hand-built mock SupabaseClient (vitest cannot resolve the "@/" alias used by
// @/lib/supabase/server, so anything importable from a test must stay free of that import).
import type { SupabaseClient } from "@supabase/supabase-js";

// RLS ("own curriculums": owner_id = auth.uid()) already scopes this select to rows the caller
// owns, so a missing row means either the id doesn't exist or it belongs to someone else — both
// surface identically as "not found" rather than leaking which case it was.
async function assertOwnedCurriculum(supabase: SupabaseClient, id: string): Promise<void> {
  const { data: curriculum } = await supabase.from("curriculums").select("id").eq("id", id).maybeSingle();
  if (!curriculum) throw new Error("curriculum not found");
}

export async function setActiveCurriculumFor(
  supabase: SupabaseClient, userId: string, id: string,
): Promise<void> {
  await assertOwnedCurriculum(supabase, id);
  const { error } = await supabase.from("profiles")
    .update({ active_curriculum_id: id }).eq("id", userId);
  if (error) throw error;
}

export async function deleteCurriculumFor(
  supabase: SupabaseClient, userId: string, id: string,
): Promise<void> {
  await assertOwnedCurriculum(supabase, id);

  const { data: profile } = await supabase.from("profiles")
    .select("active_curriculum_id").eq("id", userId).maybeSingle();
  const wasActive = profile?.active_curriculum_id === id;

  // FK cascades (owner_id/curriculum_id ... on delete cascade) take care of units, lessons,
  // vocab_items, exercises, and this user's lesson_completions/exercise_attempts for the rows.
  const { error: delErr } = await supabase.from("curriculums").delete().eq("id", id);
  if (delErr) throw delErr;

  if (wasActive) {
    // Reassign to the most recently created remaining owned curriculum, else clear it — never
    // leave active_curriculum_id pointing at the row we just deleted.
    const { data: remaining } = await supabase.from("curriculums")
      .select("id").eq("owner_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    const { error: updErr } = await supabase.from("profiles")
      .update({ active_curriculum_id: remaining?.id ?? null }).eq("id", userId);
    if (updErr) throw updErr;
  }
}

// ===== /api/export curriculum-scoping =====
//
// Which extra filter (if any) each exported table needs when the request is scoped to a single
// curriculum via ?curriculum=<id>. Pulled out as a pure, table-name -> filter mapping so the
// decision is unit-testable without a real (or mocked-chain) SupabaseClient — the route handler
// just applies whatever this returns.
export type ExportScope = {
  curriculumId: string;
  lessonIds: number[];
  vocabIds: string[];
  exerciseIds: string[];
};

export type ExportFilter =
  | { op: "eq"; column: string; value: string }
  | { op: "in"; column: string; values: (number | string)[] };

// A curriculum with zero exercises (or zero vocab — both are optional at import) yields an empty
// id list. supabase-js happily builds `.in(col, [])` into `col=in.()`, which is not guaranteed to
// behave like "match nothing" across PostgREST versions/columns — the rest of the app never
// relies on that and always guards with a sentinel that provably matches no real row instead (see
// src/app/curriculums/page.tsx and src/app/flashcards/page.tsx, both `values.length ? values :
// [-1]` for int id columns). lesson_id is an int (serial) column, so -1 works there; exercise_id
// and vocab_id are uuid columns, where -1 would fail to even parse as a uuid, so those get the nil
// uuid instead — still a value guaranteed never to be assigned by gen_random_uuid().
const NO_MATCH_INT = -1;
const NO_MATCH_UUID = "00000000-0000-0000-0000-000000000000";
const intOrSentinel = (values: number[]): number[] => (values.length ? values : [NO_MATCH_INT]);
const uuidOrSentinel = (values: string[]): string[] => (values.length ? values : [NO_MATCH_UUID]);

// Returns null when a table has no curriculum-scoped column at all (profiles, practice_sessions,
// skill_ratings, study_days, email_log) — those stay user-scoped exactly as the unscoped export
// already behaves, since day-aggregates and free-form logs aren't reliably per-curriculum.
export function exportTableFilter(table: string, scope: ExportScope | null): ExportFilter | null {
  if (!scope) return null;
  switch (table) {
    case "curriculums":
      return { op: "eq", column: "id", value: scope.curriculumId };
    case "units":
    case "lessons":
    case "vocab_items":
    case "exercises":
      return { op: "eq", column: "curriculum_id", value: scope.curriculumId };
    case "lesson_completions":
      return { op: "in", column: "lesson_id", values: intOrSentinel(scope.lessonIds) };
    // exercise_attempts has no lesson_id column (only exercise_id) — exercises already carry
    // curriculum_id directly, so scope through the curriculum's exercise ids instead.
    case "exercise_attempts":
      return { op: "in", column: "exercise_id", values: uuidOrSentinel(scope.exerciseIds) };
    case "vocab_reviews":
    case "review_log":
      return { op: "in", column: "vocab_id", values: uuidOrSentinel(scope.vocabIds) };
    default:
      return null;
  }
}
