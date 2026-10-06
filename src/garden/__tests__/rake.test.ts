import { createHeightField, heightAt, smoothSand } from "../heightField";
import {
  RAKES,
  beginStroke,
  carveSegment,
  continueStroke,
  grooveProfile,
  type Rake,
} from "../rake";

const right = { x: 1, y: 0 };

function flatField(width = 60, height = 40) {
  return createHeightField(width, height);
}

describe("grooveProfile", () => {
  const rake = RAKES.stick;

  it("is deepest at the tine centre", () => {
    expect(grooveProfile(rake, 0)).toBeCloseTo(-rake.depth);
  });

  it("rises into a ridge beside the groove and returns to level", () => {
    const R = rake.tineRadius;
    expect(grooveProfile(rake, R)).toBeCloseTo(0);
    expect(grooveProfile(rake, 1.5 * R)).toBeCloseTo(rake.ridge);
    expect(grooveProfile(rake, 2 * R)).toBeCloseTo(0);
    expect(grooveProfile(rake, 10 * R)).toBe(0);
  });
});

describe("carveSegment", () => {
  it("cuts a groove along the path with ridges either side", () => {
    const field = flatField();
    const rake = RAKES.stick;
    carveSegment(field, rake, { x: 10, y: 20.5 }, { x: 50, y: 20.5 }, right);

    expect(heightAt(field, 30, 20)).toBeCloseTo(-rake.depth, 1);
    const ridgeOffset = Math.round(1.5 * rake.tineRadius);
    expect(heightAt(field, 30, 20 - ridgeOffset)).toBeGreaterThan(0.3);
    expect(heightAt(field, 30, 20 + ridgeOffset)).toBeGreaterThan(0.3);
    expect(heightAt(field, 30, 5)).toBe(0);
  });

  it("returns the touched region clamped to the field", () => {
    const field = flatField();
    const dirty = carveSegment(field, RAKES.stick, { x: -5, y: 2 }, { x: 5, y: 2 }, right);
    expect(dirty).not.toBeNull();
    expect(dirty!.x0).toBe(0);
    expect(dirty!.y0).toBe(0);
    expect(dirty!.x1).toBeGreaterThan(5);
    expect(dirty!.x1).toBeLessThanOrEqual(field.width);
  });

  it("returns null when the rake is entirely outside the field", () => {
    const field = flatField();
    expect(carveSegment(field, RAKES.stick, { x: -50, y: -50 }, { x: -40, y: -50 }, right)).toBeNull();
  });

  it("does not dig deeper when the same line is raked again", () => {
    const field = flatField();
    const from = { x: 10, y: 20.5 };
    const to = { x: 50, y: 20.5 };
    const { depth, ridge } = RAKES.rake;
    for (let pass = 0; pass < 5; pass++) carveSegment(field, RAKES.rake, from, to, right);
    expect(heightAt(field, 30, 20)).toBeCloseTo(-depth, 4);
    for (const h of field.data) {
      expect(h).toBeGreaterThanOrEqual(-depth - 1e-6);
      expect(h).toBeLessThanOrEqual(ridge + 1e-6);
    }
  });

  it("cuts one groove per tine, spaced across the direction of travel", () => {
    const rake: Rake = { tines: 3, spacing: 6, tineRadius: 1.5, depth: 1, ridge: 0.5 };
    const field = flatField();
    carveSegment(field, rake, { x: 10, y: 20.5 }, { x: 50, y: 20.5 }, right);
    for (const y of [14, 20, 26]) expect(heightAt(field, 30, y)).toBeCloseTo(-1, 1);
    // Between tines the sand is pushed up into ridges, not cut.
    expect(heightAt(field, 30, 16)).toBeGreaterThan(0.3);
    expect(heightAt(field, 30, 24)).toBeGreaterThan(0.3);
  });
});

describe("strokes", () => {
  it("ignores movements too small to be deliberate", () => {
    const field = flatField();
    const stroke = beginStroke({ x: 20, y: 20 });
    expect(continueStroke(field, RAKES.stick, stroke, { x: 20.2, y: 20.1 })).toBeNull();
    expect(field.data.every((h) => h === 0)).toBe(true);
  });

  it("leaves an even groove when a line is drawn in many small steps", () => {
    const field = flatField(120, 40);
    const rake = RAKES.stick;
    const stroke = beginStroke({ x: 5, y: 20.5 });
    for (let x = 6; x <= 115; x += 1.3) continueStroke(field, rake, stroke, { x, y: 20.5 });

    // Joints between steps must not leave bumps along the groove floor.
    for (let x = 15; x < 105; x++) expect(heightAt(field, x, 20)).toBeCloseTo(-rake.depth, 1);
  });

  it("turns the rake to follow the direction of travel", () => {
    const field = flatField(60, 60);
    const stroke = beginStroke({ x: 30.5, y: 5 });
    for (let y = 6; y <= 55; y++) continueStroke(field, RAKES.rake, stroke, { x: 30.5, y });
    // Moving down the screen, the five tines sit side by side horizontally.
    const { spacing, depth } = RAKES.rake;
    for (const offset of [-2, -1, 0, 1, 2]) {
      expect(heightAt(field, Math.floor(30.5 + offset * spacing), 30)).toBeLessThan(-depth / 2);
    }
  });
});

describe("smoothSand", () => {
  it("levels the sand, leaving only faint unevenness", () => {
    const field = flatField();
    carveSegment(field, RAKES.wide, { x: 0, y: 20 }, { x: 60, y: 20 }, right);
    smoothSand(field);
    expect(field.data.every((h) => Math.abs(h) < 0.05)).toBe(true);
  });
});
