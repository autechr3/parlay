"use client";

const ROWS = [
  ["ض", "ص", "ث", "ق", "ف", "غ", "ع", "ه", "خ", "ح", "ج", "چ"],
  ["ش", "س", "ی", "ب", "ل", "ا", "ت", "ن", "م", "ک", "گ"],
  ["ظ", "ط", "ز", "ر", "ذ", "د", "پ", "و", "ژ", "آ"],
];

export function FaKeyboard({ onKey, onBackspace }:
  { onKey: (ch: string) => void; onBackspace: () => void }) {
  const btn = "min-w-10 min-h-10 rounded border bg-white px-2 text-lg font-fa active:bg-gray-200";
  const stop = (e: React.MouseEvent) => e.preventDefault(); // keep input focus
  return (
    <div dir="rtl" className="flex flex-col items-center gap-1 select-none" aria-label="Persian keyboard">
      {ROWS.map((row, ri) => (
        <div key={ri} className="flex gap-1">
          {row.map((ch) => (
            <button key={ch} type="button" className={btn}
              onMouseDown={stop} onClick={() => onKey(ch)}>{ch}</button>
          ))}
        </div>
      ))}
      <div className="flex gap-1">
        <button type="button" className={`${btn} text-sm`} onMouseDown={stop}
          onClick={() => onKey("‌")}>نیم‌فاصله</button>
        <button type="button" aria-label="space" className={`${btn} w-40`}
          onMouseDown={stop} onClick={() => onKey(" ")} />
        <button type="button" aria-label="backspace" className={btn}
          onMouseDown={stop} onClick={onBackspace}>⌫</button>
      </div>
    </div>
  );
}
