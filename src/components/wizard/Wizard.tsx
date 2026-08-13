"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { completeOnboarding } from "@/app/welcome/actions";
import type { WelcomeStatus } from "@/app/welcome/status/build";
import { StepLanguage, type WizardLanguage } from "./StepLanguage";
import { StepSkill, type AiTool } from "./StepSkill";

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

  const selectedLanguage = languages.find((l) => l.code === languageCode) ?? languages[0];

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

  // Steps 1-2 track live wizard progress; steps 3-4 aren't built yet (Task 5), so their
  // done-check reflects the real account state fetched into initialStatus instead.
  function isDone(n: number): boolean {
    if (n === 3) return initialStatus.hasToken;
    if (n === 4) return initialStatus.curriculumCount > 0;
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
        <div className="rounded border p-6 text-sm text-gray-600">
          Continue to connection setup — coming next.
        </div>
      )}
      {step === 4 && (
        <div className="rounded border p-6 text-sm text-gray-600">
          Continue to your first curriculum — coming next.
        </div>
      )}

      <div className="mt-6 flex justify-between">
        <button
          type="button"
          disabled={step === 1}
          onClick={back}
          className="rounded border px-4 py-2 text-sm disabled:opacity-40"
        >
          Back
        </button>
        <button
          type="button"
          disabled={step === 4}
          onClick={next}
          className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </main>
  );
}
