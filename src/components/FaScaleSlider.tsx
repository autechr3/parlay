"use client";
import { useState } from "react";

// Range input named fa_scale so it submits with the surrounding settings form;
// the preview overrides --fa-scale locally so it tracks the thumb live while the
// rest of the site keeps the saved size until the form is saved.
export function FaScaleSlider({ initial }: { initial: number }) {
  const [v, setV] = useState(initial);
  return (
    <div className="flex flex-col gap-1">
      <label className="flex items-center justify-between gap-4">Farsi script size
        <span className="flex w-48 items-center gap-2">
          <input type="range" name="fa_scale" min={100} max={200} step={5}
            value={v} onChange={(e) => setV(Number(e.target.value))} className="flex-1" />
          <span className="w-11 text-right text-sm tabular-nums text-gray-500">{v}%</span>
        </span>
      </label>
      <p className="text-sm text-gray-500">
        Preview: <span dir="rtl" lang="fa" className="font-fa"
          style={{ "--fa-scale": v / 100 } as React.CSSProperties}>خواهش می‌کنم</span>
      </p>
    </div>
  );
}
