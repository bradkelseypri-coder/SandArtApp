// The sand bed: a height field plus a colour per cell.
// Heights are in cell units; 0 is level sand, negative is a groove, positive a ridge.

export type RGB = [number, number, number];

const MAX_HEIGHT = 3.2;

export class SandTable {
  readonly w: number;
  readonly h: number;
  readonly height: Float32Array;
  /** r,g,b per cell, 0..255 */
  readonly color: Float32Array;
  /** fixed per-cell brightness jitter so the sand looks granular */
  readonly grain: Float32Array;

  // dirty rectangle (inclusive), empty when x1 < x0
  dx0 = 0;
  dy0 = 0;
  dx1 = -1;
  dy1 = -1;

  constructor(w: number, h: number, base: RGB) {
    this.w = w;
    this.h = h;
    this.height = new Float32Array(w * h);
    this.color = new Float32Array(w * h * 3);
    this.grain = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) this.grain[i] = Math.random() - 0.5;
    this.fill(base);
  }

  markDirty(x0: number, y0: number, x1: number, y1: number) {
    x0 = Math.max(0, x0);
    y0 = Math.max(0, y0);
    x1 = Math.min(this.w - 1, x1);
    y1 = Math.min(this.h - 1, y1);
    if (this.dx1 < this.dx0) {
      this.dx0 = x0;
      this.dy0 = y0;
      this.dx1 = x1;
      this.dy1 = y1;
    } else {
      if (x0 < this.dx0) this.dx0 = x0;
      if (y0 < this.dy0) this.dy0 = y0;
      if (x1 > this.dx1) this.dx1 = x1;
      if (y1 > this.dy1) this.dy1 = y1;
    }
  }

  markAllDirty() {
    this.markDirty(0, 0, this.w - 1, this.h - 1);
  }

  clearDirty() {
    this.dx1 = -1;
    this.dy1 = -1;
  }

  /**
   * Press a round object (the marble, a rake tine) into the sand at cx,cy.
   * Sand above the bowl-shaped floor is scooped out and piled in a ring around it,
   * mostly ahead of and beside the direction of travel, carrying its colour along.
   */
  carve(cx: number, cy: number, radius: number, depth: number, dirx = 0, diry = 0) {
    const { w, h, height, color } = this;
    const R = radius * 2.1;
    const x0 = Math.max(0, Math.floor(cx - R));
    const x1 = Math.min(w - 1, Math.ceil(cx + R));
    const y0 = Math.max(0, Math.floor(cy - R));
    const y1 = Math.min(h - 1, Math.ceil(cy + R));
    if (x1 < x0 || y1 < y0) return;
    const r2 = radius * radius;
    const R2 = R * R;
    const band = R - radius;
    const hasDir = dirx !== 0 || diry !== 0;

    let removed = 0;
    let cr = 0;
    let cg = 0;
    let cb = 0;
    let wsum = 0;

    for (let y = y0; y <= y1; y++) {
      const py = y - cy;
      for (let x = x0; x <= x1; x++) {
        const px = x - cx;
        const d2 = px * px + py * py;
        if (d2 >= R2) continue;
        const i = y * w + x;
        if (d2 < r2) {
          const floor = -depth * (1 - d2 / r2);
          const hh = height[i];
          if (hh > floor) {
            const rem = hh - floor;
            height[i] = floor;
            removed += rem;
            cr += color[i * 3] * rem;
            cg += color[i * 3 + 1] * rem;
            cb += color[i * 3 + 2] * rem;
          }
        } else {
          const d = Math.sqrt(d2);
          let wt = 1 - (d - radius) / band;
          if (hasDir) {
            const f = (px * dirx + py * diry) / d + 0.5;
            if (f <= 0) continue;
            wt *= f;
          }
          wsum += wt;
        }
      }
    }

    if (removed > 1e-6 && wsum > 0) {
      cr /= removed;
      cg /= removed;
      cb /= removed;
      const k = removed / wsum;
      for (let y = y0; y <= y1; y++) {
        const py = y - cy;
        for (let x = x0; x <= x1; x++) {
          const px = x - cx;
          const d2 = px * px + py * py;
          if (d2 >= R2) continue;
          if (d2 < r2) {
            // grains dragged along under the marble streak the groove floor
            const c = (y * w + x) * 3;
            color[c] += (cr - color[c]) * 0.22;
            color[c + 1] += (cg - color[c + 1]) * 0.22;
            color[c + 2] += (cb - color[c + 2]) * 0.22;
            continue;
          }
          const d = Math.sqrt(d2);
          let wt = 1 - (d - radius) / band;
          if (hasDir) {
            const f = (px * dirx + py * diry) / d + 0.5;
            if (f <= 0) continue;
            wt *= f;
          }
          const add = k * wt;
          const i = y * w + x;
          const nh = height[i] + add;
          height[i] = nh > MAX_HEIGHT ? MAX_HEIGHT : nh;
          const t = add / (add + 0.7);
          const c = i * 3;
          color[c] += (cr - color[c]) * t;
          color[c + 1] += (cg - color[c + 1]) * t;
          color[c + 2] += (cb - color[c + 2]) * t;
        }
      }
    }
    this.markDirty(x0 - 1, y0 - 1, x1 + 1, y1 + 1);
  }

  /** Pat the sand flat under a soft round brush. */
  smooth(cx: number, cy: number, radius: number, strength: number) {
    const { w, h, height } = this;
    const x0 = Math.max(0, Math.floor(cx - radius));
    const x1 = Math.min(w - 1, Math.ceil(cx + radius));
    const y0 = Math.max(0, Math.floor(cy - radius));
    const y1 = Math.min(h - 1, Math.ceil(cy + radius));
    const r2 = radius * radius;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d2 = (x - cx) * (x - cx) + (y - cy) * (y - cy);
        if (d2 >= r2) continue;
        const f = 1 - d2 / r2;
        height[y * w + x] *= 1 - strength * f;
      }
    }
    this.markDirty(x0 - 1, y0 - 1, x1 + 1, y1 + 1);
  }

  /**
   * Wipe the slate: flatten the sand under a wide soft brush and return its
   * colour toward `base`. This is what the marble does on its clearing pass.
   */
  sweep(cx: number, cy: number, radius: number, strength: number, base: RGB) {
    const { w, h, height, color } = this;
    const x0 = Math.max(0, Math.floor(cx - radius));
    const x1 = Math.min(w - 1, Math.ceil(cx + radius));
    const y0 = Math.max(0, Math.floor(cy - radius));
    const y1 = Math.min(h - 1, Math.ceil(cy + radius));
    const r2 = radius * radius;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d2 = (x - cx) * (x - cx) + (y - cy) * (y - cy);
        if (d2 >= r2) continue;
        // full strength over the middle of the band, fading only near its edge
        const t = strength * Math.min(1, 2 * (1 - d2 / r2));
        const i = y * w + x;
        height[i] *= 1 - t;
        const c = i * 3;
        const j = (Math.random() - 0.5) * 14;
        color[c] += (base[0] + j - color[c]) * t;
        color[c + 1] += (base[1] + j - color[c + 1]) * t;
        color[c + 2] += (base[2] + j - color[c + 2]) * t;
      }
    }
    this.markDirty(x0 - 1, y0 - 1, x1 + 1, y1 + 1);
  }

  /** Sprinkle coloured sand under a round brush. amount is roughly grains per cell per call, 0..1. */
  pour(cx: number, cy: number, radius: number, rgb: RGB, amount: number) {
    const { w, h, height, color } = this;
    const x0 = Math.max(0, Math.floor(cx - radius));
    const x1 = Math.min(w - 1, Math.ceil(cx + radius));
    const y0 = Math.max(0, Math.floor(cy - radius));
    const y1 = Math.min(h - 1, Math.ceil(cy + radius));
    const r2 = radius * radius;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d2 = (x - cx) * (x - cx) + (y - cy) * (y - cy);
        if (d2 >= r2) continue;
        const f = 1 - d2 / r2;
        if (Math.random() > f * amount) continue;
        const i = y * w + x;
        const c = i * 3;
        const j = (Math.random() - 0.5) * 22;
        color[c] += (rgb[0] + j - color[c]) * 0.75;
        color[c + 1] += (rgb[1] + j - color[c + 1]) * 0.75;
        color[c + 2] += (rgb[2] + j - color[c + 2]) * 0.75;
        const nh = height[i] + Math.random() * 0.22;
        height[i] = nh > MAX_HEIGHT ? MAX_HEIGHT : nh;
      }
    }
    this.markDirty(x0 - 1, y0 - 1, x1 + 1, y1 + 1);
  }

  /** Recolour the whole bed, keeping its shape. */
  fill(rgb: RGB) {
    const { color } = this;
    const n = this.w * this.h;
    for (let i = 0; i < n; i++) {
      const j = (Math.random() - 0.5) * 14;
      color[i * 3] = rgb[0] + j;
      color[i * 3 + 1] = rgb[1] + j;
      color[i * 3 + 2] = rgb[2] + j;
    }
    this.markAllDirty();
  }

  /**
   * Blend an RGBA picture (same size as the bed) into the sand colour.
   * Transparent pixels leave the sand as it is.
   */
  tint(rgba: Uint8ClampedArray, mix: number) {
    const { color } = this;
    const n = this.w * this.h;
    for (let i = 0; i < n; i++) {
      const a = (rgba[i * 4 + 3] / 255) * mix;
      if (a <= 0) continue;
      const j = (Math.random() - 0.5) * 16;
      const c = i * 3;
      color[c] += (rgba[i * 4] + j - color[c]) * a;
      color[c + 1] += (rgba[i * 4 + 1] + j - color[c + 1]) * a;
      color[c + 2] += (rgba[i * 4 + 2] + j - color[c + 2]) * a;
    }
    this.markAllDirty();
  }

  /** One step of levelling the whole bed. Returns true while there is still relief left. */
  settle(keep: number): boolean {
    const { height } = this;
    let max = 0;
    for (let i = 0; i < height.length; i++) {
      const v = height[i] * keep;
      height[i] = v;
      const a = v < 0 ? -v : v;
      if (a > max) max = a;
    }
    if (max < 0.03) height.fill(0);
    this.markAllDirty();
    return max >= 0.03;
  }
}
