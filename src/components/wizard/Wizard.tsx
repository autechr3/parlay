"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
// Relative import (not "@/...") so this module resolves under vitest, which has no alias
// config — see tests/wizard-steps.test.tsx's header comment / tests/curriculum-actions.test.ts
// for the same convention.
import { completeOnboarding } from "../../app/welcome/actions";
import type { WelcomeStatus } from "../../app/welcome/status/build";
import { StepLanguage, type WizardLanguage } from "./StepLanguage";
import { StepSkill, type AiTool } from "./StepSkill";
import { StepConnect } from "./StepConnect";
import { StepCurriculum } from "./StepCurriculum";

const STEPS = [
  { n: 1, label: "Choose language" },
  { n: 2, label: "Install skill" },
  { n: 3, label: "Connect" },
  { n: 4, label: "First curriculum" },
] as const;

export function Wizard({
  languages,
  initialStatus,
  siteUrl,
}: {
  languages: WizardLanguage[];
  initialStatus: WelcomeStatus;
  siteUrl: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [languageCode, setLanguageCode] = useState("fa");
  const [aiTool, setAiTool] = useState<AiTool>("claude");
  const [status, setStatus] = useState<WelcomeStatus>(initialStatus);

  const selectedLanguage = languages.find((l) => l.code === languageCode) ?? languages[0];

  // Poll /welcome/status while the learner is on steps 3-4 — the only steps whose progress
  // happens outside this app, inside the learner's AI tool. Fetch immediately on entering either
  // step so the live strip doesn't wait out the first tick, then every 4s. Once a curriculum has
  // arrived there is nothing left to detect, so the effect returns early instead of arming a new
  // interval — the tick that flips curriculumCount to >0 cancels its own interval (via the
  // cleanup below) and never re-arms one, stopping polling entirely.
  useEffect(() => {
    if (step !== 3 && step !== 4) return;
    if (status.curriculumCount > 0) return;

    let cancelled = false;
    async function fetchStatus() {
      try {
        const res = await fetch("/welcome/status");
        if (res.ok && !cancelled) {
          const data = (await res.json()) as WelcomeStatus;
          setStatus(data);
        }
      } catch {
        // Transient network error — the next 4s tick retries silently.
      }
    }
    void fetchStatus();
    const id = setInterval(fetchStatus, 4000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [step, status.curriculumCount]);

  function selectLanguage(code: string) {
    setLanguageCode(code);
    setStep(2);
  }

  function back() {
    setStep((s) => Math.max(1, s - 1));
  }

  function next() {
    setStep((s) => Math.min(4, s + 1));
  }

  function skip() {
    // completeOnboarding already exists (Task 1) and is idempotent — call it directly rather
    // than deferring the stamp to a later step, then leave the wizard.
    void completeOnboarding().then(() => router.push("/curriculums"));
  }

  function finish() {
    void completeOnboarding().then(() => router.push("/curriculums"));
  }

  function isDone(n: number): boolean {
    if (n === 3) return status.hasToken;
    if (n === 4) return status.curriculumCount > 0;
    return step > n;
  }

  return (
    <main className="mx-auto max-w-2xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Welcome</h1>
        <button type="button" onClick={skip} className="text-sm text-gray-500 hover:underline">
          Skip setup
        </button>
      </div>

      <ol className="mb-8 flex flex-wrap gap-4 text-sm">
        {STEPS.map((s) => (
          <li
            key={s.n}
            className={`flex items-center gap-2 ${
              step === s.n ? "font-semibold text-black" : "text-gray-500"
            }`}
          >
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs ${
                isDone(s.n) ? "border-green-600 bg-green-50 text-green-800" : ""
              }`}
            >
              {isDone(s.n) ? "✓" : s.n}
            </span>
            {s.label}
          </li>
        ))}
      </ol>

      {step === 1 && <StepLanguage languages={languages} value={languageCode} onSelect={selectLanguage} />}
      {step === 2 && selectedLanguage && (
        <StepSkill
          languageCode={selectedLanguage.code}
          languageName={selectedLanguage.name}
          siteUrl={siteUrl}
          aiTool={aiTool}
          onAiToolChange={setAiTool}
        />
      )}
      {step === 3 && (
        <StepConnect aiTool={aiTool} onAiToolChange={setAiTool} siteUrl={siteUrl} status={status} />
      )}
      {step === 4 && <StepCurriculum status={status} />}

      <div className="mt-6 flex justify-between">
        <button
          type="button"
          disabled={step === 1}
          onClick={back}
          className="rounded border px-4 py-2 text-sm disabled:opacity-40"
        >
          Back
        </button>
        {step < 4 ? (
          <button
            type="button"
            onClick={next}
            className="rounded bg-black px-4 py-2 text-sm text-white"
          >
            Next
          </button>
        ) : (
          <button
            type="button"
            onClick={finish}
            className="rounded bg-black px-4 py-2 text-sm text-white"
          >
            Finish
          </button>
        )}
      </div>
    </main>
  );
}
