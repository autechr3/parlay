import { View, Text, Pressable } from "../ui";
import { KEYBOARD_LAYOUT, ZWNJ } from "../../../lib/languages/fa";
import { radius, space, font } from "../../../lib/design/tokens";
import { useTheme } from "../theme";

// Port of src/components/ScriptKeyboard.tsx onto the RN-shaped primitives.
// Same layout data (KEYBOARD_LAYOUT), same ZWNJ/space/backspace row, same
// aria-labels ("space" / "backspace") so behavior matches the DOM component.
export function ScriptKeys({ onKey, onBackspace, rtl = true }: {
  onKey: (ch: string) => void;
  onBackspace: () => void;
  rtl?: boolean;
}) {
  const theme = useTheme();
  const keyStyle = {
    minWidth: 40,
    minHeight: 40,
    borderRadius: radius.sm,
    border: `1px solid ${theme.border}`,
    background: theme.surface,
    padding: `0 ${space(2)}px`,
  };

  return (
    <View
      dir={rtl ? "rtl" : "ltr"}
      style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: space(1), userSelect: "none" }}
    >
      {KEYBOARD_LAYOUT.map((row, ri) => (
        <View key={ri} style={{ display: "flex", gap: space(1) }}>
          {row.map((ch) => (
            <Pressable key={ch} onPress={() => onKey(ch)} style={keyStyle} preventFocusSteal>
              <Text style={{ fontFamily: font.script, fontSize: "1.1em", color: theme.text }}>{ch}</Text>
            </Pressable>
          ))}
        </View>
      ))}
      <View style={{ display: "flex", gap: space(1) }}>
        <Pressable onPress={() => onKey(ZWNJ)} style={keyStyle} preventFocusSteal>
          <Text style={{ fontFamily: font.script, fontSize: "0.9em", color: theme.text }}>نیم‌فاصله</Text>
        </Pressable>
        <Pressable ariaLabel="space" onPress={() => onKey(" ")} style={{ ...keyStyle, width: 160 }} preventFocusSteal />
        <Pressable ariaLabel="backspace" onPress={onBackspace} style={keyStyle} preventFocusSteal>
          <Text style={{ color: theme.text }}>⌫</Text>
        </Pressable>
      </View>
    </View>
  );
}
