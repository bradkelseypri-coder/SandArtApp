import { SandTable, type RGB } from "./engine/sand.ts";
import { SandRenderer } from "./engine/render.ts";
import { Marble, PathFollower, type Point } from "./engine/marble.ts";
import { PATTERNS, buildPattern, buildWipe, type PatternId } from "./engine/patterns.ts";
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
  marble: "Add patterns or images to the playlist. The marble clears the sand before each one.",
  rake: "Drag slowly across the sand. The rake turns to follow your hand.",
  smooth: "Rub the sand to pat it flat.",
  pour: "Hold to pour coloured sand. Rake or roll through it to blend.",
};

const CELLS = 190_000; // sand grid size, split to match the tray's shape
const MARBLE_RADIUS = 4;
const BASE_SPEED = 85; // cells per second
const WIPE_SPEED = 320; // the clearing pass is brisk
const HOLD_SECONDS = 6; // a finished drawing rests this long before it is cleared
const MAX_ITEMS = 8;

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
let levelling = false;
let needsDraw = true;
let scale = 1; // canvas pixels per sand cell

let baseColour: RGB = hexToRgb(SAND_COLOURS[0].hex); // what the clearing pass returns the sand to
let pourColour: RGB = hexToRgb(SAND_COLOURS[7].hex);
let tines = 5;

// ---------- the playlist ----------
// The marble works through a list of patterns and pictures. Before each one it
// makes a clearing pass, so every drawing starts on clean sand.

type Picture = { planes: Float32Array[]; w: number; h: number; source: HTMLCanvasElement };
type Item = {
  label: string;
  kind: PatternId | "image";
  route: Point[];
  picture?: Picture;
  detail: number;
  tint: boolean;
};
type Phase = "idle" | "wipe" | "draw" | "hold";

const playlist: Item[] = [];
let cur = -1; // the item being drawn, or just drawn
let selected: Item | null = null; // the item whose route is previewed and whose settings show
let phase: Phase = "idle";
let playing = false;
let repeat = true;
let holdLeft = 0;
let reliefDirty = false; // grooves on the sand
let colourDirty = false; // colour on the sand
let imageCount = 0;

function setStatus(text?: string) {
  statusEl.textContent = text ?? (tool === "marble" ? playlistStatus() : HINTS[tool]);
}

function playlistStatus() {
  const item = playlist[cur];
  if (!item || phase === "idle") return HINTS.marble;
  const next = playlist.length > 1 ? playlist[(cur + 1) % playlist.length] : null;
  const after = next && (repeat || cur + 1 < playlist.length) ? next.label : null;
  if (phase === "wipe") return `Clearing the sand for ${item.label}.`;
  if (phase === "hold") return after ? `${item.label} is finished. ${after} is next.` : `${item.label} is finished.`;
  return after ? `Drawing ${item.label}. Next: ${after}.` : `Drawing ${item.label}.`;
}

function speed() {
  return Number($<HTMLInputElement>("speed").value);
}

function fromMarble(points: Point[]) {
  // the marble can't jump: it rolls from where it is to the start of the route
  return new PathFollower([{ x: marble.x, y: marble.y }, ...points]);
}

function startItem(i: number) {
  cur = i;
  if (selected === playlist[i]) selected = null;
  playing = true;
  if (reliefDirty || colourDirty) {
    phase = "wipe";
    follower = fromMarble(buildWipe(GW, GH, MARBLE_RADIUS + 2, marble.wipeRadius * 1.1));
  } else {
    beginDraw();
  }
  refreshPlaylist();
}

function beginDraw() {
  const item = playlist[cur];
  if (item.tint && item.picture) {
    tintFromPicture(item.picture);
    colourDirty = true;
  }
  reliefDirty = true;
  phase = "draw";
  follower = fromMarble(item.route);
}

/** Move on to the following item. `wrap` goes back to the first after the last. */
function nextItem(wrap: boolean) {
  if (playlist.length === 0) return stopPlaylist();
  let n = cur + 1;
  if (n >= playlist.length) {
    if (!wrap) return stopPlaylist();
    n = 0;
  }
  startItem(n);
}

function stopPlaylist() {
  phase = "idle";
  playing = false;
  follower = null;
  refreshPlaylist();
}

function addItem(item: Item) {
  if (playlist.length >= MAX_ITEMS) {
    setStatus(`The playlist holds ${MAX_ITEMS}. Remove one to add another.`);
    return false;
  }
  playlist.push(item);
  return true;
}

function removeItem(item: Item) {
  const i = playlist.indexOf(item);
  if (i < 0) return;
  playlist.splice(i, 1);
  if (selected === item) selected = null;
  if (i < cur) {
    cur--;
  } else if (i === cur) {
    cur--;
    if (phase !== "idle" && playing) return nextItem(repeat);
    phase = "idle";
    follower = null;
  }
  refreshPlaylist();
}

function selectItem(item: Item | null) {
  selected = selected === item ? null : item;
  refreshPlaylist();
  if (selected && selected.kind === "image") describeTrace(selected);
}

function refreshPlaylist() {
  const box = $("playlist");
  box.textContent = "";
  playlist.forEach((item, i) => {
    const el = document.createElement("span");
    el.className = "item" + (item === selected ? " selected" : "");
    el.setAttribute("role", "listitem");
    if (i === cur && phase !== "idle") el.setAttribute("aria-current", "true");
    const name = document.createElement("button");
    name.type = "button";
    name.textContent = item.label;
    name.title = "Show the line the marble will follow";
    name.addEventListener("click", () => selectItem(item));
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove";
    remove.textContent = "\u00d7";
    remove.setAttribute("aria-label", `Remove ${item.label}`);
    remove.addEventListener("click", () => removeItem(item));
    el.append(name, remove);
    box.append(el);
  });
  if (playlist.length === 0) {
    const empty = document.createElement("span");
    empty.className = "label";
    empty.textContent = "Empty. Add a pattern or upload an image.";
    box.append(empty);
  }
  const isImage = selected?.kind === "image";
  $("detail-field").hidden = !isImage;
  $("btn-tint").hidden = !isImage;
  if (isImage) {
    $<HTMLInputElement>("detail").value = String(selected!.detail);
    $("btn-tint").setAttribute("aria-pressed", String(selected!.tint));
  }
  playBtn.textContent = playing ? "Pause" : phase === "idle" ? "Play" : "Resume";
  playBtn.disabled = playlist.length === 0;
  $<HTMLButtonElement>("btn-next").disabled = playlist.length === 0;
  needsDraw = true;
  setStatus();
}

function addPattern(id: PatternId) {
  const label = PATTERNS.find((p) => p.id === id)!.label;
  const item: Item = {
    label,
    kind: id,
    route: buildPattern(id, GW, GH, MARBLE_RADIUS * 3, MARBLE_RADIUS * 3),
    detail: 0,
    tint: false,
  };
  if (!addItem(item)) return;
  if (phase === "idle") {
    startItem(playlist.length - 1);
  } else {
    refreshPlaylist();
    setStatus(`${label} added. It plays after ${playlist[playlist.length - 2].label}.`);
  }
}

/** Where an uploaded picture sits on the tray: centred, as large as fits. */
function pictureRect(p: { w: number; h: number }) {
  const margin = MARBLE_RADIUS * 3;
  const s = Math.min((GW - 2 * margin) / p.w, (GH - 2 * margin) / p.h);
  return { s, x: (GW - p.w * s) / 2, y: (GH - p.h * s) / 2 };
}

function traceItem(item: Item) {
  const pic = item.picture!;
  const r = pictureRect(pic);
  item.route = traceImage(pic.planes, pic.w, pic.h, item.detail).map((p) => ({
    x: r.x + (p.x + 0.5) * r.s,
    y: r.y + (p.y + 0.5) * r.s,
  }));
}

function describeTrace(item: Item) {
  if (item.route.length < 2) {
    setStatus("No clear outlines found in this picture. Raise Detail, or try one with stronger contrast.");
    return;
  }
  let len = 0;
  for (let i = 1; i < item.route.length; i++) {
    len += Math.hypot(item.route[i].x - item.route[i - 1].x, item.route[i].y - item.route[i - 1].y);
  }
  const when = phase === "idle" ? "Press Play to draw it." : "It plays when its turn comes.";
  setStatus(`This is the line the marble will follow, about ${formatTime(len / (BASE_SPEED * speed()))}. ${when}`);
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
    const item: Item = {
      label: `Image ${imageCount + 1}`,
      kind: "image",
      route: [],
      picture: { planes: toPlanes(data, small.width, small.height), w: small.width, h: small.height, source: draw(800) },
      detail: 0.5,
      tint: false,
    };
    traceItem(item);
    if (!addItem(item)) return;
    imageCount++;
    selected = item;
    refreshPlaylist();
    describeTrace(item);
  } catch {
    setStatus("That file couldn't be read as a picture. Try a JPG or PNG.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

function tintFromPicture(pic: Picture) {
  const c = document.createElement("canvas");
  c.width = GW;
  c.height = GH;
  const g = c.getContext("2d")!;
  const r = pictureRect(pic);
  g.drawImage(pic.source, r.x, r.y, pic.w * r.s, pic.h * r.s);
  table.tint(g.getImageData(0, 0, GW, GH).data, 0.85);
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
      refreshPlaylist();
    }
    marble.mode = "draw";
    marble.pull = 150;
    reliefDirty = true;
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
  if (tool === "pour") colourDirty = true;
  else reliefDirty = true;

  if (tool === "rake") {
    const gap = Number($<HTMLInputElement>("rake-gap").value);
    const size = Number($<HTMLInputElement>("tine-size").value);
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
        table.carve(cx - dir.y * off, cy + dir.x * off, size, size * 0.72, dir.x, dir.y);
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

  const route = selected && !(selected === playlist[cur] && phase !== "idle" && phase !== "wipe") ? selected.route : [];
  if (route.length > 1) {
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
    ctx.arc(last.x + px * off, last.y + py * off, Number($<HTMLInputElement>("tine-size").value) * 0.65, 0, Math.PI * 2);
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
  if (playing && phase === "hold") {
    holdLeft -= dt;
    if (holdLeft <= 0) nextItem(repeat);
  } else if (playing && follower) {
    // the run-in to a drawing's first point is made in clearing mode, so it leaves no stray line
    const wiping = phase === "wipe" || follower.segment === 0;
    marble.mode = wiping ? "wipe" : "draw";
    marble.wipeTo = baseColour;
    marble.pull = phase === "wipe" ? 6000 : 900;
    const target = follower.advance((phase === "wipe" ? WIPE_SPEED : BASE_SPEED * speed()) * dt);
    marble.tx = target.x;
    marble.ty = target.y;
    if (follower.done && marble.speed < 1.5) {
      if (phase === "wipe") {
        reliefDirty = colourDirty = false;
        beginDraw();
      } else {
        phase = "hold";
        holdLeft = HOLD_SECONDS;
      }
      refreshPlaylist();
    }
  } else {
    marble.mode = "draw";
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
    colourDirty = true;
    toolSpeed += 0.6;
  }
  if (levelling) {
    levelling = table.settle(0.86);
    if (!levelling) reliefDirty = false;
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

const chips = $("pattern-chips");
const uploadChip = chips.querySelector(".upload")!;
for (const p of PATTERNS) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "chip";
  b.textContent = p.label;
  b.addEventListener("click", () => {
    sound.unlock();
    addPattern(p.id);
  });
  chips.insertBefore(b, uploadChip);
}

$<HTMLInputElement>("file-image").addEventListener("change", (e) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) loadPicture(file);
  input.value = "";
});

let detailTimer = 0;
$("detail").addEventListener("input", () => {
  clearTimeout(detailTimer);
  detailTimer = window.setTimeout(() => {
    if (!selected || selected.kind !== "image") return;
    selected.detail = Number($<HTMLInputElement>("detail").value);
    traceItem(selected);
    needsDraw = true;
    describeTrace(selected);
  }, 120);
});
$("btn-tint").addEventListener("click", () => {
  if (!selected) return;
  selected.tint = !selected.tint;
  $("btn-tint").setAttribute("aria-pressed", String(selected.tint));
  setStatus(
    selected.tint
      ? "The sand will take this picture's colours before the marble draws it."
      : "This picture will be drawn in plain sand.",
  );
});

playBtn.addEventListener("click", () => {
  sound.unlock();
  if (playing) {
    playing = false;
  } else if (phase === "idle") {
    const i = selected ? playlist.indexOf(selected) : -1;
    if (i >= 0) startItem(i);
    else nextItem(true);
    return;
  } else {
    playing = true;
  }
  refreshPlaylist();
});

$("btn-next").addEventListener("click", () => {
  sound.unlock();
  nextItem(true);
});

const repeatBtn = $("btn-repeat");
repeatBtn.addEventListener("click", () => {
  repeat = !repeat;
  repeatBtn.setAttribute("aria-pressed", String(repeat));
  setStatus(repeat ? "The playlist starts over when it reaches the end." : "The playlist stops after its last drawing.");
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
  baseColour = pourColour;
  setStatus("The whole tray is this colour now, and the marble clears back to it.");
});

$("btn-reset-colour").addEventListener("click", () => {
  baseColour = hexToRgb(SAND_COLOURS[0].hex);
  table.fill(baseColour);
  colourDirty = false;
  setStatus("All the sand is back to its natural colour. Its grooves are untouched.");
});

$("btn-level").addEventListener("click", () => {
  sound.unlock();
  levelling = true;
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

// Open on a playlist already in progress rather than blank sand.
const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
for (const id of ["petals", "rose", "garden"] as PatternId[]) {
  const p = PATTERNS.find((q) => q.id === id)!;
  playlist.push({ label: p.label, kind: id, route: buildPattern(id, GW, GH, MARBLE_RADIUS * 3, MARBLE_RADIUS * 3), detail: 0, tint: false });
}
startItem(0);
const headStart = follower!.total * (calm ? 1 : 0.3);
while ((phase as Phase) === "draw" && follower!.travelled < headStart) advance(1 / 60);
if (calm) {
  for (let i = 0; i < 60; i++) advance(1 / 60);
  playing = false;
}
refreshPlaylist();
requestAnimationFrame(frame);
