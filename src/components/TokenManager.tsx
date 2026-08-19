"use client";
import { useState, useTransition } from "react";
import { createToken, revokeToken } from "@/app/settings/token-actions";

type Token = { id: string; name: string; created_at: string; last_used_at: string | null };

export function TokenManager({ tokens }: { tokens: Token[] }) {
  const [name, setName] = useState("");
  const [issued, setIssued] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const origin = typeof window !== "undefined" ? window.location.origin : "<URL>";

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("name", name);
        const { token } = await createToken(fd);
        setIssued(token);
        setName("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to create token");
      }
    });
  }

  function revoke(id: string) {
    startTransition(async () => {
      await revokeToken(id);
    });
  }

  return (
    <section className="mt-10 flex flex-col gap-4">
      <h2 className="text-xl font-bold">API tokens</h2>
      <p className="text-sm text-gray-500">
        Use a personal API token to connect Claude or another AI app to your account.
      </p>

      {issued && (
        <div className="rounded bg-yellow-50 p-3 text-sm">
          <p className="mb-2 font-semibold text-yellow-900">
            Shown once — store it now. You will not be able to see it again.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded bg-white p-2 text-xs">{issued}</code>
            <button
              className="rounded bg-black px-3 py-2 text-sm text-white"
              onClick={async () => {
                await navigator.clipboard.writeText(issued);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? "Copied ✓" : "Copy"}
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          className="w-64 rounded border p-2"
          placeholder="Token name (e.g. Claude Desktop)"
          value={name}
          disabled={pending}
          onChange={(e) => setName(e.target.value)}
        />
        <button
          className="rounded bg-black px-4 py-2 text-white disabled:opacity-40"
          disabled={pending || !name.trim()}
          onClick={submit}
        >
          Create token
        </button>
      </div>
      {error && <p className="text-sm text-red-800">{error}</p>}

      <ul className="flex flex-col gap-2">
        {tokens.map((t) => (
          <li key={t.id} className="flex items-center justify-between gap-4 rounded border p-3 text-sm">
            <div>
              <p className="font-medium">{t.name}</p>
              <p className="text-gray-500">
                Created {new Date(t.created_at).toLocaleDateString()}
                {" · "}
                Last used {t.last_used_at ? new Date(t.last_used_at).toLocaleString() : "never"}
              </p>
            </div>
            <button
              className="rounded bg-red-50 px-3 py-2 text-red-800 disabled:opacity-40"
              disabled={pending}
              onClick={() => revoke(t.id)}
            >
              Revoke
            </button>
          </li>
        ))}
        {tokens.length === 0 && <p className="text-sm text-gray-500">No tokens yet.</p>}
      </ul>

      <details className="rounded border p-3 text-sm">
        <summary className="cursor-pointer font-medium">Connect your AI app</summary>
        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded bg-gray-50 p-3 text-xs">
{`claude.ai → Settings → Connectors → Add custom connector → paste ${origin}/api/mcp
  → complete the sign-in/consent screen. No client ID or secret needed.
Claude Code:
  claude mcp add --transport http parlay ${origin}/api/mcp --header "Authorization: Bearer <token>"`}
        </pre>
      </details>
    </section>
  );
}
