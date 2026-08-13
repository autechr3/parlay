import { createClient } from "@/lib/supabase/server";
import { getLanguage } from "@/lib/languages";
import { FlashcardDeck, type DeckCard } from "@/components/FlashcardDeck";
import Link from "next/link";

export default async function FlashcardsPage({ searchParams }:
  { searchParams: Promise<{ lessons?: string; l?: string | string[]; deck?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase.from("profiles")
    .select("active_curriculum_id, show_diacritics").eq("id", user!.id).single();

  if (!profile?.active_curriculum_id) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <h1 className="mb-4 text-2xl font-bold">Flashcards</h1>
        <p className="text-gray-500">
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

  // Conjugation deck only makes sense for languages with a drill provider.
  const deck = sp.deck === "conjugations" && language.drills ? "conjugations" : "vocabulary";

  const { data: allLessons } = await supabase.from("lessons")
    .select("id, number, title").eq("curriculum_id", profile.active_curriculum_id).order("number");
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
    .select("id, term, term_vocalized, transliteration, translation, part_of_speech, morphology")
    .in("lesson_id", selectedIds.length ? selectedIds : [-1]);
  if (deck === "conjugations") query = query.eq("part_of_speech", "verb").not("morphology->>present_stem", "is", null);
  const { data: vocab } = await query;
  const term = (v: { term: string; term_vocalized: string | null }) =>
    hasDiacritics && profile.show_diacritics && v.term_vocalized ? v.term_vocalized : v.term;

  const cards: DeckCard[] = (vocab ?? []).map((v) =>
    deck === "conjugations"
      ? { id: v.id, term: term(v), translit: v.transliteration, translation: v.translation,
          kind: "verb" as const, morphology: v.morphology as Record<string, string> | null }
      : { id: v.id, term: term(v), translit: v.transliteration, translation: v.translation, kind: "vocab" as const });

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
          {language.drills && (
            <label><input type="radio" name="deck" value="conjugations" defaultChecked={deck === "conjugations"} /> Verb conjugations</label>
          )}
        </div>
        <button className="self-start rounded bg-black px-4 py-2 text-white" type="submit">Build deck</button>
      </form>
      {learned.length === 0
        ? <p className="text-gray-500">Complete your first lesson to unlock flashcards — or open <Link className="underline" href="/lessons">Lessons</Link>.</p>
        : <FlashcardDeck cards={cards} langCode={langCode} rtl={rtl} />}
    </main>
  );
}
