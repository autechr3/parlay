import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CompletionForm } from "@/components/CompletionForm";

export default async function LessonPage({ params, searchParams }:
  { params: Promise<{ slug: string }>; searchParams: Promise<{ override?: string }> }) {
  const { slug } = await params;
  const { override } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase.from("profiles")
    .select("active_curriculum_id").eq("id", user!.id).single();
  if (!profile?.active_curriculum_id) {
    return (
      <main className="mx-auto max-w-xl p-6">
        <h1 className="text-xl font-bold">No active curriculum</h1>
        <p className="mt-4 text-gray-600">
          <Link className="underline" href="/import">Import a curriculum to get started</Link>.
        </p>
      </main>
    );
  }

  const { data: lesson } = await supabase.from("lessons").select("*")
    .eq("curriculum_id", profile.active_curriculum_id).eq("slug", slug).single();
  if (!lesson) notFound();

  const { data: prev } = lesson.number > 1
    ? await supabase.from("lessons").select("id")
        .eq("curriculum_id", profile.active_curriculum_id).eq("number", lesson.number - 1).single()
    : { data: null };
  const { data: comps } = await supabase.from("lesson_completions")
    .select("lesson_id").eq("user_id", user!.id).in("lesson_id", [lesson.id, prev?.id ?? -1]);
  const done = (comps ?? []).some((c) => c.lesson_id === lesson.id);
  const prevDone = !prev || (comps ?? []).some((c) => c.lesson_id === prev.id);

  if (!prevDone && !done && override !== "1") {
    return (
      <main className="mx-auto max-w-xl p-6">
        <h1 className="text-xl font-bold">L{lesson.number}: {lesson.title}</h1>
        <p className="mt-4 text-gray-600">The previous lesson isn&apos;t complete yet — finish it first for the curriculum to build properly.</p>
        <Link href={`/lessons/${slug}?override=1`} className="mt-4 inline-block underline">Open anyway →</Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">L{String(lesson.number).padStart(2, "0")}: {lesson.title}</h1>
        <Link href={`/lessons/${slug}/practice`} className="rounded border px-3 py-1 text-sm">Practice →</Link>
      </div>
      {/* prose styling; the target language inside the markdown is handled by the script-aware prose css below */}
      <article className="prose max-w-none [&_table]:block [&_table]:overflow-x-auto">
        <Markdown remarkPlugins={[remarkGfm]}>{lesson.body_md ?? "_No lesson body imported._"}</Markdown>
      </article>
      {!done && <CompletionForm lessonId={lesson.id} isAssessment={lesson.is_assessment} />}
      {done && <p className="mt-6 rounded bg-green-50 p-3 text-green-800">Completed ✓</p>}
    </main>
  );
}
