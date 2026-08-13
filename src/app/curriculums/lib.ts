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
