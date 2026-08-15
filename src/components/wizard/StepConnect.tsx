"use client";
import { useMemo, useState } from "react";
import { StepSkill, type AiTool } from "./StepSkill";
// Relative imports — see Wizard.tsx's header comment for why "@/..." can't be used here.
import type { WelcomeStatus } from "../../app/welcome/status/build";
import { buildBootstrapPrompt } from "../../lib/tutor-skill";

export function StepConnect({
  languageCode,
  languageName,
  aiTool,
  onAiToolChange,
  siteUrl,
  status,
}: {
  languageCode: string;
  languageName: string;
  aiTool: AiTool;
  onAiToolChange: (tool: AiTool) => void;
  siteUrl: string;
  status: WelcomeStatus;
}) {
  const [promptCopied, setPromptCopied] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);
  const connectorUrl = `${siteUrl}/api/mcp`;

  // The one-paste bootstrap prompt (Task 1) — it names get_study_state and
  // get_tutor_instructions and covers all three connect paths itself, so this step no longer
  // needs its own claude/chatgpt tabs to decide what to show up front. The aiTool tabs live
  // inside the manual fallback below (StepSkill's own tablist), not here.
  const bootstrapPrompt = useMemo(
    () => buildBootstrapPrompt({ languageCode, languageName, siteUrl }),
    [languageCode, languageName, siteUrl],
  );

  async function copyPrompt() {
    await navigator.clipboard.writeText(bootstrapPrompt);
    setPromptCopied(true);
    setTimeout(() => setPromptCopied(false), 1500);
  }

  async function copyUrl() {
    await navigator.clipboard.writeText(connectorUrl);
    setUrlCopied(true);
    setTimeout(() => setUrlCopied(false), 1500);
  }

  const urlRow = (
    <div className="mt-1 flex items-center gap-2">
      <code className="flex-1 overflow-x-auto rounded bg-gray-50 p-2 text-xs">{connectorUrl}</code>
      <button
        type="button"
        onClick={copyUrl}
        className="shrink-0 rounded bg-black px-3 py-1 text-xs text-white"
      >
        {urlCopied ? "Copied ✓" : "Copy"}
      </button>
    </div>
  );

  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold">Copy one prompt into your AI — it does the rest.</h2>
      <p className="mb-4 text-sm text-gray-500">
        Paste this into Claude, ChatGPT, or any AI chat you use. It connects itself to this app
        over MCP and takes it from there — no manual setup needed.
      </p>

      <pre className="max-h-96 overflow-auto rounded bg-gray-50 p-3 text-xs whitespace-pre-wrap">
        {bootstrapPrompt}
      </pre>

      <div className="mt-3">
        <button
          type="button"
          onClick={copyPrompt}
          className="rounded bg-black px-4 py-2 text-sm text-white"
        >
          {promptCopied ? "Copied ✓" : "Copy"}
        </button>
      </div>

      <div className="mt-4">
        <p className="mb-1 text-sm text-gray-600">Connector URL, if your AI asks for one directly:</p>
        {urlRow}
      </div>

      <div className="mt-4 flex items-center gap-2 rounded border p-3 text-sm">
        {status.hasToken ? (
          <span className="text-green-700">
            {`✓ Connected — token '${status.tokenName}' active`}
          </span>
        ) : (
          <>
            <span className="h-2 w-2 animate-pulse rounded-full bg-gray-400" aria-hidden="true" />
            <span className="text-gray-500">Waiting for your AI tool to connect…</span>
          </>
        )}
      </div>

      <details className="mt-6 text-sm text-gray-500">
        <summary className="cursor-pointer">Set up manually instead</summary>

        <div className="mt-4">
          <StepSkill
            languageCode={languageCode}
            languageName={languageName}
            siteUrl={siteUrl}
            aiTool={aiTool}
            onAiToolChange={onAiToolChange}
          />
        </div>

        <div className="mt-6 border-t pt-4">
          <p className="mb-3 font-medium text-gray-600">Or connect the MCP connector by hand:</p>
          {aiTool === "claude" ? (
            <ol className="list-decimal space-y-3 pl-5 text-gray-600">
              <li>
                Open <strong>Settings → Connectors → Add custom connector</strong>.
              </li>
              <li>
                Paste this connector URL:
                {urlRow}
              </li>
              <li>Leave Client ID and Client secret blank.</li>
              <li>{"You will be sent to this app to sign in and approve the connection."}</li>
            </ol>
          ) : (
            <ol className="list-decimal space-y-3 pl-5 text-gray-600">
              <li>
                Open ChatGPT&#39;s connector (or custom action) settings and add a new connector —
                exact steps vary by plan and UI.
              </li>
              <li>
                Point it at this connector URL:
                {urlRow}
              </li>
              <li>Leave Client ID and Client secret blank.</li>
              <li>{"You will be sent to this app to sign in and approve the connection."}</li>
            </ol>
          )}
        </div>
      </details>
    </div>
  );
}
