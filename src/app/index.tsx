import * as Haptics from "expo-haptics";
import { useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import SandGarden, { type SandGardenHandle } from "../components/SandGarden";
import Toolbar from "../components/Toolbar";
import { RAKES, type RakeName } from "../garden/rake";
import { colors, radius, spacing } from "../theme";

export default function GardenScreen() {
  const [tool, setTool] = useState<RakeName>("rake");
  const garden = useRef<SandGardenHandle>(null);

  const selectTool = (next: RakeName) => {
    if (next === tool) return;
    Haptics.selectionAsync();
    setTool(next);
  };

  const smooth = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    garden.current?.smooth();
  };

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <Text style={styles.title}>Zen Garden</Text>
      <View style={styles.garden}>
        <SandGarden ref={garden} rake={RAKES[tool]} />
      </View>
      <Toolbar tool={tool} onSelectTool={selectTool} onSmooth={smooth} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    paddingBottom: spacing.md,
  },
  title: {
    color: colors.textMuted,
    fontSize: 13,
    letterSpacing: 3,
    textTransform: "uppercase",
    textAlign: "center",
    marginTop: spacing.sm,
  },
  garden: {
    flex: 1,
    margin: spacing.md,
    borderRadius: radius.lg,
    overflow: "hidden",
  },
});
