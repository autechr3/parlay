"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import { pickDirection, type Direction } from "@/lib/directions";
import { GradeQueue, makeIdbStore, makeGradeRpc } from "@/lib/grade-queue";
import { checkTypedAnswer, conjugatePresent, conjugatePast } from "@/lib/farsi";
import { FarsiText } from "./FarsiText";
import { FaKeyboard } from "./FaKeyboard";

export type QueueCard = {
  vocab_id: string; farsi: string; transliteration: string; english: string;
  part_of_speech: string | null; present_stem: string | null; past_stem: string | null;
  colloquial: string | null; repetitions: number; is_new: boolean;
};

const GRADES = [
  { key: "1", label: "Again", grade: 1 }, { key: "2", label: "Hard", grade: 3 },
  { key: "3", label: "Good", grade: 4 }, { key: "4", label: "Easy", grade: 5 },
] as const;

export function ReviewSession({ initialQueue }: { initialQueue: QueueCard[] }) {
  const supabase = useMemo(() => createBrowserClient(), []);
  const queue = useMemo(
    () => new GradeQueue(makeIdbStore(), makeGradeRpc(supabase)), [supabase]);
  const [i, setI] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [typed, setTyped] = useState("");
  const [verdict, setVerdict] = useState<"exact" | "close" | "wrong" | null>(null);
  const [tally, setTally] = useState<Record<number, number>>({});
  const [pending, setPending] = useState(0);
  const shownAt = useRef(Date.now());
  const inputRef = useRef<HTMLInputElement>(null);
  const grading = useRef(false);

  const card = initialQueue[i];
  const direction: Direction | null =
    card ? pickDirection(card.part_of_speech, card.repetitions, !!card.present_stem) : null;
  const typedCard = direction === "en_to_fa" || direction === "stem";
  const expected = !card ? "" : direction === "stem" ? (card.present_stem ?? "") : card.farsi;

  useEffect(() => {
    setRevealed(false); setTyped(""); setVerdict(null);
    shownAt.current = Date.now();
    grading.current = false;
    queue.pendingCount().then(setPending);
    if (typedCard) inputRef.current?.focus();
  }, [i, queue, typedCard]);

  useEffect(() => {
    const onOnline = () => queue.flush().then(() => queue.pendingCount().then(setPending));
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [queue]);

  function submitTyped() {
    if (!card) return;
    setVerdict(checkTypedAnswer(typed, expected).verdict);
    setRevealed(true);
  }

  function grade(g: number) {
    if (!card || !revealed || !direction || grading.current) return;
    grading.current = true;
    // near-miss on typed cards caps the grade at 3 (spec: SRS algorithm section)
    const finalGrade = verdict === "close" ? Math.min(g, 3) : verdict === "wrong" ? Math.min(g, 1) : g;
    queue
      .enqueue({
        vocabId: card.vocab_id, grade: finalGrade, direction,
        msTaken: Date.now() - shownAt.current, ts: Date.now(),
      })
      .then(() => queue.pendingCount().then(setPending))
      .catch(() => {});
    setTally((t) => ({ ...t, [finalGrade]: (t[finalGrade] ?? 0) + 1 }));
    setI((v) => v + 1);
  }

  // Intentionally no deps array: re-subscribes every render so the handler closes over
  // current state (card/revealed/typed/verdict/direction) rather than a stale snapshot.
  // react-hooks/exhaustive-deps does not flag effects with no deps array (that's the
  // documented "run after every render" escape hatch), so no disable comment is needed.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.repeat) return;
      if (e.target instanceof HTMLInputElement) {
        if (e.key === "Enter" && !revealed) submitTyped();
        return;
      }
      if (e.key === " " && !revealed && !typedCard) { e.preventDefault(); setRevealed(true); }
      const g = GRADES.find((x) => x.key === e.key);
      if (g && revealed) grade(g.grade);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!card) {
    const total = Object.values(tally).reduce((a, b) => a + b, 0);
    return (
      <main className="mx-auto max-w-md p-6 text-center">
        <h1 className="text-2xl font-bold">Session done</h1>
        <p className="mt-2">{total} cards reviewed.</p>
        <ul className="mt-4 text-sm text-gray-600">
          {GRADES.map((g) => <li key={g.grade}>{g.label}: {tally[g.grade] ?? 0}</li>)}
        </ul>
        {pending > 0 && <p className="mt-4 text-amber-600">{pending} grades queued offline — will sync when online.</p>}
      </main>
    );
  }

  // fixed heights prevent layout shift on reveal
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <div className="h-2 w-full rounded bg-gray-200">
        <div className="h-2 rounded bg-black" style={{ width: `${(i / initialQueue.length) * 100}%` }} />
      </div>
      <p className="text-xs text-gray-400">
        {i + 1}/{initialQueue.length}{card.is_new && " · new"}{pending > 0 && ` · ${pending} unsynced`}
      </p>

      <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded border p-6 text-3xl">
        {direction === "fa_to_en" && <FarsiText farsi={card.farsi} translit={card.transliteration} english={card.english} locked={!revealed} />}
        {direction === "en_to_fa" && <span className="text-2xl">{card.english}</span>}
        {direction === "stem" && (
          <span className="text-2xl">present stem of <FarsiText farsi={card.farsi} translit={card.transliteration} english={card.english} locked={!revealed} /></span>
        )}
      </div>

      <div className="min-h-40">
        {!revealed && typedCard && (
          <div className="flex flex-col gap-2">
            <input ref={inputRef} dir="rtl" lang="fa" value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="rounded border p-3 text-2xl font-fa" autoComplete="off" />
            <FaKeyboard onKey={(ch) => setTyped((t) => t + ch)}
              onBackspace={() => setTyped((t) => t.slice(0, -1))} />
            <button onClick={submitTyped} className="rounded bg-black p-3 text-white">Check</button>
          </div>
        )}
        {!revealed && !typedCard && (
          <button onClick={() => setRevealed(true)} className="w-full rounded border p-3">
            Reveal <span className="text-gray-400">(space)</span>
          </button>
        )}
        {revealed && (
          <div className="flex flex-col gap-3">
            <div className="text-center text-xl">
              {direction === "fa_to_en" && <p>{card.english}{card.colloquial && <> · spoken: <FarsiText farsi={card.colloquial} /></>}</p>}
              {direction === "en_to_fa" && <FarsiText farsi={card.farsi} translit={card.transliteration} />}
              {direction === "stem" && card.present_stem && (
                <div>
                  <FarsiText farsi={card.present_stem} />
                  <p dir="rtl" lang="fa" className="font-fa mt-2 text-base text-gray-600">
                    {conjugatePresent(card.present_stem).join(" · ")}
                  </p>
                  {card.past_stem && (
                    <p dir="rtl" lang="fa" className="font-fa text-base text-gray-500">
                      {conjugatePast(card.past_stem).join(" · ")}
                    </p>
                  )}
                </div>
              )}
              {verdict === "close" && <p className="mt-1 text-sm text-amber-600">close — check the spelling</p>}
              {verdict === "wrong" && <p className="mt-1 text-sm text-red-600">not quite</p>}
            </div>
            <div className="grid grid-cols-4 gap-2">
              {GRADES.map((g) => (
                <button key={g.grade} onClick={() => grade(g.grade)}
                  className="min-h-12 rounded border p-2 text-sm active:bg-gray-200">
                  {g.label}<br /><span className="text-gray-400">{g.key}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
