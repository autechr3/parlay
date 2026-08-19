import { useRef, useState } from "react";
import { View, Text, Pressable } from "../ui";
import { radius, space, font } from "../../../lib/design/tokens";
import type { Exercise } from "../../../lib/exercises/schema";
import { useTheme } from "../theme";
import { CardShell } from "./CardShell";

type MatchExercise = Extract<Exercise, { type: "match" }>;

// Deterministic shuffle keyed off a string seed (exercise id, or exercise id
// plus a column tag) so widget-cards.test.tsx and widget-drill-player.test.tsx
// get stable left/right column ordering across runs. FNV-1a hash -> mulberry32
// PRNG -> Fisher-Yates.
function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let state = seed;
  return function rand() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededShuffle<T>(items: T[], seed: string): T[] {
  const rand = mulberry32(hashSeed(seed));
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

type Item = { pairIndex: number; text: string };

export function MatchCard({ exercise, languageCode, onAnswer, onContinue }: {
  exercise: MatchExercise;
  languageCode: string;
  onAnswer: (a: { correct: boolean; answer_given: string; ms_taken: number }) => void;
  onContinue?: () => void;
}) {
  const theme = useTheme();
  const rtl = languageCode === "fa";
  const mountedAt = useRef(Date.now());

  const [left] = useState<Item[]>(() =>
    seededShuffle(exercise.pairs.map((p, i) => ({ pairIndex: i, text: p.left })), `${exercise.id}:left`));
  const [right] = useState<Item[]>(() =>
    seededShuffle(exercise.pairs.map((p, i) => ({ pairIndex: i, text: p.right })), `${exercise.id}:right`));

  const [matched, setMatched] = useState<Set<number>>(new Set());
  const [selectedLeft, setSelectedLeft] = useState<number | null>(null);
  const [selectedRight, setSelectedRight] = useState<number | null>(null);
  const [misses, setMisses] = useState(0);
  const [lastMiss, setLastMiss] = useState<{ l: number; r: number } | null>(null);
  const [done, setDone] = useState<{ correct: boolean } | null>(null);

  function evaluate(l: number, r: number) {
    if (l === r) {
      const next = new Set(matched);
      next.add(l);
      setMatched(next);
      setSelectedLeft(null);
      setSelectedRight(null);
      setLastMiss(null);
      if (next.size === exercise.pairs.length) {
        const correct = misses === 0;
        setDone({ correct });
        onAnswer({ correct, answer_given: JSON.stringify({ misses }), ms_taken: Date.now() - mountedAt.current });
      }
    } else {
      setMisses((m) => m + 1);
      setLastMiss({ l, r });
      setSelectedLeft(null);
      setSelectedRight(null);
    }
  }

  function pressLeft(pairIndex: number) {
    if (done || matched.has(pairIndex)) return;
    if (lastMiss) setLastMiss(null);
    if (selectedRight !== null) {
      evaluate(pairIndex, selectedRight);
      return;
    }
    setSelectedLeft(pairIndex);
  }

  function pressRight(pairIndex: number) {
    if (done || matched.has(pairIndex)) return;
    if (lastMiss) setLastMiss(null);
    if (selectedLeft !== null) {
      evaluate(selectedLeft, pairIndex);
      return;
    }
    setSelectedRight(pairIndex);
  }

  function borderFor(pairIndex: number, side: "l" | "r", selected: number | null) {
    if (matched.has(pairIndex)) return theme.primary;
    if (selected === pairIndex) return theme.accent;
    if (lastMiss && lastMiss[side] === pairIndex) return theme.incorrect;
    return theme.border;
  }

  return (
    <CardShell
      status={done ? (done.correct ? "correct" : "incorrect") : "active"}
      prompt={exercise.prompt}
      rtl={rtl}
      onContinue={onContinue}
    >
      <View style={{ display: "flex", flexDirection: rtl ? "row-reverse" : "row", gap: space(4) }}>
        <View style={{ display: "flex", flexDirection: "column", gap: space(2), flex: 1 }}>
          {left.map((item) => (
            <Pressable
              key={item.pairIndex}
              onPress={() => pressLeft(item.pairIndex)}
              disabled={matched.has(item.pairIndex)}
              style={{
                padding: space(2),
                borderRadius: radius.md,
                background: theme.surface,
                border: `1px solid ${borderFor(item.pairIndex, "l", selectedLeft)}`,
              }}
            >
              <Text dir={rtl ? "rtl" : "ltr"} lang={rtl ? "fa" : undefined}
                style={{ fontFamily: font.script, fontSize: "1.1em", color: theme.text }}>
                {item.text}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={{ display: "flex", flexDirection: "column", gap: space(2), flex: 1 }}>
          {right.map((item) => (
            <Pressable
              key={item.pairIndex}
              onPress={() => pressRight(item.pairIndex)}
              disabled={matched.has(item.pairIndex)}
              style={{
                padding: space(2),
                borderRadius: radius.md,
                background: theme.surface,
                border: `1px solid ${borderFor(item.pairIndex, "r", selectedRight)}`,
              }}
            >
              <Text style={{ fontFamily: font.body, color: theme.text }}>{item.text}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </CardShell>
  );
}
