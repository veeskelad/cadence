# Pitfalls (learned the hard way)

## Timing and voiceover
- **Video length vs narration.** A 3-minute animation cannot carry a 6-minute narration. With a
  voiceover the narration sets the length; never squeeze a long script into a short video.
  For a summary of a long source, write a shorter script first.
- **Speaking rate.** Natural voiceover ≈ 2.4–2.7 words/s (Italian and English alike); above ~3.3
  it sounds rushed. `parse_input.py` lists the cues that are too fast: shorten them.
- **Recorded voices drift.** Every reader has their own pace, speeds up and slows down. Anchor
  scenes and beats to cue indices (`cueStart`, `beat`), never to absolute seconds, then run
  `align_voice.py --audio` on the recording and re-render. Hard-coded frame numbers inside a
  scene are fine for short reactions (a hit, a bounce), not for things that must match words.
- **Chapter cards and pauses.** If the reader does not pause where a chapter card is,
  `align_voice.py` reports `short_chapter_gaps`: either ask for a re-take with a pause, or
  shorten the card/turn it into an overlay.
- **SRT-only alignment** (no audio) interpolates inside segments and can be off by 1–3 s near
  pauses. Prefer `--audio` (word timestamps).

## Layout
- **Labels vs props.** A held object (coin, gold bar) placed at hand height covers the head label.
  Hold objects ~75–110 px above the hands' midpoint, or move the label.
- **Text vs action.** Captions/slams placed where characters jump or fly: check contact sheets
  around every big move.
- **Off-screen launches and camera zoom.** A character launched to y −500 reappears when the
  camera zooms out (z 0.33). Launch far enough (y −2600, x +2400) or hide it after the exit.
- **Prop scale with `At({ s })`** also scales its text: label buildings with a separate `<text>`.
- **Accessories.** The headscarf must not cover the face (eyes at y −3 in head space).

## Code
- **Spread order in keys:** `{ ...P.shock, head: -25 }`, not `{ head: -25, ...P.shock }`
  (the later field wins: the second form silently keeps the pose's own `head`).
- **First key**: before the first key the pose equals the first key's pose. Add `{ f: 0, p: {} }`
  if a character should start from `base` and change later.
- **Numbers:** `toLocaleString("it-IT")` does not group 4-digit numbers in Chrome (3000 not 3.000):
  use `fmt()` from fx.js.
- **Markup is a string:** every component returns markup, so join lists with `.join("")` and put
  conditional parts as `cond ? markup : ""` (a stray `false` or `undefined` ends up as text on screen).
  Text from the script goes through `esc()`.
- **Same frame, same picture:** no `Math.random()`, `Date.now()` or state kept between frames: the
  engine may render frames in any order. Use `random(seed)` from fx.js.
- **Imports** use relative paths with the `.js` extension (`./stickman/fx.js`); a syntax error shows up
  in `node render.mjs --build-only` (it imports `src/video.js`).
- **Windows shells:** in sed/bash heredocs backslashes in regexes get eaten (`\B` → `B`); edit such
  lines with the Edit tool instead.
- **Fonts** are local (Bangers, Oswald, Inter Tight in `fonts/`); `index.html` draws each face once
  off-screen so they are loaded before frame 0. A new face needs a `@font-face` in `fonts/fonts.css`
  and a line in that warm-up block, or `engine check` reports it.

## Rendering
- Render a contact sheet per scene (`node render.mjs --sheet a-b:step`) before the full render; a full
  3-minute render takes several minutes (run it in the background, one worker on a laptop).
- After rendering run `check_render.py`: duration must match the timeline (±0.1 s), no clipped
  samples, and the big hits should stand out from the half second before them.
