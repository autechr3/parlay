"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
// Relative imports — see Wizard.tsx's header comment for why "@/..." can't be used here.
import { buildCreateCoursePrompt } from "../../lib/agent-prompts";
import { completeOnboarding } from "../../app/welcome/actions";
import type { WelcomeStatus } from "../../app/welcome/status/build";

export function StepCurriculum({ status }: { status: WelcomeStatus }) {
  const [copied, setCopied] = useState(false);
  const prompt = buildCreateCoursePrompt(true);

  // Fire completeOnboarding the moment a curriculum shows up, but only once — polling in Wizard
  // keeps calling us with fresh status props (and Wizard itself stops polling once
  // curriculumCount > 0, but that guarantee lives one level up), so a ref rather than state
  // guards against double-firing on every subsequent render.
  const firedRef = useRef(false);
  useEffect(() => {
    if (status.curriculumCount > 0 && !firedRef.current) {
      firedRef.current = true;
      void completeOnboarding();
    }
  }, [status.curriculumCount]);

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
