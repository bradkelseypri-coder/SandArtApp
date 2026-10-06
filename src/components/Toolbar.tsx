import { Pressable, StyleSheet, Text, View } from "react-native";

import type { RakeName } from "../garden/rake";
import { colors, radius, spacing } from "../theme";

const TOOLS: { name: RakeName; label: string }[] = [
  { name: "stick", label: "Stick" },
  { name: "rake", label: "Rake" },
  { name: "wide", label: "Wide rake" },
];

type Props = {
  tool: RakeName;
  onSelectTool(tool: RakeName): void;
  onSmooth(): void;
};

export default function Toolbar({ tool, onSelectTool, onSmooth }: Props) {
  return (
    <View style={styles.bar}>
      <View style={styles.segments} accessibilityRole="radiogroup">
        {TOOLS.map(({ name, label }) => {
          const active = name === tool;
          return (
            <Pressable
              key={name}
              onPress={() => onSelectTool(name)}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              style={[styles.segment, active && styles.segmentActive]}
            >
              <Text style={[styles.label, active && styles.labelActive]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
      <Pressable
        onPress={onSmooth}
        accessibilityRole="button"
        accessibilityHint="Levels the sand and erases the pattern"
        style={({ pressed }) => [styles.smooth, pressed && styles.pressed]}
      >
        <Text style={styles.label}>Smooth</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  segments: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    padding: spacing.xs,
  },
  segment: {
    flex: 1,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
  },
  segmentActive: { backgroundColor: colors.surfaceActive },
  smooth: {
    minHeight: 48,
    paddingHorizontal: spacing.md,
    justifyContent: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: { backgroundColor: colors.surface },
  label: { color: colors.text, fontSize: 15, fontWeight: "500" },
  labelActive: { color: colors.textOnActive },
});
