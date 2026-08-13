"use client";
import { useState, useEffect } from "react";

type Props = {
  term: string; translit?: string | null; translation?: string | null;
  rtl?: boolean; langCode?: string;
  locked?: boolean; className?: string;
};

export function TermText({ term, translit, translation, rtl = true, langCode = "fa",
  locked = false, className = "" }: Props) {
  const stages = [
    { key: "script", text: term },
    ...(translit ? [{ key: "tr", text: translit }] : []),
    ...(translation ? [{ key: "translation", text: translation }] : []),
  ];
  const [i, setI] = useState(0);
  useEffect(() => { setI(0); }, [term, translit, translation]);
  const stage = stages[i % stages.length];
  const cyclable = !locked && stages.length > 1;

  const inner = stage.key === "script"
    ? <span dir={rtl ? "rtl" : "ltr"} lang={langCode} className="font-script">{stage.text}</span>
    : <span className={stage.key === "tr" ? "italic" : ""}>{stage.text}</span>;

  if (!cyclable) return <span className={className}>{inner}</span>;
  return (
    <span role="button" tabIndex={0} title="click to toggle"
      className={`cursor-pointer select-none ${className}`}
      onClick={() => setI((v) => v + 1)}
      onKeyDown={(e) => { if (e.key === "Enter") setI((v) => v + 1); }}>
      {inner}
    </span>
  );
}
