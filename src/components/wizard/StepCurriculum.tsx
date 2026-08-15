"use client";
import { useEffect } from "react";
import Link from "next/link";
// Relative import — see Wizard.tsx's header comment for why "@/..." can't be used here.
import type { WelcomeStatus } from "../../app/welcome/status/build";

export function StepCurriculum({
  status,
  onCurriculumArrived,
}: {
  status: WelcomeStatus;
  // Called (possibly many times) whenever curriculumCount > 0. The "only once" guard lives in
  // Wizard, not here — Wizard stays mounted for the whole wizard session, whereas this component
  // unmounts every time the learner navigates off step 3 (Back to step 2, then Next re-mounts a
  // fresh instance with a fresh ref), so a local ref here would re-fire on every remount. Wizard's
  // ref-guarded callback fires completeOnboarding at most once per wizard mount; the server-side
  // idempotency in completeOnboarding itself (`.is("onboarded_at", null)`) already covers the
  // remaining case of multiple wizard mounts across page loads.
  onCurriculumArrived: () => void;
}) {
  useEffect(() => {
    if (status.curriculumCount > 0) {
      onCurriculumArrived();
    }
  }, [status.curriculumCount, onCurriculumArrived]);

  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold">First curriculum</h2>
      <p className="mb-4 text-sm text-gray-500">
        {
          "Your tutor will interview you about pace and interests, then generate and import your starter curriculum — leave this page open to see it arrive."
        }
      </p>

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
