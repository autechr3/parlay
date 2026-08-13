"use client";
import { useMemo, useState } from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import { checkTypedAnswer } from "@/lib/text";
import { getLanguage } from "@/lib/languages";
import { checkEnglishAnswer } from "@/lib/english-check";
import { ScriptKeyboard } from "./ScriptKeyboard";
import { TermText } from "./TermText";
import { shuffle } from "./FlashcardDeck";

export type Ex = { id: string; type: "to_target" | "from_target" | "cloze" | "scramble";
  prompt: string; answer: string; accept: string[]; hint: string | null };
export type Verb = { term: string; transliteration: string; translation: string;
  morphology: Record<string, string> | null };

type Item =
  | { kind: "stored"; ex: Ex }
  | { kind: "conj"; verb: Verb; pronounIdx: number; tenseLabel: string; expected: string };

function buildItems(exercises: Ex[], verbs: Verb[], langCode: string): Item[] {
  const language = getLanguage(langCode);
  // Capability-gated: conjugation drills only exist when the language has a drill
  // provider AND drills.buildCards can actually derive cards from this verb's morphology.
  const conj: Item[] = language.drills
    ? verbs.flatMap((v, i) => {
        const cards = language.drills!.buildCards({
          term: v.term, transliteration: v.transliteration, translation: v.translation,
          morphology: v.morphology,
        });
        if (!cards) return [];
        const tenseCard = cards.length > 1 && i % 2 === 1 ? cards[1] : cards[0];
        const pronounIdx = (i * 7 + 3) % language.drills!.pronouns.length; // deterministic spread, no Math.random in render
        return [{ kind: "conj" as const, verb: v, pronounIdx, tenseLabel: tenseCard.label, expected: tenseCard.forms[pronounIdx] }];
      })
    : [];
  return [...exercises.map((ex) => ({ kind: "stored" as const, ex })), ...conj];
}

export function ExercisePlayer({ exercises, verbs, userId, langCode = "fa", rtl = true }:
  { exercises: Ex[]; verbs: Verb[]; userId: string; langCode?: string; rtl?: boolean }) {
  const supabase = useMemo(() => createBrowserClient(), []);
  const language = useMemo(() => getLanguage(langCode), [langCode]);
  const [items] = useState(() => buildItems(exercises, verbs, langCode));
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
      const v = checkTypedAnswer(typed, item.expected, language.normalize).verdict;
      ok = v === "exact"; close = v === "close";
    } else if (item.ex.type === "from_target") {
      ok = checkEnglishAnswer(typed, item.ex.answer, item.ex.accept);
    } else if (item.ex.type === "scramble") {
      ok = picked.join(" ") === item.ex.answer.split(/\s+/).join(" ");
    } else {
      const verdicts = [item.ex.answer, ...item.ex.accept]
        .map((a) => checkTypedAnswer(typed, a, language.normalize).verdict);
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

  const needsTargetInput = item.kind === "conj" ||
    (item.kind === "stored" && (item.ex.type === "to_target" || item.ex.type === "cloze"));

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-gray-400">{i + 1} / {items.length} · {score.right} correct</p>

      <div className="rounded border p-5 text-xl">
        {item.kind === "conj" && (
          <p><TermText term={item.verb.term} translit={item.verb.transliteration} rtl={rtl} langCode={langCode} locked={!result} />
            {" + "}<span dir={rtl ? "rtl" : "ltr"} lang={langCode} className="font-script">{language.drills!.pronouns[item.pronounIdx]}</span>
            {" → "}{item.tenseLabel.toLowerCase()} tense?</p>
        )}
        {item.kind === "stored" && item.ex.type === "to_target" && <p>Write it in the target language: <b>{item.ex.prompt}</b></p>}
        {item.kind === "stored" && item.ex.type === "from_target" && (
          <p>Write it in the base language: <TermText term={item.ex.prompt} rtl={rtl} langCode={langCode} locked /></p>)}
        {item.kind === "stored" && item.ex.type === "cloze" && (
          <p>Fill the blank: <span dir={rtl ? "rtl" : "ltr"} lang={langCode} className="font-script">{item.ex.prompt}</span></p>)}
        {item.kind === "stored" && item.ex.type === "scramble" && (
          <div>
            <p className="mb-2 text-sm text-gray-500">Arrange: &ldquo;{item.ex.prompt}&rdquo;</p>
            <div dir={rtl ? "rtl" : "ltr"} className="mb-2 min-h-10 rounded bg-gray-50 p-2 font-script">
              {picked.map((w, wi) => (
                <button key={wi} className="m-1 rounded border bg-white px-2 py-1"
                  onClick={() => { setPicked(picked.filter((_, x) => x !== wi)); setTiles([...tiles, w]); }}>
                  {w}</button>))}
            </div>
            <div dir={rtl ? "rtl" : "ltr"}>
              {tiles.map((w, wi) => (
                <button key={wi} className="m-1 rounded border px-2 py-1 font-script"
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
          <input dir={needsTargetInput ? (rtl ? "rtl" : "ltr") : "ltr"} lang={needsTargetInput ? langCode : "en"}
            value={typed} onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && check()}
            className={`rounded border p-3 text-xl ${needsTargetInput ? "font-script" : ""}`} autoComplete="off" />
          {needsTargetInput && language.keyboardLayout && (
            <ScriptKeyboard layout={language.keyboardLayout} onKey={(ch) => setTyped((t) => t + ch)}
              onBackspace={() => setTyped((t) => t.slice(0, -1))} />
          )}
        </div>
      ) : null}

      {result && (
        <p className={`rounded p-3 text-center ${result === "correct" ? "bg-green-50 text-green-800"
          : result === "close" ? "bg-amber-50 text-amber-800" : "bg-red-50 text-red-800"}`}>
          {result === "correct" && "Correct"}
          {result === "close" && "Close — check the spelling"}
          {result === "wrong" && <>Answer: <TermText
            term={item.kind === "conj" ? item.expected : item.ex.answer} rtl={rtl} langCode={langCode} /></>}
        </p>
      )}
      <button onClick={check} className="rounded bg-black p-3 text-white">
        {result ? "Next" : "Check"}
      </button>
    </div>
  );
}
