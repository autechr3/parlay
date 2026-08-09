"use client";
import { useState, useEffect } from "react";

type Props = {
  farsi: string; translit?: string | null; english?: string | null;
  locked?: boolean; className?: string;
};

export function FarsiText({ farsi, translit, english, locked = false, className = "" }: Props) {
  const stages = [
    { key: "fa", text: farsi },
    ...(translit ? [{ key: "tr", text: translit }] : []),
    ...(english ? [{ key: "en", text: english }] : []),
  ];
  const [i, setI] = useState(0);
  useEffect(() => { setI(0); }, [farsi, translit, english]);
  const stage = stages[i % stages.length];
  const cyclable = !locked && stages.length > 1;

  const inner = stage.key === "fa"
    ? <span dir="rtl" lang="fa" className="font-fa">{stage.text}</span>
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
