import { createHeightField } from "../heightField";
import { RAKES, carveSegment } from "../rake";
import { DEFAULT_PALETTE, createSandRenderer } from "../shading";
import { createRandom } from "../random";

function brightness(pixels: Uint8Array, width: number, x: number, y: number) {
  const p = (y * width + x) * 4;
  return pixels[p] + pixels[p + 1] + pixels[p + 2];
}

describe("createSandRenderer", () => {
  it("draws level sand close to the base colour, fully opaque", () => {
    const field = createHeightField(20, 20);
    const renderer = createSandRenderer(20, 20);
    renderer.shade(field);
    const base = DEFAULT_PALETTE.base[0] + DEFAULT_PALETTE.base[1] + DEFAULT_PALETTE.base[2];
    for (let i = 0; i < 400; i++) {
      expect(renderer.pixels[i * 4 + 3]).toBe(255);
      expect(Math.abs(brightness(renderer.pixels, 20, i % 20, Math.floor(i / 20)) - base)).toBeLessThan(80);
    }
  });

  it("shades the groove wall facing away from the light darker than the one facing it", () => {
    const field = createHeightField(40, 40);
    carveSegment(field, RAKES.stick, { x: 0, y: 20.5 }, { x: 40, y: 20.5 }, { x: 1, y: 0 });
    const renderer = createSandRenderer(40, 40);
    renderer.shade(field);
    // Light comes from the top of the screen, so the groove's upper wall
    // (sloping down towards +y) is in shadow and its lower wall is lit.
    const upperWall = brightness(renderer.pixels, 40, 20, 19);
    const lowerWall = brightness(renderer.pixels, 40, 20, 21);
    expect(upperWall).toBeLessThan(lowerWall - 60);
  });

  it("only rewrites pixels inside the requested region (plus a one-cell margin)", () => {
    const field = createHeightField(30, 30);
    const renderer = createSandRenderer(30, 30);
    renderer.shade(field, { x0: 10, y0: 10, x1: 12, y1: 12 });
    expect(renderer.pixels[(9 * 30 + 9) * 4 + 3]).toBe(255);
    expect(renderer.pixels[(12 * 30 + 12) * 4 + 3]).toBe(255);
    expect(renderer.pixels[(14 * 30 + 14) * 4 + 3]).toBe(0);
    expect(renderer.pixels[(7 * 30 + 7) * 4 + 3]).toBe(0);
  });
});

describe("createRandom", () => {
  it("is deterministic per seed and stays within [0, 1)", () => {
    const a = createRandom(42);
    const b = createRandom(42);
    for (let i = 0; i < 1000; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
