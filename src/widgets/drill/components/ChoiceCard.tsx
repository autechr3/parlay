import { useRef, useState } from "react";
import { View, Text, Pressable } from "../ui";
import { radius, space, font } from "../../../lib/design/tokens";
import { checkAnswer } from "../../../lib/exercises/check";
import type { Exercise } from "../../../lib/exercises/schema";
import { useTheme } from "../theme";
import { CardShell } from "./CardShell";

type ChoiceExercise = Extract<Exercise, { type: "choice" }>;

export function ChoiceCard({ exercise, languageCode, onAnswer, onContinue }: {
  exercise: ChoiceExercise;
  languageCode: string;
  onAnswer: (a: { correct: boolean; answer_given: string; ms_taken: number }) => void;
  onContinue?: () => void;
}) {
  const theme = useTheme();
  const rtl = languageCode === "fa";
  const mountedAt = useRef(Date.now());
  const [answered, setAnswered] = useState<{ id: string; correct: boolean } | null>(null);

  function choose(optionId: string) {
    if (answered) return;
    const { correct } = checkAnswer(languageCode, exercise, optionId);
    setAnswered({ id: optionId, correct });
    onAnswer({ correct, answer_given: optionId, ms_taken: Date.now() - mountedAt.current });
  }

  return (
    <CardShell
      status={answered ? (answered.correct ? "correct" : "incorrect") : "active"}
      prompt={exercise.prompt}
      rtl={rtl}
      onContinue={onContinue}
    >
      <View style={{ display: "flex", flexDirection: "column", gap: space(2) }}>
        {exercise.options.map((opt) => {
          const isChosen = answered?.id === opt.id;
          const borderColor = isChosen ? (answered!.correct ? theme.correct : theme.incorrect) : theme.border;
          return (
            <Pressable
              key={opt.id}
              onPress={() => choose(opt.id)}
              disabled={!!answered}
              style={{
                padding: `${space(2)}px ${space(3)}px`,
                borderRadius: radius.md,
                border: `1px solid ${borderColor}`,
                background: theme.surface,
                textAlign: rtl ? "right" : "left",
              }}
            >
              <Text
                dir={opt.script ? (rtl ? "rtl" : "ltr") : undefined}
                lang={opt.script && rtl ? "fa" : undefined}
                style={{
                  fontFamily: opt.script ? font.script : font.body,
                  fontSize: opt.script ? "1.2em" : "1em",
                  color: theme.text,
                }}
              >
                {opt.text}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </CardShell>
  );
}
