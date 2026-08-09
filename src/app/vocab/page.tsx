import { createClient } from "@/lib/supabase/server";
import { faNormalize } from "@/lib/farsi";
import { VocabTable } from "@/components/VocabTable";

export default async function VocabPage({ searchParams }:
  { searchParams: Promise<{ q?: string; lesson?: string; pos?: string }> }) {
  const { q, lesson, pos } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let query = supabase.from("vocab_items")
    .select("id, farsi, transliteration, english, part_of_speech, lesson_id, tags, lessons(number)")
    .order("farsi").limit(500);
  if (q) {
    const isFa = /[\u0600-\u06FF]/.test(q);
    query = isFa
      ? query.ilike("farsi_normalized", `%${faNormalize(q)}%`)
      : query.or(`english.ilike.%${q}%,transliteration.ilike.%${q}%`);
  }
  if (lesson) query = query.eq("lesson_id", Number(lesson));
  if (pos) query = query.eq("part_of_speech", pos);
  const { data: items } = await query;
  const { data: reviews } = await supabase.from("vocab_reviews")
    .select("vocab_id, due_on, ease, repetitions, suspended").eq("user_id", user!.id);
  const { data: lessons } = await supabase.from("lessons").select("id, number").order("number");

  return <VocabTable items={items ?? []} reviews={reviews ?? []} lessons={lessons ?? []}
    initialQuery={q ?? ""} />;
}
