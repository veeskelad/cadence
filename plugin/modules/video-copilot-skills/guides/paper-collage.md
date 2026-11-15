# Paper collage: one photo becomes an animation

Когда: человек присылает фото и идею и хочет короткую анимацию «бумажный коллаж» (полутоновые вырезки с белой кромкой, рваная бумага, зерно, покадровые подвижки, медленный наезд камеры), или просит поменять уже сделанную.

One photo and one idea in, a 6 to 15 second paper-collage animation out, in the look of explainer documentaries. Every change after that is one more instruction: another person, another place, another object, the same animation.

Talk to the person in their language. `<dir>` = `$WORK/<project>/video-agent/collage/<slug>/` (slug: 2 to 4 words of the idea, kebab-case). The person's photo is copied in, never changed. `SE=<Cadence root>/modules/video-copilot-skills/engine`.

```text
<dir>/
├── photo.jpg        their photo, untouched
├── layers/          every layer of the collage (PNG with alpha, plates in JPG/PNG)
├── raw/             the layer images before the chroma cut
├── shots.json       the layers asked for (name, kind, ar, subject)
├── animation.html   the animation: window.setT(t), opens in any browser and plays
└── <slug>.mp4
```

## 1. Tools (once)

```bash
ffmpeg -version | head -1
node --version
```

Missing ffmpeg: ask the person, then `brew install ffmpeg` (macOS), `sudo apt install ffmpeg` (Linux), `winget install Gyan.FFmpeg` (Windows). The capture uses the engine of this module (its setup, step 0 of [short-editing.md](short-editing.md), installs Chrome if needed). No image service is called here.

## 2. The plan (one message, then their yes)

From the photo and the idea, plan the collage like a page of a magazine, then the moves:

- **The hero**: their photo, always the REAL photo (never redrawn: faces drift). Cut out (step 3) and printed as halftone by code in the page.
- **A background plate**: one full-frame 9:16 paper scene that sets the place and the time (a sky, a city, a map, a desk, a sheet of aged paper).
- **3 to 6 cut-outs**: the objects of the story (a monument, newspapers, banknotes, a car, a building, clouds, birds). Each one is a separate layer so it can move on its own.
- **The moves** (6 to 15 s): the camera pushes in slowly the whole time, layers enter one by one every 0.5 to 1.5 s (slide in, rise from below, drop from above, a torn-paper wipe), something keeps living (clouds drifting, a bird flapping with two cut-outs, notes falling), one title on a torn paper strip if the idea has one (a place and a year, a name). All on a 12 fps stop-motion clock.

Show the layers as a numbered list (name, plate or cut-out, what it shows) and the beat timeline in 4 to 6 lines. Wait for a yes.

## 3. Their photo: cut out, never redrawn

```bash
mkdir -p <dir>/layers <dir>/raw
cp "<their photo>" <dir>/photo.jpg
```

Cutting the background out needs a model that is downloaded once (for example `uvx --from "rembg[cpu,cli]" rembg i photo.jpg layers/hero.png`, about a minute). That is a network download: ask first. Look at the PNG: a clean silhouette, no chunk of background left.

- **Cut-out bad, or no download allowed**: keep the photo as a rectangular print, it is just as good: `layers/hero.jpg` placed as a print with a white border and torn edges (see [paper-collage/animation.md](paper-collage/animation.md), "The photo as a print").
- **A person who never had a photo** (a historical figure, a painting): an engraving or painting from the public domain, cut out the same way.
- Only photos of people who agreed, or public-domain images. Say it once if they send someone else's photo.

The halftone, the white scissor border and the shadow are added by the page ([paper-collage/animation.md](paper-collage/animation.md)), so the real photo stays the real photo.

## 4. The other layers

Write `<dir>/shots.json` and build every prompt with [paper-collage/look.md](paper-collage/look.md): the subject, plus the green-screen sentence for a cut-out, plus the style sentence. Never a logo, a wordmark or any readable text in a layer (newspapers and notes get illegible type texture only).

The layers come from the person: their own images, public-domain images, or images made with a service of their choice. This module calls no image service. To make them, hand the prompts of `shots.json` to the generation route of Cadence (`cadence-generate` writes the brief for the person's own service) and wait for the files; put them in `<dir>/raw/<name>.png`. Then for each cut-out, the chroma cut:

```bash
ffmpeg -v error -y -i <dir>/raw/<name>.png -vf "colorkey=0x00FF00:0.30:0.10,despill=type=green:mix=0.6:expand=0,format=rgba" <dir>/layers/<name>.png
```

Check each layer by eye: put it on red to see any green fringe (`ffmpeg -v error -y -f lavfi -i color=red:s=1024x1536 -i <layer> -filter_complex "[1:v]scale=1024:-1[a];[0:v][a]overlay=0:0" -frames:v 1 <dir>/raw/check-<name>.png`), and no text or letters in it. A bad one: fix the subject and ask for that one again.

## 5. The animation page

Write `<dir>/animation.html` from the template of [paper-collage/animation.md](paper-collage/animation.md) (the whole page is there, tested) and adapt it to the plan: the layers, their sizes and places, the timeline in `setT`. Keep `setT(t)` a pure function of `t`: the capture calls it frame by frame.

Open it in a browser to preview (it plays on its own): `open <dir>/animation.html` (macOS), `xdg-open` (Linux), `start` (Windows). Fix what looks wrong before the capture.

## 6. The MP4

Capture with the engine of this module (the page keeps `window.ready`, the capture waits for it):

```bash
cd "$WORK/<project>" && node "$SE/short.mjs" capture video-agent/collage/<slug> video-agent/collage/<slug>/animation.html --dur <DUR> --size 1080x1920 --out video-agent/collage/<slug>/<slug>.mp4
```

Then copy the mp4 to `$WORK/<project>/out/`. Look at 3 frames (start, middle, end) before showing it: `ffmpeg -v error -y -ss <t> -i <slug>.mp4 -frames:v 1 -vf scale=540:-1 raw/frame-<t>.jpg`. Music or a voice go on top in their editor, or with the sound routes of Cadence.

## 7. Change it with one more instruction

Same `<dir>`, same page, only what changes:

- **Another person**: a new hero (step 3), same layers, same timeline: the page swaps `layers/hero.png` and is captured again.
- **Another object or place**: one new layer (step 4), placed in the page, the rest stays.
- **Another move or timing**: only `setT`. Another format: see "Formats" in [paper-collage/animation.md](paper-collage/animation.md).

Never redo layers that did not change.

## Honest limits

- A made image can come with letters on it or a green fringe. Always look.
- The cut-out of a busy photo can miss hair or fingers: the print version is the safe fallback.
- The look is inspired by explainer documentaries: never anyone's name, logo or wordmark on screen.
