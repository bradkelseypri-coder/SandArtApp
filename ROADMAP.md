# Roadmap

The core experience is a **zen garden**: raking patterns into lit sand.
Photo tracing and auto-drawn patterns build on the same engine.

## ✅ Phase 0 – Foundation

- Fresh Expo (SDK 57) + TypeScript + Expo Router project
- Height-field sand engine: rake carving, lighting, grain (`src/garden/`)
- Skia renderer with dirty-region updates, at most one redraw per frame
- Garden screen with stick / rake / wide rake tools, Smooth, and haptics
- Jest unit tests, typecheck and lint

## Phase 1 – Feel

- Try it on real devices and tune groove depth, lighting and rake spacing
- Animated smoothing: sweep the sand level instead of resetting instantly
- Undo for the last stroke
- Rocks and objects you can place, with the sand raked around them
- Quiet ambient sound and soft rake sounds, with a mute toggle
- Move the lighting into a Skia shader so the sand renders at full screen
  resolution, if real devices show the 200-cell image looks soft

## Phase 2 – Patterns that draw themselves

- A path player that drives the rake along a list of points, with
  play / pause / speed controls
- Built-in patterns: concentric circles, spirals, waves, ripples around rocks,
  mandalas
- Calm "watch mode" that slowly draws patterns one after another

## Phase 3 – Trace a photo

- Pick a photo (`expo-image-picker`) and read its pixels through Skia
- Shrink it, find its edges, and simplify them into rake paths
- Play the paths back with the Phase 2 player so the photo is raked into the sand

## Phase 4 – Keep and share

- Save gardens: the height field compresses well
- Export an image, or a time-lapse video of the drawing
- Gallery of saved gardens

## Later / open questions

- Optional "sand bottle" mode with coloured layers that flow when you tilt
  the phone (a separate falling-sand engine)
- Web support (Skia needs CanvasKit loaded on web)
- App Store / Play Store release, and whether to monetise
