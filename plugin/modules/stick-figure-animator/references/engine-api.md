# Engine API (src/stickman/)

Coordinates are the video's pixels (1920×1080 by default). Ground line ≈ y 852–862.
Every function is called with the frame number: a scene receives `{ f, from, dur }`, where `f` is the
frame inside the scene. Components are plain functions that take one object and return markup (a
string); SVG ones go into `Stage({ svg })`, HTML ones into `Stage({ html })`.

## Contents
- [How time works](#how-time-works)
- [stick.js: characters](#stickjs-characters)
- [fx.js: text, impacts, camera, helpers](#fxjs-text-impacts-camera-helpers)
- [common.js: stage and layout](#commonjs-stage-and-layout)
- [props.js: objects](#propsjs-objects)
- [Video helpers (per video)](#video-helpers-per-video)

## How time works

No animation library and no registered timeline. `index.html` imports `bindSeek` from `lib/motion.js`
(the Cadence engine's helpers); the engine sends each frame time `t` through the `hf-seek` event, the
page takes `F = Math.round(t × fps)` and replaces the whole frame with `Video(F)` from `src/video.js`.
`Video` finds the scene (`SCENES[i].from ≤ F < SCENES[i+1].from`) and calls it with `f = F − from`.
Nothing survives between frames: any frame can be rendered alone, in any order, by several workers.
Hence: no `Math.random()` (use `random(seed)`), no counters, no `Date`.

## stick.js: characters

**Angles** (degrees): `dir(a) = (sin a, cos a)`, so 0 = down, 90 = right, -90 = left, 180 = up.
Arms are relative to the torso (0 = hanging), forearm/shin relative to the upper limb.
Legs use the vertical reference (leaning the torso does not drag them).

Pose = `{ x, y, lean, head, la1, la2, ra1, ra2, ll1, ll2, rl1, rl2, rot }`
- `x, y` hip position · `lean` torso (>0 right) · `head` tilt · `rot` whole body around the hip (flips/falls).
- `STAND` default pose (x 960, y 760, scale 1). `groundY(scale)` = hip y with feet on the ground.

`P` ready poses (spread them into keys): `stand armsUp cheer pointR pointL shrug think crouch punchR kickR carry hold facepalm sit handshake sad shock`.
With `facing: -1` the figure is mirrored, so `pointR`/`punchR` point the way it faces.

`Actor({ f, keys, color, base?, scale?, facing?, accessory?, face?, label?, mod?, trails?, opacity?, draw?, children?, behind? })`
- `keys` = `[{ f, p: partialPose, e?: easing }]`. **Keys are cumulative**: each key inherits
  values from the previous one. Before the first key the first pose holds; after the last key it holds.
  Default easing `SNAP` (fast with overshoot); `SMOOTH` for arcs/flights; `(t) => t` for linear walks.
  When a key spreads a `P.*` pose and also sets a field the pose has (e.g. `head`), put the spread FIRST:
  `{ ...P.shock, head: -25 }`.
- `base` = starting pose overrides (`{ x, y }`).
- `facing` number or `(f) => 1 | -1` (flip mid-action, e.g. after a backflip).
- `accessory`: `tie scarf tophat crown cap glasses none`. `face`: `none eyes angry sad happy`.
- `label` text above the head (names, countries, "YOU").
- `mod(t, pose) => pose` adds procedural motion: `addPose(p, walkCycle(t))`, `addPose(p, runCycle(t, speed))`,
  `addPose(p, idle(t, seed))` (breathing, keeps idle characters alive).
- `trails` (default true) draws ghost smears when the body moves fast.
- `draw` 0→1 draws the figure stroke by stroke (head, torso, arms, legs), for the "cursor draws the hero" open.
- `children: (j) => svg` gets the joints `j` (`hip neck headC lElbow lHand rElbow rHand lKnee lFoot rKnee rFoot headR`):
  put held objects at `(j.lHand + j.rHand)/2`, a cursor in the hand, etc. `behind: (j) => svg` draws under the body.

`Figure({ pose, … })` is the static version; `solve(pose, scale, facing)` returns joints without drawing
(useful to aim a cursor/prop at a hand before the character exists). `poseAt(f, keys, base)` returns the pose.

## fx.js: text, impacts, camera, helpers

Fonts (local files in `fonts/`, no network): `FONT.comic` (Bangers: impact words, Latin only),
`FONT.title` (Oswald 600/700: titles, labels), `FONT.body` (Inter Tight: sentences). Oswald and Inter
Tight also carry Cyrillic.

Palette `COL`: `paper ink orange blue green red yellow purple grey dollar gold`.
Give each recurring character one colour and keep it all video long (the hero/"you" = orange).

| Function | Use |
|---|---|
| `Slam({ f, at, children, x, y, size, color, font, weight, rotate, out, stroke, spacing })` | word/title that slams in (scale 3.2→1 + blur). `out` fades it. HTML |
| `Caption({ f, at, out, x, y, children, size, bg, color, align })` | pill caption sliding up (sentences, sources, numbers). HTML |
| `Type({ f, at, text, cps, style })` | typewriter. HTML |
| `Burst({ x, y, at, f, size, color, n })` | comic impact star; put it on the contact point at the hit frame. SVG |
| `Dust({ x, y, at, f, spread })` | landing puffs on the ground. SVG |
| `SpeedLines({ f, from, to, dir })` | horizontal speed lines. SVG |
| `Cursor({ x, y, scale, pressed })` | the animator's mouse pointer. SVG |
| `Paper({ tint, ground })` | paper background (Stage uses it by default) |
| `Wipe({ f, dur })` | diagonal black wipe in/out. HTML |
| `shakeAt(f, hits, power, len)` | camera shake offsets (Stage does it for you) |
| `ease(f, a, b, from, to, easing)` | clamped interpolate with a snappy default |
| `interpolate(x, input, output, { easing, extrapolateLeft, extrapolateRight })` | piecewise mapping; extrapolation `"extend"` (default), `"clamp"`, `"identity"` |
| `Easing.bezier(...)`, `Easing.in/out/inOut(Easing.cubic)` | easing curves |
| `random(seed)` | deterministic number in [0, 1) for a seed |
| `countUp(f, a, b, to, from)` + `fmt(n)` | counting numbers with dot thousands separator |
| `esc(text)` · `css(styleObject)` · `fill(style, markup)` | escape text · style object → CSS (numbers become px) · full-frame layer |

## common.js: stage and layout

`Stage({ f, hits, power, svg, html, under, bg, cam })`: one scene = paper + an SVG layer (characters,
props, bursts) + an HTML layer (text) sharing one camera shake. Pass the scene's `f`.
- `hits`: frames where the camera shakes (every big impact); `power` 8 (light) – 30 (huge).
- `cam: { x, y, z }`: pan/zoom the SVG world (x/y = world offset, z = zoom around the centre).
  For a "timeline" of stations place them at x = 960 + i·1920 and pan `cam.x` between them;
  zoom out (`z` 0.33) at the end to show all of them at once.
- `bg` replaces the paper (e.g. `Paper({ tint: "#f3e7cf" })` for a sepia flashback).

| Function | Use |
|---|---|
| `ChapterCard({ f, n, title, sub, dur })` | full-screen chapter card (use as its own scene, `chapter()` in video.js) |
| `Card({ f, at, x, y, w, n, accent, size, out, children })` | numbered card (lists, clauses, lessons); `x` = centre, `y` = top. HTML |
| `Stamp({ f, at, x, y, text, color, size, r })` | rubber stamp (TOP SECRET, TIER 1, FAKE…). HTML |
| `WordBlock({ x, y, r, text, bg, color, size, s })` | word in a box: a *physical* word that falls/bounces/hits. SVG |
| `fall(f, at, y0, y1, dur)` | gravity fall with small bounces → y |
| `Bubble({ x, y, w, h, t, tailX, tailY, children })` | speech bubble (t = 0…1 pop scale) with SVG children |
| `Captions({ f, cues, bottom, size })` | burned-in subtitles from timeline cues, global `f` (`node render.mjs --captions`) |

## props.js: objects

All centred on (0,0); place with `At({ x, y, s, r, o, children })`.
`Barrel({ label })` oil barrel · `Bill({ w, sym, color })` banknote · `GoldBar({ label })` · `Coin({ sym, color, r })` ·
`Shield({ crack: 0-1, color })` · `Missile()` · `Printer({ f })` money printer · `Bank({ label, w })` columns building ·
`Box({ label })` crate · `Ship()` · `Ice({ w, h })` ice block · `Chain({ x1, y1, x2, y2, t })` growing chain ·
`Flag({ colors, label, vertical })`.
New props: draw them in the same style (flat fill + `stroke="#1a1a1a" stroke-width="6"`, round joins).

## Video helpers (per video)

`src/cues.js`: `cueStart(i)`, `cueEnd(i)`, `cueLen(i)`, `beat(from, i, frac)`.
`src/sfx.js`: SFX cue = `[frame, name, volume]`, `range(from, n, step, name, vol)`, `CARD`.
`src/video.js`: `SCENES` (`{ c, from, sfx }`), `chapter(n, title, sub, from)`, `DURATION`,
`musicGain` (fades, ducking under the voice), `Video(F, props)` (one frame).
`render.mjs` options: `--music 0.35 --sfx 0.8 --voice voice.wav --captions`; a SFX cue plays until its
file ends or its scene ends, as before.
