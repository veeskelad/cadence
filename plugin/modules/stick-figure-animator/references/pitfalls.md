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
- **Prop scale with `<At s>`** also scales its text: label buildings with a separate `<text>`.
- **Accessories.** The headscarf must not cover the face (eyes at y −3 in head space).

## Code
- **Spread order in keys:** `{ ...P.shock, head: -25 }`, not `{ head: -25, ...P.shock }`
  (TS2783 "specified more than once").
- **First key**: before the first key the pose equals the first key's pose. Add `{ f: 0, p: {} }`
  if a character should start from `base` and change later.
- **Numbers:** `toLocaleString("it-IT")` does not group 4-digit numbers in Chrome (3000 not 3.000):
  use `fmt()` from fx.tsx.
- **Remotion lint:** constant `volume={v}` on SFX triggers `@remotion/volume-callback`; the template
  disables it on that line on purpose.
- **Unused imports** fail `tsc` with `noUnusedLocals`: remove them instead of exporting dummies.
- **Windows shells:** in sed/bash heredocs backslashes in regexes get eaten (`\B` → `B`); edit such
  lines with the Edit tool instead.
- **Fonts** load asynchronously; the first still in the Studio may show a fallback font. Rendering
  waits for them.

## Rendering
- Render a contact sheet per scene before the full render; a full 3-minute render takes several
  minutes (run it in the background).
- After rendering run `check_render.py`: duration must match the timeline (±0.1 s), no clipped
  samples, and the big hits should stand out from the half second before them.
