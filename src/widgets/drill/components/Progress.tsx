import { View, Text } from "../ui";
import { radius, space, font } from "../../../lib/design/tokens";
import { useTheme } from "../theme";

// Answered/total pill bar shown above the active card.
export function Progress({ answered, total }: { answered: number; total: number }) {
  const theme = useTheme();
  const pct = total > 0 ? Math.min(100, Math.round((answered / total) * 100)) : 0;

  return (
    <View style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: space(2) }}>
      <View style={{
        flex: 1, height: 8, borderRadius: radius.pill, background: theme.border, overflow: "hidden",
      }}>
        <View style={{ width: `${pct}%`, height: "100%", borderRadius: radius.pill, background: theme.primary }} />
      </View>
      <Text style={{ fontFamily: font.body, fontSize: "0.85em", color: theme.muted }}>{`${answered}/${total}`}</Text>
    </View>
  );
}
