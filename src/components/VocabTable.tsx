"use client";
import { useState } from "react";
import { TermText } from "./TermText";
import { ScriptKeyboard } from "./ScriptKeyboard";
import { getLanguage } from "@/lib/languages";
import { addVocabItem, toggleSuspend } from "@/app/vocab/actions";

const POS_OPTIONS = ["noun", "verb", "adj", "adv", "prep", "phrase", "number"];

export type VocabItem = {
  id: string; term: string; transliteration: string; translation: string;
  part_of_speech: string | null; lesson_id: number | null; tags: string[];
  lessons: { number: number } | { number: number }[] | null;
};
export type VocabReview = {
  vocab_id: string; due_on: string; ease: number; repetitions: number; suspended: boolean;
};
export type LessonOption = { id: number; number: number };

type Props = {
  items: VocabItem[]; reviews: VocabReview[]; lessons: LessonOption[]; initialQuery: string;
  initialLesson?: string; initialPos?: string; langCode?: string; rtl?: boolean;
};

function lessonNumber(item: VocabItem): number | null {
  const l = item.lessons;
  if (!l) return null;
  return Array.isArray(l) ? (l[0]?.number ?? null) : l.number;
}

export function VocabTable({ items, reviews, lessons, initialQuery, initialLesson = "", initialPos = "",
  langCode = "fa", rtl = true }: Props) {
  const language = getLanguage(langCode);
  const [showAdd, setShowAdd] = useState(false);
  const [termInput, setTermInput] = useState("");
  const [showAddKeyboard, setShowAddKeyboard] = useState(false);
  const [showSearchKeyboard, setShowSearchKeyboard] = useState(false);
  const [q, setQ] = useState(initialQuery);
  const reviewByVocab = new Map(reviews.map((r) => [r.vocab_id, r]));

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-bold">Vocabulary</h1>

      <form method="get" action="/vocab" className="flex flex-col gap-3 rounded border p-4 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <input name="q" value={q} onChange={(e) => setQ(e.target.value)}
            dir={rtl ? "rtl" : "ltr"} lang={langCode} placeholder="Search term, translation, or transliteration"
            className="min-w-56 flex-1 rounded border p-2 font-script" autoComplete="off" />
          {language.keyboardLayout && (
            <button type="button" onClick={() => setShowSearchKeyboard((v) => !v)}
              className="rounded border px-3 py-2">{showSearchKeyboard ? "hide keyboard" : "keyboard"}</button>
          )}
          <select name="lesson" defaultValue={initialLesson} className="rounded border p-2">
            <option value="">All lessons</option>
            {lessons.map((l) => (
              <option key={l.id} value={String(l.id)}>L{String(l.number).padStart(2, "0")}</option>
            ))}
          </select>
          <select name="pos" defaultValue={initialPos} className="rounded border p-2">
            <option value="">All parts of speech</option>
            {POS_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <button type="submit" className="rounded bg-black px-4 py-2 text-white">Search</button>
        </div>
        {showSearchKeyboard && language.keyboardLayout && (
          <ScriptKeyboard layout={language.keyboardLayout} onKey={(ch) => setQ((v) => v + ch)}
            onBackspace={() => setQ((v) => v.slice(0, -1))} />
        )}
      </form>

      <div className="overflow-x-auto">
        <table className="w-full min-w-max text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="p-2">Word</th>
              <th className="p-2">POS</th>
              <th className="p-2">Lesson</th>
              <th className="p-2">SRS</th>
              <th className="p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const review = reviewByVocab.get(item.id);
              const num = lessonNumber(item);
              return (
                <tr key={item.id} className="border-b">
                  <td className="p-2">
                    <TermText term={item.term} translit={item.transliteration} translation={item.translation}
                      rtl={rtl} langCode={langCode} />
                  </td>
                  <td className="p-2 text-gray-500">{item.part_of_speech ?? "—"}</td>
                  <td className="p-2 text-gray-500">{num != null ? `L${String(num).padStart(2, "0")}` : "—"}</td>
                  <td className="p-2 text-gray-500">
                    {review?.suspended && (
                      <span className="mr-2 rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">suspended</span>
                    )}
                    {review
                      ? `due ${review.due_on} · ease ${review.ease} · reps ${review.repetitions}`
                      : "unseen"}
                  </td>
                  <td className="p-2">
                    <button onClick={() => toggleSuspend(item.id, !review?.suspended)}
                      className="text-xs underline">{review?.suspended ? "unsuspend" : "suspend"}</button>
                  </td>
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr><td colSpan={5} className="p-4 text-center text-gray-500">No vocab matches.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <details className="rounded border p-4" open={showAdd} onToggle={(e) => setShowAdd(e.currentTarget.open)}>
        <summary className="cursor-pointer font-semibold">Add word</summary>
        <form action={async (formData) => { await addVocabItem(formData); setTermInput(""); }}
          className="mt-4 flex flex-col gap-3 text-sm">
          <label className="flex flex-col gap-1">Term
            <input name="term" value={termInput} onChange={(e) => setTermInput(e.target.value)}
              dir={rtl ? "rtl" : "ltr"} lang={langCode} required className="rounded border p-2 font-script" autoComplete="off" />
          </label>
          {language.keyboardLayout && (
            <button type="button" onClick={() => setShowAddKeyboard((v) => !v)}
              className="self-start rounded border px-3 py-2">
              {showAddKeyboard ? "hide keyboard" : "keyboard"}
            </button>
          )}
          {showAddKeyboard && language.keyboardLayout && (
            <ScriptKeyboard layout={language.keyboardLayout} onKey={(ch) => setTermInput((v) => v + ch)}
              onBackspace={() => setTermInput((v) => v.slice(0, -1))} />
          )}
          <label className="flex flex-col gap-1">Transliteration
            <input name="transliteration" required className="rounded border p-2" autoComplete="off" />
          </label>
          <label className="flex flex-col gap-1">Translation
            <input name="translation" required className="rounded border p-2" autoComplete="off" />
          </label>
          <label className="flex flex-col gap-1">Part of speech
            <select name="part_of_speech" defaultValue="" className="rounded border p-2">
              <option value="">—</option>
              {POS_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">Lesson
            <select name="lesson_id" defaultValue="" className="rounded border p-2">
              <option value="">—</option>
              {lessons.map((l) => (
                <option key={l.id} value={l.id}>L{String(l.number).padStart(2, "0")}</option>
              ))}
            </select>
          </label>
          <button type="submit" className="self-start rounded bg-black px-4 py-2 text-white">Add</button>
        </form>
      </details>
    </main>
  );
}
