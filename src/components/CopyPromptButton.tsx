"use client";
import { useState } from "react";

export function CopyPromptButton({ prompt }: { prompt: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button className="rounded bg-black px-4 py-2 text-white"
      onClick={async () => { await navigator.clipboard.writeText(prompt); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
      {copied ? "Copied ✓" : "Copy tutor prompt"}
    </button>
  );
}
