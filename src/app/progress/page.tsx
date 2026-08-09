import { createClient } from "@/lib/supabase/server";
import { SkillChart } from "@/components/SkillChart";

export default async function ProgressPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const uid = user!.id;
  const [{ data: ratings }, { data: sessions }, { data: log }, { data: comps }] = await Promise.all([
    supabase.from("skill_ratings").select("skill, rating, rated_at").eq("user_id", uid).order("rated_at"),
    supabase.from("practice_sessions").select("errors, duration_minutes").eq("user_id", uid),
    supabase.from("review_log").select("grade").eq("user_id", uid)
      .gte("reviewed_at", new Date(Date.now() - 30 * 864e5).toISOString()),
    supabase.from("lesson_completions").select("minutes_spent").eq("user_id", uid),
  ]);

  // pivot ratings into per-date rows for recharts
  const skills = [...new Set((ratings ?? []).map((r) => r.skill))];
  const byDate = new Map<string, Record<string, string | number>>();
  for (const r of ratings ?? []) {
    const date = r.rated_at.slice(0, 10);
    const row: Record<string, string | number> = byDate.get(date) ?? { date };
    row[r.skill] = r.rating;
    byDate.set(date, row);
  }

  const errorCounts = new Map<string, number>();
  for (const s of sessions ?? [])
    for (const e of s.errors ?? []) errorCounts.set(e, (errorCounts.get(e) ?? 0) + 1);
  const rankedErrors = [...errorCounts.entries()].sort((a, b) => b[1] - a[1]);

  const total = (log ?? []).length;
  const passed = (log ?? []).filter((r) => r.grade >= 3).length;
  const minutes = (comps ?? []).reduce((a, c) => a + (c.minutes_spent ?? 0), 0)
    + (sessions ?? []).reduce((a, s) => a + (s.duration_minutes ?? 0), 0);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 p-6">
      <h1 className="text-2xl font-bold">Progress</h1>
      <section>
        <h2 className="mb-2 font-semibold">Most frequent errors</h2>
        {rankedErrors.length === 0 ? <p className="text-sm text-gray-500">No tutor session logs yet.</p> : (
          <ol className="list-decimal pl-6">
            {rankedErrors.map(([e, n]) => <li key={e}>{e} <span className="text-gray-400">×{n}</span></li>)}
          </ol>)}
      </section>
      <section>
        <h2 className="mb-2 font-semibold">Skill ratings over time</h2>
        {skills.length === 0 ? <p className="text-sm text-gray-500">Rate skills at your next assessment lesson.</p>
          : <SkillChart data={[...byDate.values()]} skills={skills} />}
      </section>
      <section className="grid grid-cols-2 gap-3 text-center">
        <div className="rounded border p-4">
          <p className="text-3xl font-bold">{total ? Math.round((passed / total) * 100) : 0}%</p>
          <p className="text-xs text-gray-500">retention (30 days, {total} reviews)</p></div>
        <div className="rounded border p-4">
          <p className="text-3xl font-bold">{Math.round(minutes / 60 * 10) / 10}h</p>
          <p className="text-xs text-gray-500">total study time</p></div>
      </section>
    </main>
  );
}
