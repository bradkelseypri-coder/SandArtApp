import { SandTable, type RGB } from "./engine/sand.ts";
import { SandRenderer } from "./engine/render.ts";
import { Marble, PathFollower, type Point } from "./engine/marble.ts";
import { PATTERNS, buildPattern, type PatternId } from "./engine/patterns.ts";
import { traceImage, toPlanes } from "./engine/imageTrace.ts";
import { SandSound } from "./engine/audio.ts";

declare const __EMBEDDED__: boolean;

type Tool = "marble" | "rake" | "smooth" | "pour";

const SAND_COLOURS: { name: string; hex: string }[] = [
  { name: "Natural", hex: "#d8c39c" },
  { name: "White", hex: "#eee8da" },
  { name: "Charcoal", hex: "#4b4845" },
  { name: "Terracotta", hex: "#bd6c48" },
  { name: "Rose", hex: "#d79aa2" },
  { name: "Ochre", hex: "#d4a53f" },
  { name: "Moss", hex: "#87985a" },
  { name: "Lagoon", hex: "#4ea1a3" },
  { name: "Indigo", hex: "#4d5c99" },
];

const HINTS: Record<Tool, string> = {
  marble: "Pick a pattern, or drag on the sand and the magnet pulls the marble after you.",
  rake: "Drag slowly across the sand. The rake turns to follow your hand.",
  smooth: "Rub the sand to pat it flat.",
  pour: "Hold to pour coloured sand. Rake or roll through it to blend.",
};

const CELLS = 190_000; // sand grid size, split to match the tray's shape
const MARBLE_RADIUS = 4;
const BASE_SPEED = 85; // cells per second

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>("sand");
const ctx = canvas.getContext("2d")!;
const stage = $("stage");
const statusEl = $("status");
const playBtn = $<HTMLButtonElement>("btn-play");

function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// ---------- the table ----------

const stageBox = stage.getBoundingClientRect();
const aspect = Math.min(2.2, Math.max(0.45, (stageBox.width - 18) / Math.max(120, stageBox.height - 18)));
const GW = Math.round(Math.sqrt(CELLS * aspect));
const GH = Math.round(GW / aspect);

const table = new SandTable(GW, GH, hexToRgb(SAND_COLOURS[0].hex));
const renderer = new SandRenderer(table);
const marble = new Marble(GW / 2, GH / 2, MARBLE_RADIUS);
const sound = new SandSound();

let tool: Tool = "marble";
let follower: PathFollower | null = null;
let route: Point[] = []; // the pattern as chosen, before the run-in from the marble
let playing = false;
let showPreview = false;
let levelling = false;
let needsDraw = true;
let scale = 1; // canvas pixels per sand cell

let pourColour: RGB = hexToRgb(SAND_COLOURS[7].hex);
let tines = 5;

type Picture = { planes: Float32Array[]; w: number; h: number; source: HTMLCanvasElement };
let picture: Picture | null = null;

function setStatus(text?: string) {
  statusEl.textContent = text ?? HINTS[tool];
}

// ---------- routes for the marble ----------

function setRoute(points: Point[], autoplay: boolean) {
  route = points;
  // the marble can't jump: it rolls from where it is to the start of the route
  follower = new PathFollower([{ x: marble.x, y: marble.y }, ...points]);
  playing = autoplay && points.length > 1;
  showPreview = !playing;
  needsDraw = true;
  updatePlayButton();
}

function updatePlayButton() {
  playBtn.textContent = playing ? "Pause" : follower && !follower.done && follower.travelled > 0 ? "Resume" : "Trace";
  playBtn.disabled = route.length < 2;
}

function choosePattern(id: PatternId | "image", autoplay = true) {
  for (const chip of document.querySelectorAll<HTMLElement>("#pattern-chips [data-pattern]")) {
    chip.setAttribute("aria-pressed", String(chip.dataset.pattern === id));
  }
  const isImage = id === "image";
  $("detail-field").hidden = !isImage;
  $("btn-tint").hidden = !isImage;
  if (isImage) {
    traceCurrentPicture();
  } else {
    setRoute(buildPattern(id, GW, GH, MARBLE_RADIUS * 3, MARBLE_RADIUS * 3), autoplay);
    setStatus();
  }
}

/** Where the uploaded picture sits on the tray: centred, as large as fits. */
function pictureRect(p: { w: number; h: number }) {
  const margin = MARBLE_RADIUS * 3;
  const s = Math.min((GW - 2 * margin) / p.w, (GH - 2 * margin) / p.h);
  return { s, x: (GW - p.w * s) / 2, y: (GH - p.h * s) / 2 };
}

function traceCurrentPicture() {
  if (!picture) return;
  const detail = Number($<HTMLInputElement>("detail").value);
  const pts = traceImage(picture.planes, picture.w, picture.h, detail);
  const r = pictureRect(picture);
  setRoute(
    pts.map((p) => ({ x: r.x + (p.x + 0.5) * r.s, y: r.y + (p.y + 0.5) * r.s })),
    false,
  );
  if (pts.length < 2) {
    setStatus("No clear outlines found in this picture. Raise Detail, or try one with stronger contrast.");
  } else {
    const secs = Math.round(follower!.total / (BASE_SPEED * speed()));
    setStatus(`This is the line the marble will follow, about ${formatTime(secs)}. Adjust Detail, then press Trace.`);
  }
}

function formatTime(secs: number) {
  return secs < 90 ? `${Math.max(5, Math.round(secs / 5) * 5)} seconds` : `${Math.round(secs / 60)} minutes`;
}

async function loadPicture(file: File) {
  setStatus("Reading your picture…");
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    if (!iw || !ih) throw new Error("empty image");
    const draw = (max: number) => {
      const s = Math.min(1, max / Math.max(iw, ih));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(iw * s));
      c.height = Math.max(1, Math.round(ih * s));
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      return c;
    };
    // outlines are found on a small copy: finer detail than the marble's groove would be lost anyway
    const small = draw(210);
    const data = small.getContext("2d")!.getImageData(0, 0, small.width, small.height).data;
    picture = { planes: toPlanes(data, small.width, small.height), w: small.width, h: small.height, source: draw(800) };

    let chip = document.querySelector<HTMLElement>('#pattern-chips [data-pattern="image"]');
    if (!chip) {
      chip = makeChip("image", "Your image");
      $("pattern-chips").insertBefore(chip, $("pattern-chips").firstChild);
    }
    choosePattern("image");
  } catch {
    setStatus("That file couldn't be read as a picture. Try a JPG or PNG.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

function tintFromPicture() {
  if (!picture) return;
  const c = document.createElement("canvas");
  c.width = GW;
  c.height = GH;
  const g = c.getContext("2d")!;
  const r = pictureRect(picture);
  g.drawImage(picture.source, r.x, r.y, picture.w * r.s, picture.h * r.s);
  table.tint(g.getImageData(0, 0, GW, GH).data, 0.85);
  setStatus("The sand has taken the picture's colours. Press Trace to draw its outlines through them.");
}

function speed() {
  return Number($<HTMLInputElement>("speed").value);
}

// ---------- pointer tools ----------

let dragging = false;
let last: Point = { x: 0, y: 0 };
let pointer: Point = { x: 0, y: 0 };
let dir: Point = { x: 0, y: 0 }; // smoothed direction of the rake stroke
let strokeLen = 0;
let toolSpeed = 0; // cells moved by a hand tool this frame

function toGrid(e: PointerEvent): Point {
  const r = canvas.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * GW, y: ((e.clientY - r.top) / r.height) * GH };
}

canvas.addEventListener("pointerdown", (e) => {
  if (e.button !== 0 && e.pointerType === "mouse") return;
  sound.unlock();
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch {}
  dragging = true;
  last = pointer = toGrid(e);
  dir = { x: 0, y: 0 };
  strokeLen = 0;
  if (tool === "marble") {
    // the finger takes over the magnet
    if (playing) {
      playing = false;
      updatePlayButton();
    }
    showPreview = false;
    marble.pull = 150;
    marble.tx = pointer.x;
    marble.ty = pointer.y;
  }
  needsDraw = true;
  e.preventDefault();
});

canvas.addEventListener("pointermove", (e) => {
  if (!dragging) return;
  const p = toGrid(e);
  pointer = p;
  const dx = p.x - last.x;
  const dy = p.y - last.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 0.5) return;
  needsDraw = true;

  if (tool === "marble") {
    marble.tx = p.x;
    marble.ty = p.y;
    last = p;
    return;
  }
  toolSpeed += dist;
  strokeLen += dist;

  if (tool === "rake") {
    const gap = Number($<HTMLInputElement>("rake-gap").value);
    const n = Math.ceil(dist / 0.9);
    for (let i = 1; i <= n; i++) {
      // turn the rake head gradually, like a real one dragged through sand
      const ux = dx / dist;
      const uy = dy / dist;
      const blend = dir.x === 0 && dir.y === 0 ? 1 : 0.06;
      let nx = dir.x + (ux - dir.x) * blend;
      let ny = dir.y + (uy - dir.y) * blend;
      const nl = Math.hypot(nx, ny) || 1;
      dir = { x: nx / nl, y: ny / nl };
      const cx = last.x + (dx * i) / n;
      const cy = last.y + (dy * i) / n;
      for (let t = 0; t < tines; t++) {
        const off = (t - (tines - 1) / 2) * gap;
        table.carve(cx - dir.y * off, cy + dir.x * off, 1.7, 1.25, dir.x, dir.y);
      }
    }
  } else if (tool === "smooth") {
    const size = Number($<HTMLInputElement>("smooth-size").value);
    const n = Math.ceil(dist / (size / 4));
    for (let i = 1; i <= n; i++) table.smooth(last.x + (dx * i) / n, last.y + (dy * i) / n, size, 0.3);
  } else if (tool === "pour") {
    const size = Number($<HTMLInputElement>("pour-size").value);
    const n = Math.ceil(dist / (size / 3));
    for (let i = 1; i <= n; i++) table.pour(last.x + (dx * i) / n, last.y + (dy * i) / n, size, pourColour, 0.35);
  }
  last = p;
});

function endDrag() {
  if (!dragging) return;
  dragging = false;
  needsDraw = true;
}
canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);

// ---------- drawing ----------

function resize() {
  const box = stage.getBoundingClientRect();
  const availW = box.width - 18;
  const availH = box.height - 18;
  if (availW < 20 || availH < 20) return;
  const s = Math.min(availW / GW, availH / GH);
  const cssW = Math.floor(GW * s);
  const cssH = Math.floor(GH * s);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  scale = canvas.width / GW;
  needsDraw = true;
}

function draw() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(renderer.canvas, 0, 0, canvas.width, canvas.height);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);

  if (showPreview && route.length > 1) {
    ctx.beginPath();
    ctx.moveTo(route[0].x, route[0].y);
    for (let i = 1; i < route.length; i++) ctx.lineTo(route[i].x, route[i].y);
    ctx.lineWidth = 1.1;
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(45, 30, 18, 0.5)";
    ctx.stroke();
  }

  if (dragging && tool === "rake" && (dir.x !== 0 || dir.y !== 0)) drawRake();
  drawMarble();
}

function drawRake() {
  const gap = Number($<HTMLInputElement>("rake-gap").value);
  const half = ((tines - 1) / 2) * gap;
  const px = -dir.y;
  const py = dir.x;
  // head sits just behind the tines' contact line
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(20, 12, 6, 0.35)";
  ctx.lineWidth = 4.5;
  ctx.beginPath();
  ctx.moveTo(last.x - px * (half + 2) + 1.5, last.y - py * (half + 2) + 2.5);
  ctx.lineTo(last.x + px * (half + 2) + 1.5, last.y + py * (half + 2) + 2.5);
  ctx.stroke();
  ctx.strokeStyle = "#8a6a4a";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(last.x - px * (half + 2), last.y - py * (half + 2));
  ctx.lineTo(last.x + px * (half + 2), last.y + py * (half + 2));
  ctx.stroke();
  ctx.fillStyle = "#3a2a1c";
  for (let t = 0; t < tines; t++) {
    const off = (t - (tines - 1) / 2) * gap;
    ctx.beginPath();
    ctx.arc(last.x + px * off, last.y + py * off, 1.1, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawMarble() {
  const r = marble.radius * 1.35;
  const { x, y } = marble;
  // shadow, thrown down and to the right like the grooves'
  const sh = ctx.createRadialGradient(x + r * 0.35, y + r * 0.45, r * 0.2, x + r * 0.35, y + r * 0.45, r * 1.35);
  sh.addColorStop(0, "rgba(20, 12, 5, 0.55)");
  sh.addColorStop(1, "rgba(20, 12, 5, 0)");
  ctx.fillStyle = sh;
  ctx.beginPath();
  ctx.arc(x + r * 0.35, y + r * 0.45, r * 1.35, 0, Math.PI * 2);
  ctx.fill();
  // polished steel
  const g = ctx.createRadialGradient(x - r * 0.38, y - r * 0.42, r * 0.05, x - r * 0.1, y - r * 0.1, r * 1.05);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(0.18, "#e4e8ec");
  g.addColorStop(0.55, "#8d959c");
  g.addColorStop(0.85, "#454b51");
  g.addColorStop(1, "#2a2e32");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  // the sand reflected in its underside
  const c = Math.floor(marble.y) * GW + Math.floor(marble.x);
  const cr = table.color[c * 3] | 0;
  const cg = table.color[c * 3 + 1] | 0;
  const cb = table.color[c * 3 + 2] | 0;
  const refl = ctx.createRadialGradient(x + r * 0.2, y + r * 0.55, 0, x + r * 0.2, y + r * 0.55, r * 0.7);
  refl.addColorStop(0, `rgba(${cr}, ${cg}, ${cb}, 0.55)`);
  refl.addColorStop(1, `rgba(${cr}, ${cg}, ${cb}, 0)`);
  ctx.fillStyle = refl;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

// ---------- the loop ----------

function advance(dt: number) {
  if (playing && follower) {
    marble.pull = 900;
    const target = follower.advance(BASE_SPEED * speed() * dt);
    marble.tx = target.x;
    marble.ty = target.y;
    if (follower.done && marble.speed < 1.5) {
      playing = false;
      updatePlayButton();
      if (tool === "marble") setStatus("Finished. Level the sand and trace again, or rake through it.");
    }
  }
  marble.step(dt, table);
}

let lastTime = performance.now();
let activity = 0;

function frame(now: number) {
  const dt = Math.min(0.034, Math.max(0.001, (now - lastTime) / 1000));
  lastTime = now;

  advance(dt);

  if (dragging && tool === "pour") {
    // keep pouring while the hand holds still
    table.pour(pointer.x, pointer.y, Number($<HTMLInputElement>("pour-size").value), pourColour, 0.12);
    toolSpeed += 0.6;
  }
  if (levelling) {
    levelling = table.settle(0.86);
    if (!levelling) marble.rest(table);
  }

  const moving = marble.speed > 0.05;
  const level = Math.max(marble.speed / 110, toolSpeed / dt / 260, levelling ? 0.5 : 0);
  activity += (Math.min(1, level) - activity) * 0.25;
  sound.setLevel(activity);
  toolSpeed = 0;

  if (renderer.update() || moving || needsDraw) {
    draw();
    needsDraw = dragging;
  }
  requestAnimationFrame(frame);
}

// ---------- controls ----------

function makeChip(id: string, label: string) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "chip";
  b.dataset.pattern = id;
  b.textContent = label;
  b.setAttribute("aria-pressed", "false");
  b.addEventListener("click", () => {
    sound.unlock();
    choosePattern(id as PatternId | "image");
  });
  return b;
}

const chips = $("pattern-chips");
const uploadChip = chips.firstElementChild!;
for (const p of PATTERNS) chips.insertBefore(makeChip(p.id, p.label), uploadChip);

$<HTMLInputElement>("file-image").addEventListener("change", (e) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) loadPicture(file);
  input.value = "";
});

let detailTimer = 0;
$("detail").addEventListener("input", () => {
  clearTimeout(detailTimer);
  detailTimer = window.setTimeout(traceCurrentPicture, 120);
});
$("btn-tint").addEventListener("click", tintFromPicture);

playBtn.addEventListener("click", () => {
  sound.unlock();
  if (playing) {
    playing = false;
  } else {
    if (!follower || follower.done) setRoute(route, true);
    playing = true;
    showPreview = false;
    setStatus();
  }
  needsDraw = true;
  updatePlayButton();
});

for (const b of document.querySelectorAll<HTMLButtonElement>(".tools button")) {
  b.addEventListener("click", () => {
    tool = b.dataset.tool as Tool;
    for (const o of document.querySelectorAll<HTMLButtonElement>(".tools button")) {
      o.setAttribute("aria-pressed", String(o === b));
    }
    for (const t of ["marble", "rake", "smooth", "pour"]) $(`panel-${t}`).hidden = t !== tool;
    setStatus();
    resize();
  });
}

for (const b of document.querySelectorAll<HTMLButtonElement>("#tines button")) {
  b.addEventListener("click", () => {
    tines = Number(b.dataset.tines);
    for (const o of document.querySelectorAll("#tines button")) o.setAttribute("aria-pressed", String(o === b));
  });
}

const swatches = $("swatches");
const customLabel = swatches.firstElementChild as HTMLElement;
function pickColour(hex: string, el: HTMLElement) {
  pourColour = hexToRgb(hex);
  for (const o of swatches.querySelectorAll(".swatch")) o.setAttribute("aria-pressed", String(o === el));
}
for (const c of SAND_COLOURS) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "swatch";
  b.style.background = c.hex;
  b.title = c.name;
  b.setAttribute("aria-label", `${c.name} sand`);
  b.setAttribute("aria-pressed", String(c.hex === SAND_COLOURS[7].hex));
  b.addEventListener("click", () => pickColour(c.hex, b));
  swatches.insertBefore(b, customLabel);
}
const customInput = $<HTMLInputElement>("custom-color");
customInput.addEventListener("input", () => pickColour(customInput.value, customLabel));
customInput.addEventListener("click", () => pickColour(customInput.value, customLabel));

$("btn-fill").addEventListener("click", () => {
  table.fill(pourColour);
  setStatus("The whole tray is this colour now. Its grooves are untouched.");
});

$("btn-level").addEventListener("click", () => {
  sound.unlock();
  levelling = true;
  if (follower && !follower.done && !playing) showPreview = true;
});

const soundBtn = $("btn-sound");
soundBtn.addEventListener("click", () => {
  sound.enabled = !sound.enabled;
  soundBtn.setAttribute("aria-pressed", String(sound.enabled));
  soundBtn.textContent = sound.enabled ? "Sound on" : "Sound off";
  if (sound.enabled) sound.unlock();
});

const saveBtn = $("btn-save");
if (__EMBEDDED__) {
  // hosts that sandbox the page block downloads, so don't offer one
  saveBtn.hidden = true;
} else {
  saveBtn.addEventListener("click", () => {
    draw();
    canvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "sand-table.png";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }, "image/png");
  });
}

// ---------- start ----------

new ResizeObserver(resize).observe(stage);
resize();
marble.rest(table);

// Open on a table already in progress rather than blank sand.
const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
choosePattern("petals");
const headStart = follower!.total * (calm ? 1 : 0.3);
while (follower!.travelled < headStart && !follower!.done) advance(1 / 60);
if (calm) {
  for (let i = 0; i < 60; i++) advance(1 / 60);
  playing = false;
  updatePlayButton();
}
setStatus();
requestAnimationFrame(frame);
