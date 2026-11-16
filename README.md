# Sand Table

A calming sand tray for the browser. A steel marble, pulled by a magnet under the
table, rolls through the sand and draws as it goes. You can also rake, smooth and
pour coloured sand by hand.

## What you can do

- **Marble playlist** – add patterns (Petals, Spiral, Rose, Garden lines, Orbit) and
  your own images to a playlist of up to eight. The marble draws each in turn, lets
  it rest a few seconds, then makes a clearing pass (a square spiral from the wall
  inward that sweeps the sand flat and back to its plain colour) before starting the
  next. *Repeat* loops the list so you can leave it running; *Next* skips ahead.
  Drag on the sand to take the magnet yourself.
- **Upload image** – the outlines of your picture are found and joined into a single
  route, shown as a preview line. Tap a playlist entry to see its line; for images
  you can adjust *Detail* and switch on *Use image colours* to dye the sand with the
  picture before it is drawn.
- **Rake** – drag a 3 to 9 tine rake through the sand, with adjustable spacing and
  tine size. The head turns to follow your hand, like a real one.
- **Smooth** – rub the sand flat with your hand. *Level sand* flattens the whole tray.
- **Pour** – pour coloured sand (nine sand colours or any colour you pick), or fill
  the whole tray. The marble and the rake push colour into their ridges and streak
  it along their grooves, more with every pass. *Reset colour* returns all the sand
  to natural.
- A soft sand sound follows how fast things move. *Save picture* downloads a PNG.

## Run it

```bash
npm install
```

```bash
npm start
```

Then open http://localhost:5173. `npm run build` writes a single self-contained
`dist/index.html` you can host anywhere or open straight from disk.

```bash
npm test
```

```bash
npm run typecheck
```

## How it works

| File | Role |
| --- | --- |
| `src/engine/sand.ts` | The sand bed: a height field plus a colour per cell. Pressing something in scoops sand out and piles it in ridges ahead and beside, carrying colour with it. |
| `src/engine/render.ts` | Shades the bed with low light from the top-left and a fixed grain; redraws only what changed. |
| `src/engine/marble.ts` | The marble on a damped spring to its magnet, and the follower that moves the magnet along a route. |
| `src/engine/patterns.ts` | The built-in routes and the clearing route. |
| `src/engine/imageTrace.ts` | Picture to route: colour-aware edge detection, thinning, chaining, nearest-first ordering, smoothing. |
| `src/engine/audio.ts` | The sand sound. |
| `src/main.ts`, `src/app.html`, `src/styles.css` | Controls, pointer tools and the frame loop. |

The engine files have no browser dependencies apart from `render.ts` and `audio.ts`,
so they can be reused behind a native canvas later.
