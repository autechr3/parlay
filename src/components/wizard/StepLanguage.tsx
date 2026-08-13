"use client";

// Selectable per src/lib/languages module — only the fields the card needs (see
// src/components/CurriculumCard.tsx for the same native_name/dir/lang/font-script pattern).
export type WizardLanguage = {
  code: string;
  name: string;
  native_name: string;
  rtl: boolean;
};

export function StepLanguage({
  languages,
  value,
  onSelect,
}: {
  languages: WizardLanguage[];
  value?: string;
  onSelect: (code: string) => void;
}) {
  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold">Choose your language</h2>
      <p className="mb-4 text-sm text-gray-500">
        Pick the language you want to learn. You can add more languages later.
      </p>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {languages.map((l) => (
          <button
            key={l.code}
            type="button"
            onClick={() => onSelect(l.code)}
            className={`flex flex-col items-center gap-2 rounded border p-4 text-center hover:border-black ${
              value === l.code ? "border-black" : ""
            }`}
          >
            <span dir={l.rtl ? "rtl" : "ltr"} lang={l.code} className="font-script text-2xl">
              {l.native_name}
            </span>
            <span className="text-sm text-gray-600">{l.name}</span>
          </button>
        ))}
        <button
          type="button"
          disabled
          className="flex flex-col items-center justify-center gap-2 rounded border border-dashed p-4 text-center text-sm text-gray-400 opacity-60"
        >
          More languages coming soon
        </button>
      </div>
    </div>
  );
}
