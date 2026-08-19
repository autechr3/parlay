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
// isTerm marks labels that are target-language script (styled/directed as such);
// text-prompt labels stay in the UI's own typography.
export type MissedItem = { label: string; expected: string; isTerm: boolean };
export type DrillSummary = { total: number; correct: number; missed: MissedItem[] };

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

  function expectedFor(ex: Exercise, a: AttemptEvent): string {
    switch (ex.type) {
      case "choice":
        return ex.options.find((o) => o.id === ex.correct_id)?.text ?? "";
      case "typed":
        return ex.expected[0];
      case "cloze":
        return ex.blanks.map((b) => b.expected[0]).join(" ");
      case "match": {
        // MatchCard reports the fumbled pairings in its answer payload.
        try {
          const parsed = JSON.parse(a.answer_given) as { missed_pairs?: string[] };
          return (parsed.missed_pairs ?? []).join("; ");
        } catch {
          return "";
        }
      }
    }
  }

  function missedItem(a: AttemptEvent): MissedItem {
    const ex = drill.exercises.find((e) => e.id === a.exercise_id);
    if (!ex) return { label: a.exercise_id, expected: "", isTerm: false };
    const text = ex.prompt.text ?? ex.id;
    return {
      label: ex.prompt.term ?? (text.length > 60 ? `${text.slice(0, 57)}…` : text),
      expected: expectedFor(ex, a),
      isTerm: !!ex.prompt.term,
    };
  }

  function buildSummary(all: AttemptEvent[]): DrillSummary {
    return {
      total,
      correct: all.filter((a) => a.correct).length,
      missed: all.filter((a) => !a.correct).map(missedItem),
    };
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
      onComplete(buildSummary(attempts));
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

  const summary: DrillSummary | null = finished ? buildSummary(attempts) : null;

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
