import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ExercisePlayer, type Ex, type Verb } from "@/components/ExercisePlayer";

export default async function PracticePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: lesson } = await supabase.from("lessons").select("id, number, title").eq("slug", slug).single();
  if (!lesson) notFound();
  const { data: exercises } = await supabase.from("exercises")
    .select("id, type, prompt, answer, accept, hint").eq("lesson_id", lesson.id).order("position");
  const { data: verbs } = await supabase.from("vocab_items")
    .select("farsi, transliteration, present_stem, past_stem")
    .eq("lesson_id", lesson.id).eq("part_of_speech", "verb").not("present_stem", "is", null);
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <main className="mx-auto max-w-xl p-6">
      <h1 className="mb-4 text-xl font-bold">Practice — L{String(lesson.number).padStart(2, "0")} {lesson.title}</h1>
      {(exercises ?? []).length === 0 && (verbs ?? []).length === 0
        ? <p className="text-gray-500">No exercises for this lesson yet. Regenerate the lesson with the exercises block, re-run the importer — or pick a lesson with verbs for auto conjugation drills.</p>
        : <ExercisePlayer exercises={(exercises ?? []) as Ex[]} verbs={(verbs ?? []) as Verb[]} userId={user!.id} />}
    </main>
  );
}
