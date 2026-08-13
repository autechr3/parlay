"use client";
import { useState } from "react";
import type { AiTool } from "./StepSkill";
// Relative import — see Wizard.tsx's header comment for why "@/..." can't be used here.
import type { WelcomeStatus } from "../../app/welcome/status/build";

export function StepConnect({
  aiTool,
  onAiToolChange,
  siteUrl,
  status,
}: {
  aiTool: AiTool;
  onAiToolChange: (tool: AiTool) => void;
  siteUrl: string;
  status: WelcomeStatus;
}) {
  const [copied, setCopied] = useState(false);
  const connectorUrl = `${siteUrl}/api/mcp`;

  async function copy() {
    await navigator.clipboard.writeText(connectorUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const urlRow = (
    <div className="mt-1 flex items-center gap-2">
      <code className="flex-1 overflow-x-auto rounded bg-gray-50 p-2 text-xs">{connectorUrl}</code>
      <button
        type="button"
        onClick={copy}
        className="shrink-0 rounded bg-black px-3 py-1 text-xs text-white"
      >
        {copied ? "Copied ✓" : "Copy"}
      </button>
    </div>
  );

  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold">Connect your AI tool</h2>
      <p className="mb-4 text-sm text-gray-500">
        Connect this app as an MCP server so your tutor can run study sessions and manage your
        curriculum directly — no copy/paste required.
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

      {aiTool === "claude" ? (
        <ol className="list-decimal space-y-3 pl-5 text-sm text-gray-600">
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
        <ol className="list-decimal space-y-3 pl-5 text-sm text-gray-600">
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
    </div>
  );
}
