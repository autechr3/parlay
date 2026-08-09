import { createClient } from "@/lib/supabase/server";

const USER_TABLES = ["profiles", "lesson_completions", "practice_sessions", "skill_ratings",
  "vocab_reviews", "review_log", "study_days", "exercise_attempts"];
const COURSE_TABLES = ["courses", "units", "lessons", "vocab_items", "exercises"]; // owner RLS scopes these too

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("unauthorized", { status: 401 });
  const out: Record<string, unknown> = { exported_at: new Date().toISOString() };
  for (const t of [...USER_TABLES, ...COURSE_TABLES]) {
    const { data, error } = await supabase.from(t).select("*"); // RLS scopes user tables automatically
    if (error) return new Response(`export failed on ${t}: ${error.message}`, { status: 500 });
    out[t] = data;
  }
  return new Response(JSON.stringify(out, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="farsi-tracker-export-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
