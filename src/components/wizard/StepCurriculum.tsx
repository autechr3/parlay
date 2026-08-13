"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
// Relative imports — see Wizard.tsx's header comment for why "@/..." can't be used here.
import { buildCreateCoursePrompt } from "../../lib/agent-prompts";
import type { WelcomeStatus } from "../../app/welcome/status/build";

export function StepCurriculum({
  status,
  onCurriculumArrived,
}: {
  status: WelcomeStatus;
  // Called (possibly many times) whenever curriculumCount > 0. The "only once" guard lives in
  // Wizard, not here — Wizard stays mounted for the whole wizard session, whereas this component
  // unmounts every time the learner navigates off step 4 (Back to step 3, then Next re-mounts a
  // fresh instance with a fresh ref), so a local ref here would re-fire on every remount. Wizard's
  // ref-guarded callback fires completeOnboarding at most once per wizard mount; the server-side
  // idempotency in completeOnboarding itself (`.is("onboarded_at", null)`) already covers the
  // remaining case of multiple wizard mounts across page loads.
  onCurriculumArrived: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const prompt = buildCreateCoursePrompt(true);

  useEffect(() => {
    if (status.curriculumCount > 0) {
      onCurriculumArrived();
    }
  }, [status.curriculumCount, onCurriculumArrived]);

  async function copy() {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold">Create your first curriculum</h2>
      <p className="mb-4 text-sm text-gray-500">
        {
          "Customize this with your tutor first: mention your pace, your interests, and whether you prefer script or transliteration — tell it before it generates the curriculum, not after."
        }
      </p>

      <pre className="max-h-96 overflow-auto rounded bg-gray-50 p-3 text-xs whitespace-pre-wrap">
        {prompt}
      </pre>

      <div className="mt-3">
        <button
          type="button"
          onClick={copy}
          className="rounded bg-black px-4 py-2 text-sm text-white"
        >
          {copied ? "Copied ✓" : "Copy"}
        </button>
      </div>

      <div className="mt-4 rounded border p-3 text-sm">
        {status.curriculumCount > 0 ? (
          <span className="text-green-700">
            {`✓ '${status.firstCurriculumName}' imported — `}
            <Link href="/lessons" className="underline">
              Start learning →
            </Link>
          </span>
        ) : (
          <span className="text-gray-500">Waiting for your tutor to import a curriculum…</span>
        )}
      </div>

      <details className="mt-4 text-sm text-gray-500">
        <summary className="cursor-pointer">Advanced: manual import</summary>
        <p className="mt-1">
          {"For debugging or when you don't have an MCP connection, you can "}
          <Link href="/curriculums/import" className="underline">
            import a content package manually
          </Link>
          .
        </p>
      </details>
    </div>
  );
}
