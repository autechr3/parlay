import { createClient } from "@/lib/supabase/server";
import { FlashcardDeck, type DeckCard } from "@/components/FlashcardDeck";
import Link from "next/link";

export default async function FlashcardsPage({ searchParams }:
  { searchParams: Promise<{ lessons?: string; l?: string | string[]; deck?: string }> }) {
  const sp = await searchParams;
  const deck = sp.deck === "conjugations" ? "conjugations" : "vocabulary";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: allLessons } = await supabase.from("lessons")
    .select("id, number, title").order("number");
  const { data: completions } = await supabase.from("lesson_completions")
    .select("lesson_id").eq("user_id", user!.id);
  const completed = new Set((completions ?? []).map((c) => c.lesson_id));
  const firstUncompleted = (allLessons ?? []).find((l) => !completed.has(l.id));
  // learned = completed + the lesson currently in progress
  const learned = (allLessons ?? []).filter(
    (l) => completed.has(l.id) || l.id === firstUncompleted?.id);

  // Checkboxes named "l" submit as repeated ?l=1&l=2 (string | string[] from Next);
  // a "lessons" csv key is also accepted for programmatic/bookmarked links.
  const raw = sp.lessons ?? sp.l;
  const rawList = Array.isArray(raw) ? raw : raw?.split(",");
  const selected = rawList
    ? rawList.map(Number).filter((n) => learned.some((l) => l.number === n))
    : learned.map((l) => l.number);
  const selectedIds = learned.filter((l) => selected.includes(l.number)).map((l) => l.id);

  let query = supabase.from("vocab_items")
    .select("id, farsi, farsi_vocalized, transliteration, english, part_of_speech, present_stem, past_stem")
    .in("lesson_id", selectedIds.length ? selectedIds : [-1]);
  if (deck === "conjugations") query = query.eq("part_of_speech", "verb").not("present_stem", "is", null);
  const { data: vocab } = await query;
  const { data: prof } = await supabase.from("profiles")
    .select("show_diacritics").eq("id", user!.id).single();
  const fa = (v: { farsi: string; farsi_vocalized: string | null }) =>
    prof?.show_diacritics && v.farsi_vocalized ? v.farsi_vocalized : v.farsi;

  const cards: DeckCard[] = (vocab ?? []).map((v) =>
    deck === "conjugations"
      ? { id: v.id, farsi: fa(v), translit: v.transliteration, english: v.english,
          kind: "verb" as const, presentStem: v.present_stem!, pastStem: v.past_stem }
      : { id: v.id, farsi: fa(v), translit: v.transliteration, english: v.english, kind: "vocab" as const });

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="mb-4 text-2xl font-bold">Flashcards</h1>
      <form method="get" action="/flashcards" className="mb-6 flex flex-col gap-3 rounded border p-4 text-sm">
        <div className="flex flex-wrap gap-3">
          {learned.map((l) => (
            <label key={l.id} className="flex items-center gap-1">
              <input type="checkbox" name="l" value={l.number}
                defaultChecked={selected.includes(l.number)} />
              L{String(l.number).padStart(2, "0")}
            </label>
          ))}
        </div>
        <div className="flex gap-4">
          <label><input type="radio" name="deck" value="vocabulary" defaultChecked={deck === "vocabulary"} /> Vocabulary</label>
          <label><input type="radio" name="deck" value="conjugations" defaultChecked={deck === "conjugations"} /> Verb conjugations</label>
        </div>
        <button className="self-start rounded bg-black px-4 py-2 text-white" type="submit">Build deck</button>
      </form>
      {learned.length === 0
        ? <p className="text-gray-500">Complete your first lesson to unlock flashcards — or open <Link className="underline" href="/lessons">Lessons</Link>.</p>
        : <FlashcardDeck cards={cards} />}
    </main>
  );
}
