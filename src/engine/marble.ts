import { SandTable } from "./sand.ts";

export type Point = { x: number; y: number };

/**
 * A steel marble pulled by a magnet under the table. The magnet (tx,ty) is what
 * moves; the marble follows on a damped spring, so it glides, lags a little and
 * settles, ploughing a groove as it goes. It never leaves the sand.
 */
export class Marble {
  x: number;
  y: number;
  vx = 0;
  vy = 0;
  tx: number;
  ty: number;
  readonly radius: number;
  /** spring stiffness of the magnet's pull: high follows a path tightly, low feels lazy */
  pull = 900;
  /** total roll, used to animate the surface */
  rolled = 0;
  private sx: number;
  private sy: number;

  constructor(x: number, y: number, radius: number) {
    this.x = this.tx = this.sx = x;
    this.y = this.ty = this.sy = y;
    this.radius = radius;
  }

  get depth() {
    return this.radius * 0.45;
  }

  get speed() {
    return Math.hypot(this.vx, this.vy);
  }

  /** Advance by dt seconds, carving the table. */
  step(dt: number, table: SandTable) {
    const sub = Math.max(1, Math.ceil(dt / (1 / 240)));
    const h = dt / sub;
    const k = this.pull;
    const c = 2 * Math.sqrt(k) * 0.9;
    const lim = this.radius;
    for (let s = 0; s < sub; s++) {
      this.vx += (k * (this.tx - this.x) - c * this.vx) * h;
      this.vy += (k * (this.ty - this.y) - c * this.vy) * h;
      this.x += this.vx * h;
      this.y += this.vy * h;
      // the tray wall
      if (this.x < lim) (this.x = lim), (this.vx = 0);
      if (this.y < lim) (this.y = lim), (this.vy = 0);
      if (this.x > table.w - 1 - lim) (this.x = table.w - 1 - lim), (this.vx = 0);
      if (this.y > table.h - 1 - lim) (this.y = table.h - 1 - lim), (this.vy = 0);
    }
    this.stamp(table);
  }

  private stamp(table: SandTable) {
    const dx = this.x - this.sx;
    const dy = this.y - this.sy;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.6) return;
    const ux = dx / dist;
    const uy = dy / dist;
    const n = Math.ceil(dist / 0.8);
    for (let i = 1; i <= n; i++) {
      const f = i / n;
      table.carve(this.sx + dx * f, this.sy + dy * f, this.radius, this.depth, ux, uy);
    }
    this.rolled += dist;
    this.sx = this.x;
    this.sy = this.y;
  }

  /** Press the resting marble into the sand (used when it is first set down). */
  rest(table: SandTable) {
    table.carve(this.x, this.y, this.radius, this.depth);
  }
}

/** Moves a point along a polyline at a steady speed: the magnet's route. */
export class PathFollower {
  readonly points: Point[];
  private seg = 0;
  private along = 0;
  private lengths: number[] = [];
  readonly total: number;
  travelled = 0;
  done = false;

  constructor(points: Point[]) {
    this.points = points;
    let total = 0;
    for (let i = 0; i + 1 < points.length; i++) {
      const l = Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
      this.lengths.push(l);
      total += l;
    }
    this.total = total;
    if (points.length < 2) this.done = true;
  }

  get progress() {
    return this.total > 0 ? Math.min(1, this.travelled / this.total) : 1;
  }

  advance(dist: number): Point {
    const p = this.points;
    if (p.length === 0) return { x: 0, y: 0 };
    while (!this.done && dist > 0) {
      const left = this.lengths[this.seg] - this.along;
      if (dist < left) {
        this.along += dist;
        this.travelled += dist;
        dist = 0;
      } else {
        dist -= left;
        this.travelled += left;
        this.seg++;
        this.along = 0;
        if (this.seg >= this.lengths.length) this.done = true;
      }
    }
    if (this.done) return p[p.length - 1];
    const a = p[this.seg];
    const b = p[this.seg + 1];
    const f = this.lengths[this.seg] > 0 ? this.along / this.lengths[this.seg] : 0;
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
  }
}
