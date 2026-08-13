"use client";
import { useEffect, useState } from "react";
import { FarsiText } from "./FarsiText";
import { conjugatePresent, conjugatePast, PRONOUNS } from "../lib/farsi";

export type DeckCard =
  | { id: string; farsi: string; translit: string; english: string; kind: "vocab" }
  | { id: string; farsi: string; translit: string; english: string; kind: "verb";
      presentStem: string; pastStem: string | null };

function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(arr: T[], seed: number): T[] {
  const rnd = mulberry32(seed); const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function FlashcardDeck({ cards: initial }: { cards: DeckCard[] }) {
  const [cards, setCards] = useState(initial);
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const card = cards[i];

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === " ") { e.preventDefault(); setFlipped((f) => !f); }
      if (e.key === "ArrowRight") { setI((v) => Math.min(v + 1, cards.length - 1)); setFlipped(false); }
      if (e.key === "ArrowLeft") { setI((v) => Math.max(v - 1, 0)); setFlipped(false); }
      if (e.key === "s") { setCards((c) => shuffle(c, Date.now() & 0xffff)); setI(0); setFlipped(false); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cards.length]);

  if (!card) return <p className="p-6 text-gray-500">No cards in this deck.</p>;

  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-xs text-gray-400">{i + 1} / {cards.length}</p>
      <div onClick={() => setFlipped((f) => !f)}
        className="flex min-h-56 w-full max-w-md cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border p-6 text-3xl shadow-sm">
        {!flipped && <FarsiText farsi={card.farsi} translit={card.translit} english={card.english} />}
        {flipped && card.kind === "vocab" && (
          <>
            <FarsiText farsi={card.farsi} />
            <p className="text-xl italic text-gray-600">{card.translit}</p>
            <p className="text-xl text-gray-700">{card.english}</p>
          </>
        )}
        {flipped && card.kind === "verb" && (
          <table className="text-lg" onClick={(e) => e.stopPropagation()}>
            <tbody>
              {PRONOUNS.map((pr, r) => (
                <tr key={pr}>
                  <td className="pr-4 text-gray-500"><span dir="rtl" lang="fa" className="font-fa">{pr}</span></td>
                  <td className="pr-4"><span dir="rtl" lang="fa" className="font-fa">{conjugatePresent(card.presentStem)[r]}</span></td>
                  <td>{card.pastStem && <span dir="rtl" lang="fa" className="font-fa">{conjugatePast(card.pastStem)[r]}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="flex gap-3 text-sm">
        <button onClick={() => { setI((v) => Math.max(v - 1, 0)); setFlipped(false); }} className="rounded border px-4 py-2">← prev</button>
        <button onClick={() => setFlipped((f) => !f)} className="rounded border px-4 py-2">flip (space)</button>
        <button onClick={() => { setI((v) => Math.min(v + 1, cards.length - 1)); setFlipped(false); }} className="rounded border px-4 py-2">next →</button>
        <button onClick={() => { setCards((c) => shuffle(c, Date.now() & 0xffff)); setI(0); setFlipped(false); }} className="rounded border px-4 py-2">shuffle (s)</button>
      </div>
    </div>
  );
}
