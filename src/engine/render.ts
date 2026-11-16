import { SandTable } from "./sand.ts";

/**
 * Shades the sand bed into a canvas the size of the grid: low light from the
 * top-left picks out grooves and ridges, and a per-cell grain keeps it sandy.
 * Only the part of the bed that changed is redrawn.
 */
export class SandRenderer {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private image: ImageData;
  private table: SandTable;

  constructor(table: SandTable) {
    this.table = table;
    this.canvas = document.createElement("canvas");
    this.canvas.width = table.w;
    this.canvas.height = table.h;
    this.ctx = this.canvas.getContext("2d")!;
    this.image = this.ctx.createImageData(table.w, table.h);
    table.markAllDirty();
  }

  /** Redraws the dirty part of the bed. Returns true if anything changed. */
  update(): boolean {
    const t = this.table;
    if (t.dx1 < t.dx0) return false;
    const { w, h, height, color, grain } = t;
    const out = this.image.data;
    const x0 = t.dx0;
    const y0 = t.dy0;
    const x1 = t.dx1;
    const y1 = t.dy1;
    for (let y = y0; y <= y1; y++) {
      const up = y > 0 ? -w : 0;
      const down = y < h - 1 ? w : 0;
      for (let x = x0; x <= x1; x++) {
        const i = y * w + x;
        const hl = height[x > 0 ? i - 1 : i];
        const hr = height[x < w - 1 ? i + 1 : i];
        const slope = hr - hl + (height[i + down] - height[i + up]);
        let lum = 1 + slope * 0.2 + height[i] * 0.035;
        if (lum < 0.42) lum = 0.42;
        else if (lum > 1.38) lum = 1.38;
        const g = grain[i];
        lum *= 1 + g * 0.11;
        if (g > 0.485) lum += 0.12; // the odd glinting grain
        const c = i * 3;
        const o = i * 4;
        out[o] = color[c] * lum;
        out[o + 1] = color[c + 1] * lum;
        out[o + 2] = color[c + 2] * lum;
        out[o + 3] = 255;
      }
    }
    this.ctx.putImageData(this.image, 0, 0, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
    t.clearDirty();
    return true;
  }
}
