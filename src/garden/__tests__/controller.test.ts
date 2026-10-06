import { CELLS_ACROSS, GardenController, type Frame } from "../controller";
import { RAKES } from "../rake";

/** A controller whose frames run only when the test says so. */
function setup() {
  const frames: Frame[] = [];
  let queued: (() => void) | null = null;
  const controller = new GardenController(
    (frame) => frames.push({ ...frame, pixels: Uint8Array.from(frame.pixels) }),
    (cb) => {
      queued = cb;
      return 1;
    },
    () => {
      queued = null;
    }
  );
  const runFrame = () => {
    const cb = queued;
    queued = null;
    cb?.();
  };
  return { controller, frames, runFrame, hasQueuedFrame: () => queued !== null };
}

describe("GardenController", () => {
  it("draws the whole garden once it is laid out", () => {
    const { controller, frames, runFrame } = setup();
    controller.layout(400, 600);
    runFrame();
    expect(frames).toHaveLength(1);
    expect(frames[0].width).toBe(CELLS_ACROSS);
    expect(frames[0].height).toBe(300);
    expect(frames[0].pixels.every((_, i) => i % 4 !== 3 || frames[0].pixels[i] === 255)).toBe(true);
  });

  it("keeps the pattern when laid out again at the same size", () => {
    const { controller, frames, runFrame, hasQueuedFrame } = setup();
    controller.layout(400, 600);
    runFrame();
    controller.layout(400, 600);
    expect(hasQueuedFrame()).toBe(false);
    expect(frames).toHaveLength(1);
  });

  it("batches a whole drag into one frame and changes the sand under it", () => {
    const { controller, frames, runFrame } = setup();
    controller.layout(400, 600);
    runFrame();
    const before = frames[0].pixels;

    controller.setRake(RAKES.stick);
    controller.begin(40, 300);
    for (let x = 50; x <= 360; x += 10) controller.move(x, 300);
    controller.end();
    runFrame();

    expect(frames).toHaveLength(2);
    // View (200, 300) maps to cell (100, 150), on the groove.
    const p = (150 * CELLS_ACROSS + 100) * 4;
    expect(frames[1].pixels.slice(p, p + 3)).not.toEqual(before.slice(p, p + 3));
    // Far from the stroke nothing changed.
    const q = (20 * CELLS_ACROSS + 100) * 4;
    expect(frames[1].pixels.slice(q, q + 3)).toEqual(before.slice(q, q + 3));
  });

  it("ignores moves without an active stroke", () => {
    const { controller, runFrame, hasQueuedFrame } = setup();
    controller.layout(400, 600);
    runFrame();
    controller.move(100, 100);
    controller.move(200, 200);
    expect(hasQueuedFrame()).toBe(false);
  });

  it("smooths away a pattern", () => {
    const { controller, frames, runFrame } = setup();
    controller.layout(400, 600);
    runFrame();
    controller.begin(40, 300);
    for (let x = 50; x <= 360; x += 10) controller.move(x, 300);
    runFrame();
    controller.smooth();
    runFrame();
    expect(frames[2].pixels).toEqual(frames[0].pixels);
  });

  it("cancels a pending frame on dispose", () => {
    const { controller, hasQueuedFrame } = setup();
    controller.layout(400, 600);
    expect(hasQueuedFrame()).toBe(true);
    controller.dispose();
    expect(hasQueuedFrame()).toBe(false);
  });
});
