import { test } from "node:test";
import assert from "node:assert/strict";
import { SandTable } from "../src/engine/sand.ts";
import { Marble, PathFollower } from "../src/engine/marble.ts";
import { PATTERNS, buildPattern } from "../src/engine/patterns.ts";
import { traceImage, findEdgeChains } from "../src/engine/imageTrace.ts";

const sum = (a: Float32Array) => a.reduce((s, v) => s + v, 0);

test("carving moves sand aside without creating or losing any", () => {
  const t = new SandTable(120, 120, [200, 180, 140]);
  for (let x = 30; x < 90; x += 0.8) t.carve(x, 60, 4, 1.8, 1, 0);
  assert.ok(Math.abs(sum(t.height)) < 0.5, `net volume ${sum(t.height)}`);
  assert.ok(t.height[60 * 120 + 60] < -1, "groove under the path");
  assert.ok(t.height[66 * 120 + 60] > 0.2, "ridge beside the path");
});

test("carried sand keeps its colour", () => {
  const t = new SandTable(80, 80, [200, 200, 200]);
  t.pour(40, 40, 6, [20, 20, 220], 1);
  for (let x = 30; x < 60; x += 0.8) t.carve(x, 40, 4, 1.8, 1, 0);
  // blue sand has been pushed out beside the groove, beyond where it was poured
  const i = 47 * 80 + 41;
  assert.ok(t.color[i * 3 + 2] - t.color[i * 3] > 15, "ridge beside the groove is tinted blue");
});

test("levelling ends with flat sand", () => {
  const t = new SandTable(40, 40, [200, 180, 140]);
  t.carve(20, 20, 4, 1.8);
  let steps = 0;
  while (t.settle(0.86)) steps++;
  assert.ok(steps > 3 && steps < 80);
  assert.equal(Math.max(...t.height), 0);
});

test("the marble follows its magnet along a route and stays in the tray", () => {
  const t = new SandTable(200, 300, [200, 180, 140]);
  const m = new Marble(100, 150, 4);
  for (const { id } of PATTERNS) {
    const pts = buildPattern(id, t.w, t.h, 12, 12);
    assert.ok(pts.length > 100, id);
    for (const p of pts) {
      assert.ok(p.x >= 4 && p.x <= t.w - 5 && p.y >= 4 && p.y <= t.h - 5, `${id} leaves the tray`);
    }
  }
  const f = new PathFollower(buildPattern("spiral", t.w, t.h, 12, 12));
  let worst = 0;
  while (!f.done) {
    const p = f.advance(85 / 60);
    m.tx = p.x;
    m.ty = p.y;
    m.step(1 / 60, t);
    if (f.travelled > 60) worst = Math.max(worst, Math.hypot(m.x - p.x, m.y - p.y));
  }
  assert.ok(worst < 6, `marble lagged ${worst} cells behind the magnet`);
});

test("a picture of a dark square is traced around its outline as one line", () => {
  const w = 100;
  const h = 80;
  const gray = new Float32Array(w * h).fill(1);
  for (let y = 20; y < 60; y++) for (let x = 30; x < 70; x++) gray[y * w + x] = 0.1;
  const chains = findEdgeChains(gray, w, h, 0.5);
  assert.ok(chains.length >= 1 && chains.length <= 4, `${chains.length} chains`);
  const path = traceImage(gray, w, h, 0.5);
  assert.ok(path.length > 8);
  for (const p of path) {
    const onEdge =
      (Math.abs(p.x - 29.5) < 3 || Math.abs(p.x - 69.5) < 3 || Math.abs(p.y - 19.5) < 3 || Math.abs(p.y - 59.5) < 3) &&
      p.x > 26 && p.x < 73 && p.y > 16 && p.y < 63;
    assert.ok(onEdge, `point ${p.x},${p.y} is off the outline`);
  }
});

test("areas that differ in hue but not brightness still get an outline", () => {
  const w = 60;
  const h = 60;
  const r = new Float32Array(w * h).fill(0.2);
  const g = new Float32Array(w * h).fill(0.5);
  const b = new Float32Array(w * h).fill(0.8);
  for (let y = 20; y < 40; y++) for (let x = 20; x < 40; x++) (r[y * w + x] = 0.8), (b[y * w + x] = 0.2);
  assert.ok(traceImage([r, g, b], w, h, 0.5).length > 8);
});

test("a blank picture gives no route", () => {
  assert.equal(traceImage(new Float32Array(50 * 50).fill(0.5), 50, 50, 0.5).length, 0);
});
