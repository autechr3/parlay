import { createClient } from "@/lib/supabase/server";
import { exportTableFilter, type ExportScope } from "@/app/curriculums/lib";

const USER_TABLES = ["profiles", "lesson_completions", "practice_sessions", "skill_ratings",
  "vocab_reviews", "review_log", "study_days", "exercise_attempts", "email_log"];
const CURRICULUM_TABLES = ["curriculums", "units", "lessons", "vocab_items", "exercises"]; // owner RLS scopes these too

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("unauthorized", { status: 401 });

  const curriculumId = new URL(request.url).searchParams.get("curriculum");
  let scope: ExportScope | null = null;
  if (curriculumId) {
    // RLS ("own curriculums": owner_id = auth.uid()) scopes this to rows the caller owns, so a
    // miss means either the id doesn't exist or belongs to someone else — either way, 404.
    const { data: curriculum } = await supabase.from("curriculums")
      .select("id").eq("id", curriculumId).maybeSingle();
    if (!curriculum) {
      return new Response(JSON.stringify({ error: "curriculum not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
    const [{ data: lessons }, { data: vocab }, { data: exercises }] = await Promise.all([
      supabase.from("lessons").select("id").eq("curriculum_id", curriculumId),
      supabase.from("vocab_items").select("id").eq("curriculum_id", curriculumId),
      supabase.from("exercises").select("id").eq("curriculum_id", curriculumId),
    ]);
    scope = {
      curriculumId,
      lessonIds: (lessons ?? []).map((l) => l.id),
      vocabIds: (vocab ?? []).map((v) => v.id),
      exerciseIds: (exercises ?? []).map((e) => e.id),
    };
  }

  const out: Record<string, unknown> = { exported_at: new Date().toISOString() };
  for (const t of [...USER_TABLES, ...CURRICULUM_TABLES]) {
    let query = supabase.from(t).select("*"); // RLS scopes user tables automatically
    const filter = exportTableFilter(t, scope);
    if (filter) query = filter.op === "eq" ? query.eq(filter.column, filter.value) : query.in(filter.column, filter.values);
    const { data, error } = await query;
    if (error) return new Response(`export failed on ${t}: ${error.message}`, { status: 500 });
    out[t] = data;
  }
  return new Response(JSON.stringify(out, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="parlay-export-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
