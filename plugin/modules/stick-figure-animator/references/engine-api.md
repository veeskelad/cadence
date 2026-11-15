# Engine API (src/stickman/)

Coordinates are the composition's pixels (1920×1080 by default). Ground line ≈ y 852–862.
Everything is driven by `f = useCurrentFrame()` (local to the scene's `<Sequence>`).

## Contents
- [stick.tsx: characters](#sticktsx-characters)
- [fx.tsx: text, impacts, camera](#fxtsx-text-impacts-camera)
- [common.tsx: stage and layout](#commontsx-stage-and-layout)
- [props.tsx: objects](#propstsx-objects)
- [Template helpers (per video)](#template-helpers-per-video)

## stick.tsx: characters

**Angles** (degrees): `dir(a) = (sin a, cos a)`, so 0 = down, 90 = right, -90 = left, 180 = up.
Arms are relative to the torso (0 = hanging), forearm/shin relative to the upper limb.
Legs use the vertical reference (leaning the torso does not drag them).

`Pose = { x, y, lean, head, la1, la2, ra1, ra2, ll1, ll2, rl1, rl2, rot }`
- `x, y` hip position · `lean` torso (>0 right) · `head` tilt · `rot` whole body around the hip (flips/falls).
- `STAND` default pose (x 960, y 760, scale 1). `groundY(scale)` = hip y with feet on the ground.

`P` ready poses (spread them into keys): `stand armsUp cheer pointR pointL shrug think crouch punchR kickR carry hold facepalm sit handshake sad shock`.
With `facing={-1}` the figure is mirrored, so `pointR`/`punchR` point the way it faces.

`<Actor f keys color base? scale? facing? accessory? face? label? mod? trails? opacity? draw?>{(j) => …}</Actor>`
- `keys: Key[]` = `{ f, p: Partial<Pose>, e?: easing }`. **Keys are cumulative**: each key inherits
  values from the previous one. Before the first key the first pose holds; after the last key it holds.
  Default easing `SNAP` (fast with overshoot); `SMOOTH` for arcs/flights; `(t) => t` for linear walks.
  When a key spreads a `P.*` pose and also sets a field the pose has (e.g. `head`), put the spread FIRST:
  `{ ...P.shock, head: -25 }`; TypeScript rejects the other order.
- `base` = starting pose overrides (`{ x, y }`).
- `facing` number or `(f) => 1 | -1` (flip mid-action, e.g. after a backflip).
- `accessory`: `tie scarf tophat crown cap glasses none`. `face`: `none eyes angry sad happy`.
- `label` text above the head (names, countries, "YOU").
- `mod(t, pose) => pose` adds procedural motion: `addPose(p, walkCycle(t))`, `addPose(p, runCycle(t, speed))`,
  `addPose(p, idle(t, seed))` (breathing, keeps idle characters alive).
- `trails` (default true) draws ghost smears when the body moves fast.
- `draw` 0→1 draws the figure stroke by stroke (head, torso, arms, legs), for the "cursor draws the hero" open.
- children render prop gets joints `j` (`hip neck headC lElbow lHand rElbow rHand lKnee lFoot rKnee rFoot headR`):
  put held objects at `(j.lHand + j.rHand)/2`, a cursor in the hand, etc.

`<Figure pose …>` is the static version; `solve(pose, scale, facing)` returns joints without drawing
(useful to aim a cursor/prop at a hand before the character exists).

## fx.tsx: text, impacts, camera

Fonts (Google Fonts via @remotion/google-fonts): `FONT.comic` (Bangers: impact words),
`FONT.title` (Barlow Condensed 600/800/900: titles, labels), `FONT.body` (Inter: sentences).

Palette `COL`: `paper ink orange blue green red yellow purple grey dollar gold`.
Give each recurring character one colour and keep it all video long (the hero/"you" = orange).

| Component / fn | Use |
|---|---|
| `<Slam f at x y size color font weight rotate out stroke spacing>` | word/title that slams in (scale 3.2→1 + blur). `out` fades it. |
| `<Caption f at out x y size bg color align>` | pill caption sliding up (sentences, sources, numbers) |
| `<Type f at text cps>` | typewriter |
| `<Burst x y at f size color n>` | comic impact star; put it on the contact point at the hit frame |
| `<Dust x y at f spread>` | landing puffs on the ground |
| `<SpeedLines f from to dir>` | horizontal speed lines |
| `<Cursor x y scale pressed>` | the animator's mouse pointer |
| `<Paper tint ground>` | paper background (Stage uses it by default) |
| `<Wipe f dur>` | diagonal black wipe in/out |
| `shakeAt(f, hits, power, len)` | camera shake offsets (Stage does it for you) |
| `ease(f, a, b, from, to, easing)` | clamped interpolate with a snappy default |
| `countUp(f, a, b, to, from)` + `fmt(n)` | counting numbers with dot thousands separator |

## common.tsx: stage and layout

`<Stage hits power svg html under bg cam>`: one scene = paper + an SVG layer (characters, props,
bursts) + an HTML layer (text) sharing one camera shake.
- `hits`: frames where the camera shakes (every big impact); `power` 8 (light) – 30 (huge).
- `cam={{ x, y, z }}`: pan/zoom the SVG world (x/y = world offset, z = zoom around the centre).
  For a "timeline" of stations place them at x = 960 + i·1920 and pan `cam.x` between them;
  zoom out (`z` 0.33) at the end to show all of them at once.
- `bg` replaces the paper (e.g. `<Paper tint="#f3e7cf" />` for a sepia flashback).

| Component / fn | Use |
|---|---|
| `<ChapterCard n title sub dur>` | full-screen chapter card (use as its own scene) |
| `<Card f at x y w n accent size out>` | numbered card (lists, clauses, lessons); `x` = centre, `y` = top |
| `<Stamp f at x y text color size r>` | rubber stamp (TOP SECRET, TIER 1, FAKE…) |
| `<WordBlock x y r text bg color size s>` | SVG word in a box: a *physical* word that falls/bounces/hits |
| `fall(f, at, y0, y1, dur)` | gravity fall with small bounces → y |
| `<Bubble x y w h t tailX tailY>` | speech bubble (t = 0…1 pop scale) with SVG children |
| `<Captions cues bottom size>` | burned-in subtitles from timeline cues (Video does this with `captions: true`) |

## props.tsx: objects

All centred on (0,0); place with `<At x y s r o>`.
`Barrel(label)` oil barrel · `Bill(w, sym, color)` banknote · `GoldBar(label)` · `Coin(sym, color, r)` ·
`Shield(crack 0-1, color)` · `Missile` · `Printer(f)` money printer · `Bank(label, w)` columns building ·
`Box(label)` crate · `Ship` · `Ice(w, h)` ice block · `Chain(x1 y1 x2 y2 t)` growing chain ·
`Flag(colors, label, vertical)`.
New props: draw them in the same style (flat fill + `stroke={COL.ink} strokeWidth={6}`, round joins).

## Template helpers (per video)

`src/<slug>/cues.ts`: `cueStart(i)`, `cueEnd(i)`, `cueLen(i)`, `beat(from, i, frac)`.
`src/<slug>/sfx.ts`: `SfxCue = [frame, name, volume]`, `range(from, n, step, name, vol)`, `CARD`.
`src/<slug>/Video.tsx`: `SCENES` (`{ c, from, sfx }`), `chapter(n, title, sub, from)`, `DURATION`,
props `music sfx voice captions`, automatic music ducking under the voice.
Scene components receive `{ from, dur }` (global start frame and length).
