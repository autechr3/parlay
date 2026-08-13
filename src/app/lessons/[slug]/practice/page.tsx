import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLanguage } from "@/lib/languages";
import { ExercisePlayer, type Ex, type Verb } from "@/components/ExercisePlayer";

export default async function PracticePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase.from("profiles")
    .select("active_curriculum_id, show_diacritics").eq("id", user!.id).single();
  if (!profile?.active_curriculum_id) {
    return (
      <main className="mx-auto max-w-xl p-6">
        <h1 className="text-xl font-bold">No active curriculum</h1>
        <p className="mt-4 text-gray-600">
          <Link className="underline" href="/welcome">Set up your AI tutor to generate your first curriculum</Link>.
        </p>
      </main>
    );
  }

  const { data: curriculum } = await supabase.from("curriculums")
    .select("id, name, language_code, languages(rtl, has_diacritics, native_name)")
    .eq("id", profile.active_curriculum_id).single();
  const langCode = curriculum?.language_code ?? "fa";
  const language = getLanguage(langCode);
  const languageRow = curriculum?.languages as unknown as { rtl: boolean; has_diacritics: boolean } | null;
  const rtl = languageRow?.rtl ?? true;
  const hasDiacritics = languageRow?.has_diacritics ?? false;

  const { data: lesson } = await supabase.from("lessons").select("id, number, title")
    .eq("curriculum_id", profile.active_curriculum_id).eq("slug", slug).single();
  if (!lesson) notFound();
  const { data: exercises } = await supabase.from("exercises")
    .select("id, type, prompt, answer, accept, hint").eq("lesson_id", lesson.id).order("position");
  // Conjugation drills only exist for languages with a drill provider — skip the query otherwise.
  const { data: verbRows } = language.drills
    ? await supabase.from("vocab_items")
        .select("term, term_vocalized, transliteration, translation, morphology")
        .eq("lesson_id", lesson.id).eq("part_of_speech", "verb").not("morphology->>present_stem", "is", null)
    : { data: [] };
  const verbs = (verbRows ?? []).map((v) => ({
    ...v, term: hasDiacritics && profile.show_diacritics && v.term_vocalized ? v.term_vocalized : v.term,
  }));

  return (
    <main className="mx-auto max-w-xl p-6">
      <h1 className="mb-4 text-xl font-bold">Practice — L{String(lesson.number).padStart(2, "0")} {lesson.title}</h1>
      {(exercises ?? []).length === 0 && verbs.length === 0
        ? <p className="text-gray-500">No exercises for this lesson yet. Regenerate the lesson with the exercises block, re-run the importer — or pick a lesson with verbs for auto conjugation drills.</p>
        : <ExercisePlayer exercises={(exercises ?? []) as Ex[]} verbs={verbs as Verb[]} userId={user!.id}
            langCode={langCode} rtl={rtl} />}
    </main>
  );
}
