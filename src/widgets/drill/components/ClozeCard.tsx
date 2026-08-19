import { useRef, useState } from "react";
import { View, Text, Pressable, TextInputBox } from "../ui";
import { radius, space, font } from "../../../lib/design/tokens";
import { checkAnswer } from "../../../lib/exercises/check";
import type { Exercise } from "../../../lib/exercises/schema";
import { useTheme } from "../theme";
import { CardShell } from "./CardShell";
import { seededShuffle } from "./MatchCard";

type ClozeExercise = Extract<Exercise, { type: "cloze" }>;

export function ClozeCard({ exercise, languageCode, onAnswer, onContinue }: {
  exercise: ClozeExercise;
  languageCode: string;
  onAnswer: (a: { correct: boolean; answer_given: string; ms_taken: number }) => void;
  onContinue?: () => void;
}) {
  const theme = useTheme();
  const rtl = languageCode === "fa";
  const mountedAt = useRef(Date.now());
  const isTiles = exercise.mode === "tiles";

  const [result, setResult] = useState<{ correct: boolean } | null>(null);

  // "type" mode: one text value per blank, in blanks order.
  const [typedValues, setTypedValues] = useState<string[]>(() => exercise.blanks.map(() => ""));

  // "tiles" mode: a shuffled tile pool, which tile (if any) fills each blank,
  // and which tiles are already used.
  const [tiles] = useState<string[]>(() =>
    seededShuffle(exercise.tiles ?? exercise.blanks.map((b) => b.expected[0]), exercise.id));
  const [blankFill, setBlankFill] = useState<(number | null)[]>(() => exercise.blanks.map(() => null));
  const [tileUsed, setTileUsed] = useState<boolean[]>(() => tiles.map(() => false));

  const filledValues = isTiles
    ? blankFill.map((tileIdx) => (tileIdx === null ? "" : tiles[tileIdx]))
    : typedValues;
  const allFilled = filledValues.every((v) => v.trim().length > 0);

  function submit() {
    if (result || !allFilled) return;
    const { correct } = checkAnswer(languageCode, exercise, filledValues);
    setResult({ correct });
    onAnswer({ correct, answer_given: JSON.stringify(filledValues), ms_taken: Date.now() - mountedAt.current });
  }

  function tapTile(tileIdx: number) {
    if (result || tileUsed[tileIdx]) return;
    const nextBlank = blankFill.findIndex((f) => f === null);
    if (nextBlank === -1) return;
    const fill = blankFill.slice();
    fill[nextBlank] = tileIdx;
    setBlankFill(fill);
    const used = tileUsed.slice();
    used[tileIdx] = true;
    setTileUsed(used);
  }

  function clearBlank(blankPos: number) {
    if (result) return;
    const tileIdx = blankFill[blankPos];
    if (tileIdx === null) return;
    const fill = blankFill.slice();
    fill[blankPos] = null;
    setBlankFill(fill);
    const used = tileUsed.slice();
    used[tileIdx] = false;
    setTileUsed(used);
  }

  const blankStyle = {
    minWidth: 56,
    textAlign: "center" as const,
    padding: `${space(1)}px ${space(2)}px`,
    borderRadius: radius.sm,
    background: theme.bg,
  };

  return (
    <CardShell
      status={result ? (result.correct ? "correct" : "incorrect") : "active"}
      prompt={exercise.prompt}
      rtl={rtl}
      onContinue={onContinue}
    >
      <View style={{ display: "flex", flexDirection: "column", gap: space(3) }}>
        <View dir={rtl ? "rtl" : "ltr"} style={{ display: "flex", flexWrap: "wrap", gap: space(2), alignItems: "center" }}>
          {exercise.tokens.map((tok, i) => {
            const blankPos = exercise.blanks.findIndex((b) => b.index === i);
            if (blankPos === -1) {
              return (
                <Text key={i} style={{ fontFamily: font.script, fontSize: "1.3em", color: theme.text }}>{tok}</Text>
              );
            }
            if (isTiles) {
              const tileIdx = blankFill[blankPos];
              return (
                <Pressable
                  key={i}
                  onPress={() => clearBlank(blankPos)}
                  disabled={!!result || tileIdx === null}
                  style={{ ...blankStyle, border: `1px dashed ${theme.primary}` }}
                >
                  <Text style={{ fontFamily: font.script, fontSize: "1.3em", color: theme.text }}>
                    {tileIdx === null ? "___" : tiles[tileIdx]}
                  </Text>
                </Pressable>
              );
            }
            return (
              <TextInputBox
                key={i}
                ariaLabel={`blank-${i}`}
                value={typedValues[blankPos]}
                onChange={(v) => setTypedValues((vals) => vals.map((x, idx) => (idx === blankPos ? v : x)))}
                onSubmit={submit}
                dir={rtl ? "rtl" : "ltr"}
                style={{
                  width: 72,
                  fontFamily: font.script,
                  fontSize: "1.2em",
                  padding: space(1),
                  borderRadius: radius.sm,
                  border: `1px solid ${theme.border}`,
                  background: theme.bg,
                  color: theme.text,
                }}
              />
            );
          })}
        </View>

        {isTiles && (
          <View style={{ display: "flex", flexWrap: "wrap", gap: space(2) }}>
            {tiles.map((t, i) => (
              <Pressable
                key={i}
                onPress={() => tapTile(i)}
                disabled={!!result || tileUsed[i]}
                style={{
                  padding: `${space(1)}px ${space(3)}px`,
                  borderRadius: radius.pill,
                  border: `1px solid ${theme.border}`,
                  background: tileUsed[i] ? theme.bg : theme.surface,
                  opacity: tileUsed[i] ? 0.4 : 1,
                }}
              >
                <Text style={{ fontFamily: font.script, fontSize: "1.2em", color: theme.text }}>{t}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {!result && (
          <View style={{ display: "flex", justifyContent: rtl ? "flex-start" : "flex-end" }}>
            <Pressable
              onPress={submit}
              disabled={!allFilled}
              style={{
                background: theme.primary,
                borderRadius: radius.pill,
                padding: `${space(2)}px ${space(4)}px`,
                opacity: allFilled ? 1 : 0.5,
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
