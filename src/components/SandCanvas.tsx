import React, { useRef } from "react";
import { View, StyleSheet, PanResponder } from "react-native";
import { COLORS } from "../theme/colors";
import { SandArtData } from "../utils/sandData";

/**
 * SandCanvas
 * Renders sand particles as colored pixels/circles.
 * Handles tilt gestures.
 */
export default function SandCanvas({ sandArtData, onTilt, onRake }) {
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (evt, gestureState) => {
        onTilt && onTilt(gestureState.dx, gestureState.dy);
      },
      onPanResponderRelease: () => {},
    })
  ).current;

  // Render sand as small circles
  return (
    <View style={styles.sandCanvas} {...panResponder.panHandlers}>
      {sandArtData?.particles?.map((p, i) => (
        <View
          key={i}
          style={{
            position: "absolute",
            left: p.x,
            top: p.y,
            width: 4,
            height: 4,
            borderRadius: 2,
            backgroundColor: p.color,
            opacity: 0.9,
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  sandCanvas: {
    flex: 1,
    backgroundColor: COLORS.sand,
    borderRadius: 24,
    margin: 16,
    elevation: 2,
  },
});