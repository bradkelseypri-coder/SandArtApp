import {
  AlphaType,
  Canvas,
  ColorType,
  FilterMode,
  Image,
  MipmapMode,
  Skia,
  type SkImage,
} from "@shopify/react-native-skia";
import { useEffect, useImperativeHandle, useMemo, useState, type Ref } from "react";
import { StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";

import { GardenController, type Frame } from "../garden/controller";
import type { Rake } from "../garden/rake";

const SAMPLING = { filter: FilterMode.Linear, mipmap: MipmapMode.None };

export type SandGardenHandle = {
  /** Levels the sand, erasing every pattern. */
  smooth(): void;
};

type Props = {
  rake: Rake;
  ref?: Ref<SandGardenHandle>;
};

function toImage({ pixels, width, height }: Frame): SkImage | null {
  const info = { width, height, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Opaque };
  return Skia.Image.MakeImage(info, Skia.Data.fromBytes(pixels), width * 4);
}

/**
 * The raked-sand surface. Dragging a finger pulls the current rake through
 * the sand; the lit sand is drawn as one image, scaled to fill the view.
 */
export default function SandGarden({ rake, ref }: Props) {
  const [image, setImage] = useState<SkImage | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [controller] = useState(() => new GardenController((frame) => setImage(toImage(frame))));

  useEffect(() => controller.setRake(rake), [controller, rake]);
  useEffect(() => () => controller.dispose(), [controller]);
  useImperativeHandle(ref, () => ({ smooth: () => controller.smooth() }), [controller]);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .minDistance(0)
        .maxPointers(1)
        .onBegin((e) => controller.begin(e.x, e.y))
        .onUpdate((e) => controller.move(e.x, e.y))
        .onFinalize(() => controller.end()),
    [controller]
  );

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    controller.layout(width, height);
    setSize({ width, height });
  };

  return (
    <GestureDetector gesture={pan}>
      <View style={styles.container} onLayout={onLayout}>
        {size && (
          <Canvas style={StyleSheet.absoluteFill}>
            <Image
              image={image}
              x={0}
              y={0}
              width={size.width}
              height={size.height}
              fit="fill"
              sampling={SAMPLING}
            />
          </Canvas>
        )}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
