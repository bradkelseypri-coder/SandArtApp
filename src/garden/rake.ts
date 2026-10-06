import type { HeightField } from "./heightField";

export type Point = { x: number; y: number };

/** Cell-space rectangle; x1/y1 are exclusive. */
export type Rect = { x0: number; y0: number; x1: number; y1: number };

/**
 * A rake drags `tines` points across the sand, side by side and
 * perpendicular to the direction of travel. Distances are in cells.
 */
export type Rake = {
  /** Number of tines. 1 behaves like a stick drawn through the sand. */
  tines: number;
  /** Distance between neighbouring tine centres. */
  spacing: number;
  /** Half-width of the groove each tine cuts. */
  tineRadius: number;
  /** How far below level sand the groove bottom sits. */
  depth: number;
  /** How far above level sand the displaced sand piles up. */
  ridge: number;
};

export const RAKES = {
  stick: { tines: 1, spacing: 0, tineRadius: 2.2, depth: 2.0, ridge: 0.6 },
  rake: { tines: 5, spacing: 4.4, tineRadius: 1.5, depth: 1.3, ridge: 0.5 },
  wide: { tines: 9, spacing: 4.4, tineRadius: 1.5, depth: 1.3, ridge: 0.5 },
} satisfies Record<string, Rake>;

export type RakeName = keyof typeof RAKES;

/**
 * Surface profile across one tine's path, as a function of distance from
 * the tine centre: a rounded groove out to `tineRadius`, then a ridge that
 * falls back to level at twice that distance.
 */
export function grooveProfile(rake: Rake, r: number): number {
  const R = rake.tineRadius;
  if (r < R) return -rake.depth * 0.5 * (1 + Math.cos((Math.PI * r) / R));
  if (r < 2 * R) return rake.ridge * Math.sin((Math.PI * (r - R)) / R);
  return 0;
}

/**
 * Carves one straight movement of the rake from `from` to `to` with the
 * tines laid out across `dir` (a unit vector). Cells are pulled towards the
 * groove profile rather than having it added, so retracing a line keeps it
 * crisp instead of digging ever deeper. With `startCap` false, sand behind
 * `from` is left alone: it was carved by the previous segment of the stroke
 * and re-carving it with this segment's rounded end would leave a bump at
 * every joint. Returns the cells touched, or null.
 */
export function carveSegment(
  field: HeightField,
  rake: Rake,
  from: Point,
  to: Point,
  dir: Point,
  startCap = true
): Rect | null {
  const nx = -dir.y;
  const ny = dir.x;
  const halfSpan = ((rake.tines - 1) / 2) * rake.spacing;
  const reach = 2 * rake.tineRadius;
  const pad = halfSpan + reach + 1;

  const x0 = Math.max(0, Math.floor(Math.min(from.x, to.x) - pad));
  const y0 = Math.max(0, Math.floor(Math.min(from.y, to.y) - pad));
  const x1 = Math.min(field.width, Math.ceil(Math.max(from.x, to.x) + pad));
  const y1 = Math.min(field.height, Math.ceil(Math.max(from.y, to.y) + pad));
  if (x0 >= x1 || y0 >= y1) return null;

  const sx = to.x - from.x;
  const sy = to.y - from.y;
  const lengthSq = sx * sx + sy * sy;
  const firstTine = -halfSpan;

  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      // Vector from the closest point on the segment to this cell's centre.
      const px = x + 0.5 - from.x;
      const py = y + 0.5 - from.y;
      const projection = px * sx + py * sy;
      if (!startCap && projection < 0) continue;
      let t = lengthSq > 0 ? projection / lengthSq : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const vx = px - t * sx;
      const vy = py - t * sy;
      const across = vx * nx + vy * ny;
      const along = vx * dir.x + vy * dir.y;

      // Distance to the nearest tine line.
      let tineIndex = rake.spacing > 0 ? Math.round((across - firstTine) / rake.spacing) : 0;
      tineIndex = tineIndex < 0 ? 0 : tineIndex >= rake.tines ? rake.tines - 1 : tineIndex;
      const offset = across - (firstTine + tineIndex * rake.spacing);
      const r = Math.sqrt(offset * offset + along * along);
      if (r >= reach) continue;

      // Full strength through the groove and most of the ridge, easing out
      // at the edge so the ridge blends into whatever sand was there.
      const fade = (reach - r) / (0.5 * rake.tineRadius);
      const weight = fade >= 1 ? 1 : fade * fade * (3 - 2 * fade);
      const i = y * field.width + x;
      field.data[i] += (grooveProfile(rake, r) - field.data[i]) * weight;
    }
  }
  return { x0, y0, x1, y1 };
}

/** Movements shorter than this (in cells) are ignored to avoid jitter. */
const MIN_STEP = 0.75;
/** How much of the previous heading is kept when the rake changes direction. */
const HEADING_INERTIA = 0.5;

export type Stroke = { last: Point; dir: Point | null; carved: boolean };

export function beginStroke(at: Point): Stroke {
  return { last: at, dir: null, carved: false };
}

/**
 * Moves an in-progress stroke to `to`, carving the sand on the way. The
 * rake's heading is smoothed so tines don't flip about on small wobbles.
 */
export function continueStroke(
  field: HeightField,
  rake: Rake,
  stroke: Stroke,
  to: Point
): Rect | null {
  const dx = to.x - stroke.last.x;
  const dy = to.y - stroke.last.y;
  const length = Math.hypot(dx, dy);
  if (length < MIN_STEP) return null;

  let hx = dx / length;
  let hy = dy / length;
  if (stroke.dir) {
    hx = stroke.dir.x * HEADING_INERTIA + hx * (1 - HEADING_INERTIA);
    hy = stroke.dir.y * HEADING_INERTIA + hy * (1 - HEADING_INERTIA);
    const h = Math.hypot(hx, hy);
    // A full reversal cancels out; just take the new heading.
    if (h < 1e-3) {
      hx = dx / length;
      hy = dy / length;
    } else {
      hx /= h;
      hy /= h;
    }
  }
  stroke.dir = { x: hx, y: hy };

  const dirty = carveSegment(field, rake, stroke.last, to, stroke.dir, !stroke.carved);
  stroke.last = to;
  stroke.carved = true;
  return dirty;
}
