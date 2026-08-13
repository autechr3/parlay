import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CurriculumCard, type CurriculumCardData } from "@/components/CurriculumCard";

export default async function CurriculumsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const uid = user!.id;

  const [{ data: profile }, { data: curriculums }] = await Promise.all([
    supabase.from("profiles").select("active_curriculum_id").eq("id", uid).single(),
    supabase.from("curriculums")
      .select("id, name, language_code, languages(native_name, rtl)")
      .order("created_at", { ascending: false }),
  ]);

  if (!curriculums || curriculums.length === 0) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <h1 className="mb-4 text-2xl font-bold">Set up your AI tutor</h1>
        <p className="mb-4 text-gray-500">
          Connect an AI tool and it builds your first curriculum for you — or grab a generator
          prompt from <Link className="underline" href="/prompts">Prompts</Link> to paste in yourself.
        </p>
        <Link href="/welcome" className="inline-block rounded bg-black px-4 py-2 text-sm text-white">
          Set up your AI tutor
        </Link>
        <details className="mt-6 text-sm text-gray-500">
          <summary className="cursor-pointer font-semibold">Advanced</summary>
          <p className="mt-2">
            Already have a content package?{" "}
            <Link href="/curriculums/import" className="underline">Manual import</Link>.
          </p>
        </details>
      </main>
    );
  }

  const ids = curriculums.map((c) => c.id);
  const [{ data: lessons }, { data: vocab }] = await Promise.all([
    supabase.from("lessons").select("id, curriculum_id").in("curriculum_id", ids),
    supabase.from("vocab_items").select("id, curriculum_id").in("curriculum_id", ids),
  ]);
  const lessonIds = (lessons ?? []).map((l) => l.id);
  const { data: comps } = await supabase.from("lesson_completions")
    .select("lesson_id").eq("user_id", uid).in("lesson_id", lessonIds.length ? lessonIds : [-1]);

  const lessonIdsByCurriculum = new Map<string, number[]>();
  for (const l of lessons ?? []) {
    const arr = lessonIdsByCurriculum.get(l.curriculum_id) ?? [];
    arr.push(l.id);
    lessonIdsByCurriculum.set(l.curriculum_id, arr);
  }
  const completedLessonIds = new Set((comps ?? []).map((c) => c.lesson_id));
  const vocabCountByCurriculum = new Map<string, number>();
  for (const v of vocab ?? []) {
    vocabCountByCurriculum.set(v.curriculum_id, (vocabCountByCurriculum.get(v.curriculum_id) ?? 0) + 1);
  }

  const cards: CurriculumCardData[] = curriculums.map((c) => {
    const ownLessonIds = lessonIdsByCurriculum.get(c.id) ?? [];
    const languageRow = c.languages as unknown as { native_name: string; rtl: boolean } | null;
    return {
      id: c.id,
      name: c.name,
      nativeName: languageRow?.native_name ?? c.language_code,
      langCode: c.language_code,
      rtl: languageRow?.rtl ?? true,
      lessonCount: ownLessonIds.length,
      completedCount: ownLessonIds.filter((id) => completedLessonIds.has(id)).length,
      vocabCount: vocabCountByCurriculum.get(c.id) ?? 0,
      isActive: c.id === profile?.active_curriculum_id,
    };
  });

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="mb-6 text-2xl font-bold">Library</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {cards.map((c) => <CurriculumCard key={c.id} curriculum={c} />)}
      </div>
      <details className="mt-6 text-sm text-gray-500">
        <summary className="cursor-pointer font-semibold">Advanced</summary>
        <Link href="/curriculums/import"
          className="mt-2 inline-block rounded border px-3 py-1 text-sm text-black">
          Manual import
        </Link>
      </details>
    </main>
  );
}
