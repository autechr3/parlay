import { View, Text } from "../ui";
import { radius, space, font } from "../../../lib/design/tokens";
import { useTheme } from "../theme";
import type { DrillSummary } from "./DrillPlayer";

function encouragement(correct: number, total: number): string {
  const ratio = total > 0 ? correct / total : 0;
  if (ratio >= 0.8) return "Excellent!";
  if (ratio >= 0.5) return "Good work — review the misses.";
  return "Tough one — let's review these.";
}

export function Summary({ summary, rtl }: { summary: DrillSummary; rtl: boolean }) {
  const theme = useTheme();

  return (
    <View style={{
      background: theme.surface, borderRadius: radius.lg, border: `1px solid ${theme.border}`,
      padding: space(4), display: "flex", flexDirection: "column", gap: space(3),
    }}>
      <Text style={{ fontFamily: font.display, fontSize: "2em", color: theme.text }}>
        {`${summary.correct}/${summary.total}`}
      </Text>
      <Text style={{ fontFamily: font.body, color: theme.muted }}>
        {encouragement(summary.correct, summary.total)}
      </Text>
      {summary.missed.length > 0 && (
        <View style={{ display: "flex", flexDirection: "column", gap: space(1) }}>
          <Text style={{ fontFamily: font.body, fontSize: "0.85em", color: theme.muted }}>Missed</Text>
          {summary.missed.map((m, i) => (
            <View key={i} dir="auto">
              <Text lang={rtl ? "fa" : undefined} style={{ fontFamily: font.script, fontSize: "1.2em", color: theme.text }}>
                {m}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
