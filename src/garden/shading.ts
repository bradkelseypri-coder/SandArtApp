import { heightAt, type HeightField } from "./heightField";
import { createRandom } from "./random";
import type { Rect } from "./rake";

type RGB = readonly [number, number, number];

export type SandPalette = {
  /** Colour of level sand in neutral light. */
  base: RGB;
  /** Colour of slopes facing away from the light. */
  shadow: RGB;
  /** Colour of slopes facing the light. */
  highlight: RGB;
};

export const DEFAULT_PALETTE: SandPalette = {
  base: [228, 214, 188],
  shadow: [124, 102, 82],
  highlight: [250, 243, 228],
};

/** Direction towards the light: low, from the upper left, for long shadows. */
const LIGHT = normalize(-0.55, -0.7, 0.45);
/** Exaggerates slopes so shallow grooves still read clearly. */
const RELIEF = 1.6;
/** Light that reaches surfaces facing fully away from the light. */
const AMBIENT = 0.25;
/** Per-cell brightness variation that gives the sand its grain. */
const GRAIN = 0.07;

function normalize(x: number, y: number, z: number): [number, number, number] {
  const l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l];
}

/**
 * Turns a height field into lit RGBA pixels, one pixel per cell. The grain
 * pattern is fixed per renderer so the sand texture doesn't shimmer as the
 * surface changes.
 */
export type SandRenderer = {
  readonly pixels: Uint8Array;
  /** Re-lights `rect` (default: everything), widened by a cell for slopes. */
  shade(field: HeightField, rect?: Rect): void;
};

export function createSandRenderer(
  width: number,
  height: number,
  palette: SandPalette = DEFAULT_PALETTE,
  seed = 7
): SandRenderer {
  const pixels = new Uint8Array(width * height * 4);
  const grain = new Float32Array(width * height);
  const random = createRandom(seed);
  for (let i = 0; i < grain.length; i++) grain[i] = 1 + (random() - 0.5) * 2 * GRAIN;

  const [lx, ly, lz] = LIGHT;
  const { base, shadow, highlight } = palette;

  function shade(field: HeightField, rect?: Rect) {
    const x0 = Math.max(0, (rect?.x0 ?? 0) - 1);
    const y0 = Math.max(0, (rect?.y0 ?? 0) - 1);
    const x1 = Math.min(width, (rect?.x1 ?? width) + 1);
    const y1 = Math.min(height, (rect?.y1 ?? height) + 1);

    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const dx = (heightAt(field, x + 1, y) - heightAt(field, x - 1, y)) * 0.5 * RELIEF;
        const dy = (heightAt(field, x, y + 1) - heightAt(field, x, y - 1)) * 0.5 * RELIEF;
        // Surface normal is (-dx, -dy, 1), normalised.
        const lambert = Math.max(0, (-dx * lx - dy * ly + lz) / Math.sqrt(dx * dx + dy * dy + 1));
        // 1 on level sand, below 1 in shade, above 1 on lit slopes.
        const i = y * width + x;
        const light = (AMBIENT + ((1 - AMBIENT) * lambert) / lz) * grain[i];

        let r: number, g: number, b: number;
        if (light < 1) {
          const t = light;
          r = shadow[0] + (base[0] - shadow[0]) * t;
          g = shadow[1] + (base[1] - shadow[1]) * t;
          b = shadow[2] + (base[2] - shadow[2]) * t;
        } else {
          const t = Math.min(1, (light - 1) * 2);
          r = base[0] + (highlight[0] - base[0]) * t;
          g = base[1] + (highlight[1] - base[1]) * t;
          b = base[2] + (highlight[2] - base[2]) * t;
        }
        const p = i * 4;
        pixels[p] = r;
        pixels[p + 1] = g;
        pixels[p + 2] = b;
        pixels[p + 3] = 255;
      }
    }
  }

  return { pixels, shade };
}
