import { createRandom } from "./random";

/**
 * The garden's sand surface: one height value per cell, stored row-major.
 * Height 0 is the level of freshly smoothed sand; grooves go negative and
 * the ridges pushed up beside them go positive. Units are cells.
 */
export type HeightField = {
  readonly width: number;
  readonly height: number;
  readonly data: Float32Array;
};

/** Amplitude of the faint unevenness left on freshly smoothed sand. */
const SURFACE_NOISE = 0.04;

export function createHeightField(width: number, height: number): HeightField {
  return { width, height, data: new Float32Array(width * height) };
}

/** Resets the field to level sand with a barely visible natural unevenness. */
export function smoothSand(field: HeightField, seed = 1): void {
  const random = createRandom(seed);
  for (let i = 0; i < field.data.length; i++) {
    field.data[i] = (random() - 0.5) * SURFACE_NOISE;
  }
}

/** Height at (x, y), clamping coordinates to the field's edges. */
export function heightAt(field: HeightField, x: number, y: number): number {
  const cx = x < 0 ? 0 : x >= field.width ? field.width - 1 : x;
  const cy = y < 0 ? 0 : y >= field.height ? field.height - 1 : y;
  return field.data[cy * field.width + cx];
}
