import type { ReactNode } from "react";
import { View, Text, Pressable } from "../ui";
import { radius, space, font } from "../../../lib/design/tokens";
import { useTheme } from "../theme";

// Shared prompt header + answered-state feedback footer for all four exercise
// cards. Keeps CardShell as the single place that knows about the "active /
// correct / incorrect" border + Continue button contract from the brief.
type PromptLike = { text?: string; term?: string; term_vocalized?: string };

export function CardShell({ prompt, rtl, status, onContinue, children }: {
  prompt: PromptLike;
  rtl: boolean;
  status: "active" | "correct" | "incorrect";
  onContinue?: () => void;
  children: ReactNode;
}) {
  const theme = useTheme();
  const borderColor = status === "correct" ? theme.correct : status === "incorrect" ? theme.incorrect : theme.border;

  return (
    <View
      dir={rtl ? "rtl" : "ltr"}
      style={{
        background: theme.surface,
        borderRadius: radius.lg,
        border: `1px solid ${borderColor}`,
        padding: space(4),
        display: "flex",
        flexDirection: "column",
        gap: space(3),
      }}
    >
      {(prompt.term || prompt.text) && (
        <View style={{ display: "flex", flexDirection: "column", gap: space(1) }}>
          {prompt.term && (
            <View dir={rtl ? "rtl" : "ltr"}>
              <Text lang={rtl ? "fa" : undefined} style={{ fontFamily: font.script, fontSize: "1.6em", color: theme.text }}>
                {prompt.term_vocalized ?? prompt.term}
              </Text>
            </View>
          )}
          {prompt.text && (
            <View>
              <Text style={{ fontFamily: font.body, color: theme.muted }}>{prompt.text}</Text>
            </View>
          )}
        </View>
      )}
      {children}
      {status !== "active" && (
        <View style={{ display: "flex", justifyContent: rtl ? "flex-start" : "flex-end" }}>
          <Pressable
            onPress={() => onContinue?.()}
            style={{
              background: theme.primary,
              borderRadius: radius.pill,
              padding: `${space(2)}px ${space(4)}px`,
            }}
          >
            <Text style={{ color: theme.onPrimary, fontWeight: 700, fontFamily: font.body }}>Continue</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
