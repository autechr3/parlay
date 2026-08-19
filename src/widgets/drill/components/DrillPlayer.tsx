import { useRef, useState } from "react";
import { View } from "../ui";
import { space, type Theme } from "../../../lib/design/tokens";
import type { Drill, Exercise } from "../../../lib/exercises/schema";
import { ThemeProvider } from "../theme";
import { ChoiceCard } from "./ChoiceCard";
import { TypedCard } from "./TypedCard";
import { ClozeCard } from "./ClozeCard";
import { MatchCard } from "./MatchCard";
import { Progress } from "./Progress";
import { Summary } from "./Summary";

export type AttemptEvent = { exercise_id: string; correct: boolean; answer_given: string; ms_taken: number };
export type DrillSummary = { total: number; correct: number; missed: string[] };

export function DrillPlayer({ drill, languageCode, theme, onAttempt, onComplete }: {
  drill: Drill;
  languageCode: string;
  theme: Theme;
  onAttempt: (a: AttemptEvent) => void;
  onComplete: (s: DrillSummary) => void;
}) {
  const [index, setIndex] = useState(0);
  const [attempts, setAttempts] = useState<AttemptEvent[]>([]);
  const completedRef = useRef(false);

  const total = drill.exercises.length;
  const finished = index >= total;
  const current = finished ? null : drill.exercises[index];
  const rtl = languageCode === "fa";

  function missedLabel(a: AttemptEvent): string {
    const ex = drill.exercises.find((e) => e.id === a.exercise_id);
    return ex?.prompt.term ?? ex?.prompt.text ?? a.exercise_id;
  }

  function handleAnswer(exercise: Exercise, a: { correct: boolean; answer_given: string; ms_taken: number }) {
    const attempt: AttemptEvent = { exercise_id: exercise.id, ...a };
    setAttempts((prev) => [...prev, attempt]);
    onAttempt(attempt);
  }

  function handleContinue() {
    const next = index + 1;
    setIndex(next);
    if (next >= total && !completedRef.current) {
      completedRef.current = true;
      const correct = attempts.filter((a) => a.correct).length;
      const missed = attempts.filter((a) => !a.correct).map(missedLabel);
      onComplete({ total, correct, missed });
    }
  }

  function renderCard(exercise: Exercise) {
    const onAnswer = (a: { correct: boolean; answer_given: string; ms_taken: number }) => handleAnswer(exercise, a);
    switch (exercise.type) {
      case "choice":
        return <ChoiceCard key={exercise.id} exercise={exercise} languageCode={languageCode} onAnswer={onAnswer} onContinue={handleContinue} />;
      case "typed":
        return <TypedCard key={exercise.id} exercise={exercise} languageCode={languageCode} onAnswer={onAnswer} onContinue={handleContinue} />;
      case "cloze":
        return <ClozeCard key={exercise.id} exercise={exercise} languageCode={languageCode} onAnswer={onAnswer} onContinue={handleContinue} />;
      case "match":
        return <MatchCard key={exercise.id} exercise={exercise} languageCode={languageCode} onAnswer={onAnswer} onContinue={handleContinue} />;
    }
  }

  const summary: DrillSummary | null = finished
    ? {
        total,
        correct: attempts.filter((a) => a.correct).length,
        missed: attempts.filter((a) => !a.correct).map(missedLabel),
      }
    : null;

  return (
    <ThemeProvider theme={theme}>
      <View style={{ display: "flex", flexDirection: "column", gap: space(4) }}>
        {!finished && current && (
          <>
            <Progress answered={attempts.length} total={total} />
            {renderCard(current)}
          </>
        )}
        {summary && <Summary summary={summary} rtl={rtl} />}
      </View>
    </ThemeProvider>
  );
}
