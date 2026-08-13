import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Heatmap } from "@/components/Heatmap";
import { CopyPromptButton } from "@/components/CopyPromptButton";

export default async function Dashboard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const uid = user!.id;

  // Both cheap — run before the heavier per-curriculum Promise.all below so an unonboarded
  // learner with nothing imported yet gets sent to /welcome without paying for streak/due/heatmap
  // queries first.
  const [{ data: profile }, { count: curriculumCount }] = await Promise.all([
    supabase.from("profiles")
      .select("active_curriculum_id, target_lessons_per_week, timezone, onboarded_at").eq("id", uid).single(),
    supabase.from("curriculums").select("id", { count: "exact", head: true }).eq("owner_id", uid),
  ]);

  // Only unonboarded AND empty — an onboarded learner who deleted every curriculum stays on the
  // dashboard rather than being bounced back into the wizard.
  if (!profile?.onboarded_at && (curriculumCount ?? 0) === 0) {
    redirect("/welcome");
  }

  if (!profile?.active_curriculum_id) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <h1 className="mb-4 text-2xl font-bold">Dashboard</h1>
        <p className="text-gray-500">
          <Link className="underline" href="/welcome">Set up your AI tutor to generate your first curriculum</Link>.
        </p>
      </main>
    );
  }

  const [{ data: streak }, { count: dueCount }, { data: days },
         { data: lessons }, { data: comps }] = await Promise.all([
    supabase.rpc("current_streak"),
    supabase.from("vocab_reviews").select("id", { count: "exact", head: true })
      .eq("user_id", uid).eq("suspended", false).lte("due_on", new Date().toISOString().slice(0, 10)),
    supabase.from("study_days").select("day, cards_reviewed, lessons_completed")
      .eq("user_id", uid).gte("day", new Date(Date.now() - 91 * 864e5).toISOString().slice(0, 10)),
    supabase.from("lessons").select("id, number, title, slug")
      .eq("curriculum_id", profile.active_curriculum_id).order("number"),
    supabase.from("lesson_completions").select("lesson_id, completed_at").eq("user_id", uid),
  ]);

  const doneIds = new Set((comps ?? []).map((c) => c.lesson_id));
  const next = (lessons ?? []).find((l) => !doneIds.has(l.id));
  const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7)); // Monday
  weekStart.setHours(0, 0, 0, 0);
  const thisWeek = (comps ?? []).filter((c) => new Date(c.completed_at) >= weekStart).length;
  const tutorPrompt = next
    ? `We're doing Lesson ${next.number} of my Farsi curriculum: "${next.title}". Teach it interactively per the lesson plan, correct my Persian ruthlessly, and end with a session log of my errors and strengths.`
    : "All lessons complete — run a free conversation session and log my errors.";

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="rounded border p-4"><p className="text-3xl font-bold">{Number(streak ?? 0)}</p><p className="text-xs text-gray-500">day streak</p></div>
        <Link href="/review" className="rounded border p-4 hover:bg-gray-50"><p className="text-3xl font-bold">{dueCount ?? 0}</p><p className="text-xs text-gray-500">cards due — review →</p></Link>
        <div className="rounded border p-4"><p className="text-3xl font-bold">{thisWeek}/{profile?.target_lessons_per_week ?? 5}</p><p className="text-xs text-gray-500">lessons this week</p></div>
      </div>
      {next && (
        <div className="rounded border p-4">
          <p className="text-xs text-gray-500">next lesson</p>
          <p className="mb-2 text-lg">L{String(next.number).padStart(2, "0")}: <Link className="underline" href={`/lessons/${next.slug}`}>{next.title}</Link></p>
          <CopyPromptButton prompt={tutorPrompt} />
        </div>
      )}
      <div className="rounded border p-4">
        <p className="mb-2 text-xs text-gray-500">last 90 days</p>
        <Heatmap days={(days ?? []).map((d) => ({ day: d.day, count: d.cards_reviewed + d.lessons_completed * 10 }))} timeZone={profile?.timezone ?? "UTC"} />
      </div>
      <a href="/api/export" className="text-sm text-gray-500 underline">Export all my data (JSON)</a>
    </main>
  );
}
