"use client";
import { useMemo, useState } from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import { checkTypedAnswer, conjugatePresent, conjugatePast, PRONOUNS } from "@/lib/farsi";
import { checkEnglishAnswer } from "@/lib/english-check";
import { FaKeyboard } from "./FaKeyboard";
import { FarsiText } from "./FarsiText";
import { shuffle } from "./FlashcardDeck";

export type Ex = { id: string; type: "en_to_fa" | "fa_to_en" | "cloze" | "scramble";
  prompt: string; answer: string; accept: string[]; hint: string | null };
export type Verb = { farsi: string; transliteration: string;
  present_stem: string; past_stem: string | null };

type Item =
  | { kind: "stored"; ex: Ex }
  | { kind: "conj"; verb: Verb; pronounIdx: number; tense: "present" | "past"; expected: string };

function buildItems(exercises: Ex[], verbs: Verb[]): Item[] {
  const conj: Item[] = verbs.map((v, i) => {
    const tense = v.past_stem && i % 2 === 1 ? "past" as const : "present" as const;
    const pronounIdx = (i * 7 + 3) % 6; // deterministic spread, no Math.random in render
    const expected = tense === "past"
      ? conjugatePast(v.past_stem!)[pronounIdx]
      : conjugatePresent(v.present_stem)[pronounIdx];
    return { kind: "conj", verb: v, pronounIdx, tense, expected };
  });
  return [...exercises.map((ex) => ({ kind: "stored" as const, ex })), ...conj];
}

export function ExercisePlayer({ exercises, verbs, userId }:
  { exercises: Ex[]; verbs: Verb[]; userId: string }) {
  const supabase = useMemo(() => createBrowserClient(), []);
  const [items] = useState(() => buildItems(exercises, verbs));
  const [i, setI] = useState(0);
  const [typed, setTyped] = useState("");
  const [tiles, setTiles] = useState<string[]>(() => {
    const first = items[0];
    return first?.kind === "stored" && first.ex.type === "scramble"
      ? shuffle(first.ex.answer.split(/\s+/), 13) : [];
  });
  const [picked, setPicked] = useState<string[]>([]);
  const [result, setResult] = useState<"correct" | "close" | "wrong" | null>(null);
  const [score, setScore] = useState({ right: 0, total: 0 });
  const item = items[i];

  function next() {
    setI((v) => v + 1); setTyped(""); setResult(null); setPicked([]);
    const nxt = items[i + 1];
    if (nxt?.kind === "stored" && nxt.ex.type === "scramble")
      setTiles(shuffle(nxt.ex.answer.split(/\s+/), (i + 1) * 97 + 13));
    else
      setTiles([]);
  }

  function record(ok: boolean, given: string) {
    setScore((s) => ({ right: s.right + (ok ? 1 : 0), total: s.total + 1 }));
    if (item.kind === "stored")
      supabase.from("exercise_attempts")
        .insert({ exercise_id: item.ex.id, correct: ok, answer_given: given, user_id: userId })
        .then(() => {});
  }

  function check() {
    if (result) return next();
    let ok = false, close = false;
    const given = item.kind === "stored" && item.ex.type === "scramble" ? picked.join(" ") : typed;
    if (item.kind === "conj") {
      const v = checkTypedAnswer(typed, item.expected).verdict;
      ok = v === "exact"; close = v === "close";
    } else if (item.ex.type === "fa_to_en") {
      ok = checkEnglishAnswer(typed, item.ex.answer, item.ex.accept);
    } else if (item.ex.type === "scramble") {
      ok = picked.join(" ") === item.ex.answer.split(/\s+/).join(" ");
    } else {
      const verdicts = [item.ex.answer, ...item.ex.accept]
        .map((a) => checkTypedAnswer(typed, a).verdict);
      ok = verdicts.includes("exact"); close = !ok && verdicts.includes("close");
    }
    setResult(ok ? "correct" : close ? "close" : "wrong");
    record(ok || close, given);
  }

  if (!item) return (
    <p className="rounded border p-6 text-center text-xl">
      Done — {score.right}/{score.total} correct.
    </p>
  );

  const needsFaInput = item.kind === "conj" ||
    (item.kind === "stored" && (item.ex.type === "en_to_fa" || item.ex.type === "cloze"));

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-gray-400">{i + 1} / {items.length} · {score.right} correct</p>

      <div className="rounded border p-5 text-xl">
        {item.kind === "conj" && (
          <p><FarsiText farsi={item.verb.farsi} translit={item.verb.transliteration} locked={!result} />
            {" + "}<span dir="rtl" lang="fa" className="font-fa">{PRONOUNS[item.pronounIdx]}</span>
            {" → "}{item.tense} tense?</p>
        )}
        {item.kind === "stored" && item.ex.type === "en_to_fa" && <p>Write in Farsi: <b>{item.ex.prompt}</b></p>}
        {item.kind === "stored" && item.ex.type === "fa_to_en" && (
          <p>Write in English: <FarsiText farsi={item.ex.prompt} locked /></p>)}
        {item.kind === "stored" && item.ex.type === "cloze" && (
          <p>Fill the blank: <span dir="rtl" lang="fa" className="font-fa">{item.ex.prompt}</span></p>)}
        {item.kind === "stored" && item.ex.type === "scramble" && (
          <div>
            <p className="mb-2 text-sm text-gray-500">Arrange: &ldquo;{item.ex.prompt}&rdquo;</p>
            <div dir="rtl" className="mb-2 min-h-10 rounded bg-gray-50 p-2 font-fa">
              {picked.map((w, wi) => (
                <button key={wi} className="m-1 rounded border bg-white px-2 py-1"
                  onClick={() => { setPicked(picked.filter((_, x) => x !== wi)); setTiles([...tiles, w]); }}>
                  {w}</button>))}
            </div>
            <div dir="rtl">
              {tiles.map((w, wi) => (
                <button key={wi} className="m-1 rounded border px-2 py-1 font-fa"
                  onClick={() => { setTiles(tiles.filter((_, x) => x !== wi)); setPicked([...picked, w]); }}>
                  {w}</button>))}
            </div>
          </div>
        )}
        {item.kind === "stored" && item.ex.hint && !result &&
          <p className="mt-2 text-sm text-gray-400">hint: {item.ex.hint}</p>}
      </div>

      {item.kind !== "stored" || item.ex.type !== "scramble" ? (
        <div className="flex flex-col gap-2">
          <input dir={needsFaInput ? "rtl" : "ltr"} lang={needsFaInput ? "fa" : "en"}
            value={typed} onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && check()}
            className={`rounded border p-3 text-xl ${needsFaInput ? "font-fa" : ""}`} autoComplete="off" />
          {needsFaInput && <FaKeyboard onKey={(ch) => setTyped((t) => t + ch)}
            onBackspace={() => setTyped((t) => t.slice(0, -1))} />}
        </div>
      ) : null}

      {result && (
        <p className={`rounded p-3 text-center ${result === "correct" ? "bg-green-50 text-green-800"
          : result === "close" ? "bg-amber-50 text-amber-800" : "bg-red-50 text-red-800"}`}>
          {result === "correct" && "Correct"}
          {result === "close" && "Close — check the spelling"}
          {result === "wrong" && <>Answer: <FarsiText
            farsi={item.kind === "conj" ? item.expected : item.ex.answer} /></>}
        </p>
      )}
      <button onClick={check} className="rounded bg-black p-3 text-white">
        {result ? "Next" : "Check"}
      </button>
    </div>
  );
}
