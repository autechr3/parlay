"use client";
import { useMemo, useState } from "react";
// This file is loaded directly by tests/wizard-steps.test.tsx, which vitest resolves without the
// "@/" alias (see src/components/FlashcardDeck.tsx's relative "../lib/languages" import for the
// same convention) — so tutor-skill is imported relatively here too.
import { buildTutorSkill, tutorSkillFilename } from "../../lib/tutor-skill";

export type AiTool = "claude" | "chatgpt";

export function StepSkill({
  languageCode,
  languageName,
  siteUrl,
  aiTool,
  onAiToolChange,
}: {
  languageCode: string;
  languageName: string;
  siteUrl: string;
  aiTool: AiTool;
  onAiToolChange: (tool: AiTool) => void;
}) {
  const [copied, setCopied] = useState(false);

  const flavor = aiTool === "claude" ? "claude-skill" : "gpt-instructions";
  const skill = useMemo(
    () => buildTutorSkill({ languageCode, languageName, siteUrl, flavor }),
    [languageCode, languageName, siteUrl, flavor],
  );
  const filename = tutorSkillFilename(languageCode);

  async function copy() {
    await navigator.clipboard.writeText(skill);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function download() {
    const blob = new Blob([skill], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold">Install your tutor skill</h2>
      <p className="mb-4 text-sm text-gray-500">
        This file teaches your AI assistant how to run study sessions and author curriculum
        content for you directly.
      </p>

      <div role="tablist" className="mb-4 flex gap-2 border-b">
        <button
          type="button"
          role="tab"
          aria-selected={aiTool === "claude"}
          onClick={() => onAiToolChange("claude")}
          className={`px-4 py-2 text-sm ${
            aiTool === "claude" ? "border-b-2 border-black font-semibold" : "text-gray-500"
          }`}
        >
          Claude
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={aiTool === "chatgpt"}
          onClick={() => onAiToolChange("chatgpt")}
          className={`px-4 py-2 text-sm ${
            aiTool === "chatgpt" ? "border-b-2 border-black font-semibold" : "text-gray-500"
          }`}
        >
          ChatGPT
        </button>
      </div>

      {aiTool === "chatgpt" && (
        <div className="mb-4 rounded border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-900">
          ChatGPT support is best-effort and untested — if something breaks, tell us.
        </div>
      )}

      <pre className="max-h-96 overflow-auto rounded bg-gray-50 p-3 text-xs whitespace-pre-wrap">
        {skill}
      </pre>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={copy}
          className="rounded bg-black px-4 py-2 text-sm text-white"
        >
          {copied ? "Copied ✓" : "Copy"}
        </button>
        <button type="button" onClick={download} className="rounded border px-4 py-2 text-sm">
          Download
        </button>
      </div>

      {aiTool === "claude" ? (
        <div className="mt-4 text-sm text-gray-600">
          <p className="mb-1 font-medium">Install it:</p>
          <ul className="list-disc pl-5">
            <li>Claude Desktop: Settings → Capabilities → Skills → add the downloaded file</li>
            <li>claude.ai: Settings → Capabilities → upload skill</li>
          </ul>
        </div>
      ) : (
        <div className="mt-4 text-sm text-gray-600">
          <p className="mb-1 font-medium">Install it:</p>
          <ul className="list-disc pl-5">
            <li>Create a custom GPT in ChatGPT</li>
            <li>Paste the text above into its Instructions field</li>
          </ul>
        </div>
      )}
    </div>
  );
}
