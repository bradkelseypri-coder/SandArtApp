import type { Point } from "./marble.ts";

export type PatternId = "spiral" | "petals" | "rose" | "garden" | "orbit";

export const PATTERNS: { id: PatternId; label: string }[] = [
  { id: "petals", label: "Petals" },
  { id: "spiral", label: "Spiral" },
  { id: "rose", label: "Rose" },
  { id: "garden", label: "Garden lines" },
  { id: "orbit", label: "Orbit" },
];

/**
 * Builds one continuous route for the marble, in grid cells, that fills a
 * w x h tray leaving `margin` cells clear of the wall. `pitch` is the distance
 * between neighbouring passes, so grooves sit side by side without overlapping.
 */
export function buildPattern(id: PatternId, w: number, h: number, margin: number, pitch: number): Point[] {
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  const rx = w / 2 - margin;
  const ry = h / 2 - margin;
  const rmin = Math.min(rx, ry);
  const pts: Point[] = [];
  const TAU = Math.PI * 2;

  if (id === "spiral") {
    const turns = Math.max(3, Math.floor(rmin / pitch));
    const steps = turns * 140;
    for (let i = 0; i <= steps; i++) {
      const f = i / steps;
      const a = f * turns * TAU;
      pts.push({ x: cx + Math.cos(a) * rx * f, y: cy + Math.sin(a) * ry * f });
    }
  } else if (id === "petals") {
    // a spiral whose radius ripples, so each turn lays a ring of petals
    const turns = Math.max(3, Math.floor(rmin / (pitch * 1.25)));
    const steps = turns * 220;
    for (let i = 0; i <= steps; i++) {
      const f = i / steps;
      const a = f * turns * TAU;
      const r = f * (0.86 + 0.14 * Math.sin(a * 8 + f * 5));
      pts.push({ x: cx + Math.cos(a) * rx * r, y: cy + Math.sin(a) * ry * r });
    }
  } else if (id === "rose") {
    // a rhodonea curve drawn again and again, growing a little each lap
    const laps = Math.max(2, Math.floor(rmin / (pitch * 2.2)));
    const steps = laps * 700;
    for (let i = 0; i <= steps; i++) {
      const f = i / steps;
      const a = f * laps * TAU;
      const grow = 0.3 + 0.7 * f;
      const r = Math.cos(2.5 * a + f * 1.2) * grow;
      pts.push({ x: cx + Math.cos(a) * rx * r, y: cy + Math.sin(a) * ry * r });
    }
  } else if (id === "garden") {
    // karesansui: long raked lines that sway gently, back and forth down the tray
    const rows = Math.max(3, Math.floor((2 * ry) / (pitch * 1.15)));
    const amp = pitch * 0.9;
    const waves = Math.max(2, Math.round(rx / 28));
    for (let r = 0; r <= rows; r++) {
      const y = cy - ry + (2 * ry * r) / rows;
      const n = 90;
      for (let i = 0; i <= n; i++) {
        const f = r % 2 === 0 ? i / n : 1 - i / n;
        pts.push({
          x: cx - rx + 2 * rx * f,
          y: y + Math.sin(f * waves * TAU) * amp * Math.sin((r / rows) * Math.PI),
        });
      }
    }
  } else {
    // orbit: a slowly decaying harmonograph
    const steps = 5200;
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * TAU * 26;
      const d = Math.exp(-t * 0.012);
      pts.push({
        x: cx + Math.sin(t * 1.003 + 0.6) * rx * d,
        y: cy + Math.sin(t * 0.667) * ry * d,
      });
    }
  }
  return pts;
}
