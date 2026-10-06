import { createHeightField, smoothSand, type HeightField } from "./heightField";
import { RAKES, beginStroke, continueStroke, type Rake, type Rect, type Stroke } from "./rake";
import { createSandRenderer, type SandRenderer } from "./shading";

/** Simulation cells across the garden's width; height follows the aspect ratio. */
export const CELLS_ACROSS = 200;

export type Frame = { pixels: Uint8Array; width: number; height: number };

type Garden = {
  field: HeightField;
  renderer: SandRenderer;
  viewWidth: number;
  viewHeight: number;
};

/**
 * Owns a garden's sand and turns touches (in view coordinates) into raked
 * patterns. Changes are batched and re-lit at most once per scheduled frame,
 * then handed to `onFrame`. Free of React and Skia so it can be tested.
 */
export class GardenController {
  private garden: Garden | null = null;
  private rake: Rake = RAKES.rake;
  private stroke: Stroke | null = null;
  private pending: Rect | null = null;
  private frame: number | null = null;

  constructor(
    private readonly onFrame: (frame: Frame) => void,
    private readonly schedule: (cb: () => void) => number = requestAnimationFrame,
    private readonly cancel: (handle: number) => void = cancelAnimationFrame
  ) {}

  /**
   * Sizes the garden to its view. A new size starts fresh sand; the same
   * size is ignored so re-layouts don't wipe the pattern.
   */
  layout(viewWidth: number, viewHeight: number): void {
    if (viewWidth <= 0 || viewHeight <= 0) return;
    const g = this.garden;
    if (g && g.viewWidth === viewWidth && g.viewHeight === viewHeight) return;

    const rows = Math.max(1, Math.round((CELLS_ACROSS * viewHeight) / viewWidth));
    const field = createHeightField(CELLS_ACROSS, rows);
    smoothSand(field);
    this.garden = { field, renderer: createSandRenderer(CELLS_ACROSS, rows), viewWidth, viewHeight };
    this.stroke = null;
    this.invalidate({ x0: 0, y0: 0, x1: CELLS_ACROSS, y1: rows });
  }

  setRake(rake: Rake): void {
    this.rake = rake;
  }

  begin(x: number, y: number): void {
    if (this.garden) this.stroke = beginStroke(this.toCell(this.garden, x, y));
  }

  move(x: number, y: number): void {
    const g = this.garden;
    if (!g || !this.stroke) return;
    const dirty = continueStroke(g.field, this.rake, this.stroke, this.toCell(g, x, y));
    if (dirty) this.invalidate(dirty);
  }

  end(): void {
    this.stroke = null;
  }

  /** Levels the sand, erasing every pattern. */
  smooth(): void {
    const g = this.garden;
    if (!g) return;
    smoothSand(g.field);
    this.invalidate({ x0: 0, y0: 0, x1: g.field.width, y1: g.field.height });
  }

  dispose(): void {
    if (this.frame !== null) this.cancel(this.frame);
    this.frame = null;
  }

  private toCell(g: Garden, x: number, y: number) {
    return { x: (x / g.viewWidth) * g.field.width, y: (y / g.viewHeight) * g.field.height };
  }

  private invalidate(rect: Rect): void {
    const p = this.pending;
    this.pending = p
      ? {
          x0: Math.min(p.x0, rect.x0),
          y0: Math.min(p.y0, rect.y0),
          x1: Math.max(p.x1, rect.x1),
          y1: Math.max(p.y1, rect.y1),
        }
      : rect;
    if (this.frame === null) this.frame = this.schedule(() => this.flush());
  }

  private flush(): void {
    this.frame = null;
    const g = this.garden;
    const dirty = this.pending;
    this.pending = null;
    if (!g || !dirty) return;
    g.renderer.shade(g.field, dirty);
    this.onFrame({ pixels: g.renderer.pixels, width: g.field.width, height: g.field.height });
  }
}
