# Render patterns (shared Cadence engine)

How `hyperframes/render.mjs` and `hyperframes/short.html` turn an approved segment into a vertical short.
The engine is HyperFrames in `engine/` at the Cadence root; the module installs no packages of its own.

## One project per segment

`render.mjs` builds `render/_projects/short_NN/` for every segment and renders them one after another:

- `index.html`: a copy of `short.html` with the segment data (crop, keyframes, captions, hook, length) in
  `<script type="application/json" id="short">` and the root `data-duration` set to the segment length;
- `lib/motion.js`: the engine's motion helpers (`engine/lib/motion.js`);
- `fonts/`: Montserrat, Bangers, Inter (OFL);
- `clip.mp4`: a hard link to (or copy of) `clips/clip_NN.mp4`.

The engine refuses paths above the project folder, so everything the page uses is inside it. After a
successful render the folder is removed; `--keep-projects` keeps it, then
`npm --prefix engine run check -- <absolute path>/render/_projects/short_NN` and
`npm --prefix engine run snapshot -- <absolute path>/render/_projects/short_NN --at 0.5,2,4` show what went wrong
(npm runs the engine from `engine/`, so a relative project path would point inside it).

Command the script runs (from the Cadence root):

```bash
npm --prefix engine run render -- <project> --quality standard --fps 30 --workers 1 --output <short_NN.mp4>
```

## How time works

There is no animation library and no registered timeline. The root carries `data-no-timeline`; the page
imports `bindSeek` from `lib/motion.js`, and the engine sends every frame time `t` (seconds) through the
`hf-seek` event. `render(t)` takes `frame = Math.round(t * 30)` and redraws everything from that number
alone: crop position, caption page, word highlight, spring scale, hook fade, progress bar. No state is
kept between frames, so the engine may request frames in any order and with several workers.

## Clip and reframe

- `<video>` sits directly inside `#root` (the engine seeks only such videos frame by frame), `muted`;
  the sound comes from a separate `<audio src="clip.mp4">` with `data-volume="1"`.
- `data-duration` of both is the shorter of the clip length (ffprobe) and the segment length.
- Reframe = size + translate on the video itself: `scale = 1080 / crop.w`, the video is `source × scale`
  and moved by `-crop.x × scale, -crop.y × scale`. `cropKeyframes` (`[{t, x}]`, seconds) are interpolated
  linearly and clamped at both ends (cursor tracking in screen recordings).
- Framed layout: when the scaled picture is shorter than 1920, it starts at y 200 (under the hook zone)
  and `clip-path: inset(...)` cuts it to the 1080-wide window.

## Springs

The caption and hook springs keep the old `{mass, damping, stiffness}` settings and are evaluated in
closed form: `omega = sqrt(stiffness / mass)`, `zeta = damping / (2 sqrt(stiffness × mass))`, then
`spring(t, omega, zeta)` from `lib/motion.js` (a 0 → 1 step response, overshoot when `zeta < 1`).

| Element | Settings | Behaviour |
|---|---|---|
| bold page | damping 12, stiffness 200 | pop-in with a small overshoot |
| bounce page | damping 8, stiffness 180, mapped to 0.7 → 1 | bouncy, overshoots to about 1.2 |
| hook overlay | damping 14, stiffness 200, starts at 0.3 s | pop-in, fades out 3.0 → 3.5 s |
| clean page | opacity 0 → 1 over 6 frames | no spring |

## Caption pages

`captionPages(captions, combineMs)` groups word tokens into pages: a word that starts with a space opens
a new page once the current page spans more than `combineMs` (bold 800, bounce 600, clean 1500).
faster-whisper keeps the leading space in `word.word`, `transcribe.py` passes it through. A page is shown
from its first word's start to its last word's end; the active word is the one whose `[startMs, endMs)`
contains the current time.

## Performance

- One worker by default (`--workers 1`): each worker is a separate Chrome. Raise it only on a strong machine.
- `--quality draft` for a quick look, `standard` for delivery (export.sh re-encodes per platform anyway).
- Long GOP in the cut clips only slows preview seeking; the render warns about it and is unaffected.
