import type { Point } from "./marble.ts";

/**
 * Turns a picture into one continuous route for the marble.
 *
 * The marble can't lift off the sand, so the outlines found in the picture are
 * ordered nearest-first and joined end to end into a single line.
 *
 * channels: one or more planes of values 0..1 (brightness, or red/green/blue),
 *   each row-major with w*h values. With colour planes, two areas that differ
 *   only in hue (a yellow sun on a pale sky) still get an outline.
 * detail: 0..1, how faint an edge still gets traced.
 * Returns points in picture pixel coordinates.
 */
export function traceImage(channels: Float32Array | Float32Array[], w: number, h: number, detail: number): Point[] {
  const chains = findEdgeChains(channels, w, h, detail);
  if (chains.length === 0) return [];
  const ordered = orderChains(chains);
  let path: Point[] = [];
  for (const c of ordered) path = path.concat(simplify(c, 0.7));
  return chaikin(chaikin(path));
}

export function findEdgeChains(channels: Float32Array | Float32Array[], w: number, h: number, detail: number): Point[][] {
  const n = w * h;
  const planes = Array.isArray(channels) ? channels : [channels];

  // Sobel gradient, taking whichever plane changes most sharply at each pixel
  const mag = new Float32Array(n);
  const gxs = new Float32Array(n);
  const gys = new Float32Array(n);
  for (const plane of planes) {
    const blurred = blur(blur(plane, w, h), w, h);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const a = blurred[i - w - 1], b = blurred[i - w], c = blurred[i - w + 1];
        const d = blurred[i - 1], f = blurred[i + 1];
        const g = blurred[i + w - 1], hh = blurred[i + w], k = blurred[i + w + 1];
        const gx = c + 2 * f + k - a - 2 * d - g;
        const gy = g + 2 * hh + k - a - 2 * b - c;
        const m = Math.hypot(gx, gy);
        if (m > mag[i]) {
          gxs[i] = gx;
          gys[i] = gy;
          mag[i] = m;
        }
      }
    }
  }

  // Thin edges to one pixel: keep only the local maximum across the edge
  const thin = new Float32Array(n);
  const peaks: number[] = [];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const m = mag[i];
      if (m <= 0) continue;
      const ax = Math.abs(gxs[i]);
      const ay = Math.abs(gys[i]);
      let o1: number, o2: number;
      if (ax > ay * 2.414) (o1 = i - 1), (o2 = i + 1);
      else if (ay > ax * 2.414) (o1 = i - w), (o2 = i + w);
      else if (gxs[i] * gys[i] > 0) (o1 = i - w - 1), (o2 = i + w + 1);
      else (o1 = i - w + 1), (o2 = i + w - 1);
      if (m >= mag[o1] && m > mag[o2]) {
        thin[i] = m;
        peaks.push(m);
      }
    }
  }
  if (peaks.length === 0) return [];
  peaks.sort((p, q) => p - q);
  const top = peaks[Math.floor(peaks.length * 0.99)];
  const strong = top * (0.36 - 0.31 * clamp01(detail));
  const weak = strong * 0.5;

  // Walk along thinned edges, starting only from strong pixels
  const visited = new Uint8Array(n);
  const NB = [-1, 1, -w, w, -w - 1, -w + 1, w - 1, w + 1];
  const walk = (start: number): number[] => {
    const out: number[] = [];
    let cur = start;
    for (;;) {
      let next = -1;
      for (const o of NB) {
        const j = cur + o;
        if (thin[j] >= weak && !visited[j]) {
          next = j;
          break;
        }
      }
      if (next < 0) break;
      visited[next] = 1;
      out.push(next);
      cur = next;
    }
    return out;
  };

  const minLen = Math.round(14 - 9 * clamp01(detail));
  const chains: Point[][] = [];
  for (let i = 0; i < n; i++) {
    if (thin[i] < strong || visited[i]) continue;
    visited[i] = 1;
    const fwd = walk(i);
    const back = walk(i);
    if (fwd.length + back.length + 1 < minLen) continue;
    const idx = back.reverse().concat([i], fwd);
    chains.push(idx.map((j) => ({ x: j % w, y: (j / w) | 0 })));
  }
  // keep the picture readable and the trace a sensible length
  chains.sort((a, b) => b.length - a.length);
  return chains.slice(0, 450);
}

/** Greedy route: always go to the nearest loose end next, flipping chains as needed. */
export function orderChains(chains: Point[][]): Point[][] {
  const left = chains.slice();
  const out: Point[][] = [left.shift()!];
  while (left.length) {
    const tail = out[out.length - 1];
    const p = tail[tail.length - 1];
    let best = 0;
    let bestD = Infinity;
    let flip = false;
    for (let i = 0; i < left.length; i++) {
      const c = left[i];
      const a = c[0];
      const b = c[c.length - 1];
      const da = (a.x - p.x) ** 2 + (a.y - p.y) ** 2;
      const db = (b.x - p.x) ** 2 + (b.y - p.y) ** 2;
      if (da < bestD) (bestD = da), (best = i), (flip = false);
      if (db < bestD) (bestD = db), (best = i), (flip = true);
    }
    const c = left.splice(best, 1)[0];
    out.push(flip ? c.reverse() : c);
  }
  return out;
}

/** Ramer-Douglas-Peucker */
export function simplify(pts: Point[], eps: number): Point[] {
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const ax = pts[a].x, ay = pts[a].y;
    const bx = pts[b].x - ax, by = pts[b].y - ay;
    const len = Math.hypot(bx, by) || 1;
    let far = -1;
    let farD = eps;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((pts[i].x - ax) * by - (pts[i].y - ay) * bx) / len;
      if (d > farD) (farD = d), (far = i);
    }
    if (far > 0) {
      keep[far] = 1;
      stack.push([a, far], [far, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

function chaikin(pts: Point[]): Point[] {
  if (pts.length < 3) return pts;
  const out: Point[] = [pts[0]];
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    out.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
    out.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
  }
  out.push(pts[pts.length - 1]);
  return out;
}

function blur(src: Float32Array, w: number, h: number): Float32Array {
  const out = new Float32Array(src.length);
  for (let y = 0; y < h; y++) {
    const ym = y > 0 ? y - 1 : y;
    const yp = y < h - 1 ? y + 1 : y;
    for (let x = 0; x < w; x++) {
      const xm = x > 0 ? x - 1 : x;
      const xp = x < w - 1 ? x + 1 : x;
      out[y * w + x] =
        (src[ym * w + xm] + src[ym * w + x] + src[ym * w + xp] +
          src[y * w + xm] + src[y * w + x] + src[y * w + xp] +
          src[yp * w + xm] + src[yp * w + x] + src[yp * w + xp]) / 9;
    }
  }
  return out;
}

function clamp01(v: number) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Red, green and blue planes (0..1) of RGBA pixels, with transparency treated as white paper. */
export function toPlanes(rgba: Uint8ClampedArray, w: number, h: number): Float32Array[] {
  const planes = [new Float32Array(w * h), new Float32Array(w * h), new Float32Array(w * h)];
  for (let i = 0; i < w * h; i++) {
    const a = rgba[i * 4 + 3] / 255;
    for (let c = 0; c < 3; c++) planes[c][i] = (rgba[i * 4 + c] / 255) * a + (1 - a);
  }
  return planes;
}
