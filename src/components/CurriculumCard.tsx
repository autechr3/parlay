"use client";
import { useTransition } from "react";
import { setActiveCurriculum, deleteCurriculum } from "@/app/curriculums/actions";

export type CurriculumCardData = {
  id: string;
  name: string;
  nativeName: string;
  langCode: string;
  rtl: boolean;
  lessonCount: number;
  completedCount: number;
  vocabCount: number;
  isActive: boolean;
};

export function CurriculumCard({ curriculum: c }: { curriculum: CurriculumCardData }) {
  const [pending, startTransition] = useTransition();
  const progress = c.lessonCount > 0 ? Math.round((c.completedCount / c.lessonCount) * 100) : 0;

  function activate() {
    startTransition(async () => { await setActiveCurriculum(c.id); });
  }

  function remove() {
    const ok = window.confirm(
      `Delete "${c.name}"? This permanently removes ${c.lessonCount} lesson${c.lessonCount === 1 ? "" : "s"} ` +
      `and ${c.vocabCount} vocab item${c.vocabCount === 1 ? "" : "s"}, plus your review history for them. ` +
      `This cannot be undone.`,
    );
    if (!ok) return;
    startTransition(async () => { await deleteCurriculum(c.id); });
  }

  return (
    <div className={`flex flex-col gap-2 rounded border p-4 ${c.isActive ? "border-green-600" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">{c.name}</h2>
        {c.isActive && (
          <span className="shrink-0 rounded bg-green-50 px-2 py-0.5 text-xs text-green-800">Active</span>
        )}
      </div>
      <span dir={c.rtl ? "rtl" : "ltr"} lang={c.langCode}
        className="w-fit rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600 font-script">{c.nativeName}</span>
      <p className="text-sm text-gray-500">{c.completedCount}/{c.lessonCount} lessons · {progress}% complete</p>
      <div className="h-1.5 w-full rounded bg-gray-100">
        <div className="h-1.5 rounded bg-black" style={{ width: `${progress}%` }} />
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-sm">
        {!c.isActive && (
          <button disabled={pending} onClick={activate}
            className="rounded border px-3 py-1 disabled:opacity-40">Set active</button>
        )}
        <a href={`/api/export?curriculum=${c.id}`} className="rounded border px-3 py-1">Export</a>
        <button disabled={pending} onClick={remove}
          className="rounded border border-red-200 px-3 py-1 text-red-800 disabled:opacity-40">Delete</button>
      </div>
    </div>
  );
}
