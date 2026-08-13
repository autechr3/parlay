import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getLanguage } from "@/lib/languages";
import { VocabTable } from "@/components/VocabTable";

export default async function VocabPage({ searchParams }:
  { searchParams: Promise<{ q?: string; lesson?: string; pos?: string }> }) {
  const { q, lesson, pos } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase.from("profiles")
    .select("active_curriculum_id, show_diacritics").eq("id", user!.id).single();

  if (!profile?.active_curriculum_id) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <h1 className="mb-4 text-2xl font-bold">Vocabulary</h1>
        <p className="text-gray-500">
          <Link className="underline" href="/import">Import a curriculum to get started</Link>.
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

  let query = supabase.from("vocab_items")
    .select("id, term, term_vocalized, transliteration, translation, part_of_speech, lesson_id, tags, lessons(number)")
    .eq("curriculum_id", profile.active_curriculum_id)
    .order("term").limit(500);
  if (q) {
    const isTargetScript = /[؀-ۿ]/.test(q);
    if (isTargetScript) {
      query = query.ilike("term_normalized", `%${language.normalize(q)}%`);
    } else {
      const safe = q.replace(/[,()"]/g, " ");
      query = query.or(`translation.ilike.%${safe}%,transliteration.ilike.%${safe}%`);
    }
  }
  if (lesson) query = query.eq("lesson_id", Number(lesson));
  if (pos) query = query.eq("part_of_speech", pos);
  const { data: items } = await query;
  const resolved = (items ?? []).map((v) => ({
    ...v, term: hasDiacritics && profile.show_diacritics && v.term_vocalized ? v.term_vocalized : v.term,
  }));
  const { data: reviews } = await supabase.from("vocab_reviews")
    .select("vocab_id, due_on, ease, repetitions, suspended").eq("user_id", user!.id);
  const { data: lessons } = await supabase.from("lessons")
    .select("id, number").eq("curriculum_id", profile.active_curriculum_id).order("number");

  return <VocabTable items={resolved} reviews={reviews ?? []} lessons={lessons ?? []}
    initialQuery={q ?? ""} initialLesson={lesson ?? ""} initialPos={pos ?? ""}
    langCode={langCode} rtl={rtl} />;
}
