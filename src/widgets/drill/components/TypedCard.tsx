import { useRef, useState } from "react";
import { View, Text, Pressable, TextInputBox } from "../ui";
import { radius, space, font } from "../../../lib/design/tokens";
import { checkAnswer } from "../../../lib/exercises/check";
import type { Exercise } from "../../../lib/exercises/schema";
import { useTheme } from "../theme";
import { CardShell } from "./CardShell";
import { ScriptKeys } from "./ScriptKeys";

type TypedExercise = Extract<Exercise, { type: "typed" }>;

export function TypedCard({ exercise, languageCode, onAnswer, onContinue }: {
  exercise: TypedExercise;
  languageCode: string;
  onAnswer: (a: { correct: boolean; answer_given: string; ms_taken: number }) => void;
  onContinue?: () => void;
}) {
  const theme = useTheme();
  const rtl = languageCode === "fa";
  const mountedAt = useRef(Date.now());
  const [value, setValue] = useState("");
  const [result, setResult] = useState<{ correct: boolean } | null>(null);

  const isScript = exercise.input === "script";
  const showKeyboard = isScript && exercise.keyboard !== false;

  function submit() {
    if (result || !value.trim()) return;
    const { correct } = checkAnswer(languageCode, exercise, value);
    setResult({ correct });
    onAnswer({ correct, answer_given: value, ms_taken: Date.now() - mountedAt.current });
  }

  return (
    <CardShell
      status={result ? (result.correct ? "correct" : "incorrect") : "active"}
      prompt={exercise.prompt}
      rtl={rtl}
      onContinue={onContinue}
    >
      <View style={{ display: "flex", flexDirection: "column", gap: space(3) }}>
        <TextInputBox
          ariaLabel="answer"
          value={value}
          onChange={setValue}
          onSubmit={submit}
          dir={isScript ? (rtl ? "rtl" : "ltr") : "ltr"}
          style={{
            fontFamily: isScript ? font.script : font.body,
            fontSize: isScript ? "1.4em" : "1em",
            padding: space(2),
            borderRadius: radius.md,
            border: `1px solid ${theme.border}`,
            background: theme.bg,
            color: theme.text,
          }}
        />
        {showKeyboard && !result && (
          <ScriptKeys
            rtl={rtl}
            onKey={(ch) => setValue((v) => v + ch)}
            onBackspace={() => setValue((v) => v.slice(0, -1))}
          />
        )}
        {!result && (
          <View style={{ display: "flex", justifyContent: rtl ? "flex-start" : "flex-end" }}>
            <Pressable
              onPress={submit}
              disabled={!value.trim()}
              style={{
                background: theme.primary,
                borderRadius: radius.pill,
                padding: `${space(2)}px ${space(4)}px`,
                opacity: value.trim() ? 1 : 0.5,
              }}
            >
              <Text style={{ color: theme.onPrimary, fontWeight: 700, fontFamily: font.body }}>Check</Text>
            </Pressable>
          </View>
        )}
      </View>
    </CardShell>
  );
}
