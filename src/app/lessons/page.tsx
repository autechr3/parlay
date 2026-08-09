import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function LessonsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: units } = await supabase.from("units").select("*").order("number");
  const { data: lessons } = await supabase.from("lessons")
    .select("id, number, title, slug, unit_id, is_review, is_assessment, estimated_minutes").order("number");
  const { data: comps } = await supabase.from("lesson_completions")
    .select("lesson_id, confidence, completed_at").eq("user_id", user!.id);
  const byLesson = new Map((comps ?? []).map((c) => [c.lesson_id, c]));
  const doneNumbers = new Set((lessons ?? []).filter((l) => byLesson.has(l.id)).map((l) => l.number));

  type Lesson = NonNullable<typeof lessons>[number];
  const renderCard = (l: Lesson) => {
    const done = byLesson.get(l.id);
    const locked = l.number !== 1 && !doneNumbers.has(l.number - 1) && !done;
    return (
      <Link key={l.id} href={`/lessons/${l.slug}`}
        className={`rounded border p-3 ${locked ? "opacity-50" : ""} ${done ? "border-green-600" : ""}`}>
        <span className="text-xs text-gray-400">L{String(l.number).padStart(2, "0")}
          {l.is_review && " · review"}{l.is_assessment && " · assessment"}{locked && " · locked"}</span>
        <p>{l.title}</p>
        {done && <p className="text-xs text-green-700">
          done {new Date(done.completed_at).toLocaleDateString()}
          {done.confidence && ` · confidence ${done.confidence}/5`}</p>}
      </Link>
    );
  };
  const otherLessons = (lessons ?? []).filter((l) => !(units ?? []).some((u) => u.id === l.unit_id));

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="mb-6 text-2xl font-bold">Lessons</h1>
      {(units ?? []).map((u) => (
        <section key={u.id} className="mb-8">
          <h2 className="mb-3 font-semibold">Unit {u.number}: {u.title}</h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {(lessons ?? []).filter((l) => l.unit_id === u.id).map(renderCard)}
          </div>
        </section>
      ))}
      {otherLessons.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 font-semibold">Other lessons</h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {otherLessons.map(renderCard)}
          </div>
        </section>
      )}
    </main>
  );
}
