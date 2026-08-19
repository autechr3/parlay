"use client";
import { useState } from "react";
import { importPackage, type ImportOutcome } from "@/app/curriculums/import/actions";

export function ImportForm() {
  const [raw, setRaw] = useState("");
  const [out, setOut] = useState<ImportOutcome | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(confirm: boolean) {
    setBusy(true);
    try {
      setOut(await importPackage(raw, confirm));
    } catch {
      setOut({ ok: false, errors: ["Import request failed — the package may be too large (limit ~1MB) or the connection dropped. Try a smaller package."] });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <textarea disabled={busy} value={raw} onChange={(e) => { setRaw(e.target.value); setOut(null); }}
        placeholder='Paste your content-package JSON here ({"format":"parlay/content-package",...})'
        className="h-64 rounded border p-3 font-mono text-xs" />
      <input type="file" disabled={busy} accept=".json" onChange={async (e) => {
        const f = e.target.files?.[0];
        if (f) {
          try {
            setRaw(await f.text());
            setOut(null);
          } catch {
            setOut({ ok: false, errors: ["Could not read the selected file."] });
          }
        }
      }} />
      {!out?.ok || !out.preview ? (
        <button disabled={!raw || busy} onClick={() => run(false)}
          className="rounded bg-black p-3 text-white disabled:opacity-40">Validate</button>
      ) : null}
      {out && !out.ok && (
        <div className="rounded bg-red-50 p-3 text-sm text-red-800">
          <p className="mb-1 font-semibold">Validation failed — paste these errors back to your agent:</p>
          <ul className="list-disc pl-5">{out.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
        </div>
      )}
      {out?.ok && out.preview && (
        <div className="rounded bg-gray-50 p-3 text-sm">
          <p>Curriculum <b>{out.preview.curriculumName}</b>{out.preview.curriculumExists ? " (existing)" : " (new)"}:{" "}
            {out.preview.units} units · {out.preview.lessons.total} lessons
            ({out.preview.lessons.new} new, {out.preview.lessons.updated} updated) ·{" "}
            {out.preview.vocab} vocab · {out.preview.exercises} exercises</p>
          <p className="mt-1 text-gray-500">Your review history is never modified by imports.</p>
          <button disabled={busy} onClick={() => run(true)}
            className="mt-2 rounded bg-black px-4 py-2 text-white">Import</button>
        </div>
      )}
      {out?.ok && out.result && (
        <p className="rounded bg-green-50 p-3 text-green-800">
          Imported: {out.result.lessons} lessons, {out.result.vocab} vocab, {out.result.exercises} exercises.</p>
      )}
    </div>
  );
}
