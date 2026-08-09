"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function completeLesson(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("not authenticated");
  const lessonId = Number(formData.get("lesson_id"));
  const conf = Number(formData.get("confidence"));
  const { error } = await supabase.from("lesson_completions").insert({
    user_id: user.id, lesson_id: lessonId,
    minutes_spent: Number(formData.get("minutes_spent")) || null,
    homework_done: formData.get("homework_done") === "on",
    negar_drill_done: formData.get("negar_drill_done") === "on",
    confidence: conf >= 1 && conf <= 5 ? conf : null,
    notes: String(formData.get("notes") || "") || null,
  });
  // Tolerate re-submits: a unique-violation on (user_id, lesson_id) means this lesson
  // was already marked complete. PostgREST surfaces that as Postgres error code 23505
  // with a "duplicate key value violates unique constraint" message — check both.
  const isDuplicate = !!error && (error.code === "23505" || error.message.includes("duplicate"));
  if (error && !isDuplicate) throw error;
  if (!isDuplicate) {
    const { error: bumpErr } = await supabase.rpc("bump_study_day");
    if (bumpErr) throw bumpErr;
  }
  for (const [k, v] of formData.entries()) {
    if (k.startsWith("skill:")) {
      const n = Number(v);
      if (Number.isInteger(n) && n >= 1 && n <= 5) {
        const { error: skillErr } = await supabase.from("skill_ratings").insert({
          user_id: user.id, lesson_id: lessonId,
          skill: k.slice(6), rating: n,
        });
        if (skillErr) throw skillErr;
      }
    }
  }
  revalidatePath("/lessons");
  redirect("/lessons");
}
