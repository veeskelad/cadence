# From recording to finished edit

Когда: нужен весь путь от записи до готового монтажа командами по порядку.

> В Cadence рендер идёт общим движком (`npm --prefix engine run check|snapshot|render`), а не командой `npx hyperframes`. Команды `init`, `add`, `tts`, `transcribe`, `capture`, `auth`, `cloud`, `remove-background` ходят в сеть или ставят модели и здесь не запускаются. Команды ниже оставлены как справка по движку.

## 1. Create a project and transcribe

From the repository root run `node modules/montage-toolkit/scripts/new-video.mjs my-video`. Put your recording
at `work/my-video/assets/raw.mp4`. Preserve this original.

```sh
python3 scripts/captions_whisper.py work/my-video/assets/raw.mp4
node modules/montage-toolkit/scripts/words-to-transcript.mjs work/my-video/out/raw.words.json work/my-video/assets/raw.json
```

Whisper runs on this machine (no key, no network; a missing model is downloaded only with
`--allow-download` and the person's consent). You can also supply an existing word-level
JSON transcript with `words: [{text, start, end}]` and `audio_duration_secs`.

## 2. Remove dead air

```sh
node modules/montage-toolkit/workflows/cut-silences/scripts/cut-silences.mjs work/my-video/assets/raw.json --video work/my-video/assets/raw.mp4 --out-dir work/my-video/assets --output work/my-video/assets/silenced.mp4 --apply
```

The retimed transcript is `raw.silence-transcript.json`. Tune gap and breathing
parameters in the skill; do not remove pauses that carry meaning.

## 3. Review mistakes

```sh
node modules/montage-toolkit/workflows/cut-mistakes/scripts/find-cut-candidates.mjs work/my-video/assets/raw.silence-transcript.json --out-dir work/my-video/assets
```

Read each proposal against the speech. Write reviewed decisions to
`approved-cuts.json` using `{ "cuts": [{ "start": 1.2, "end": 1.5, "reason": "stutter" }] }`.
These times are on the SILENCED timeline. Empty cuts are valid.

```sh
node modules/montage-toolkit/workflows/cut-mistakes/scripts/apply-cuts.mjs work/my-video/assets/raw.silence-transcript.json --cuts work/my-video/assets/approved-cuts.json --video work/my-video/assets/silenced.mp4 --out-dir work/my-video/assets --output work/my-video/assets/clean.mp4 --apply
```

Use `raw.mistakes-transcript.json` alongside `clean.mp4`. Copy that transcript to
the project's `assets/transcript.json` for beat validation. Never use raw timings
against the cleaned video.

## 4. Design the visual layer

Read video-storytelling and the motion philosophy. Fill a beat sheet with the
spoken anchor, on-screen idea, visual, entry time, and callback. Pick a style and
copy cards with their CSS/assets into your composition. Preserve the speaker's
face and use a non-timed wrapper for camera reframing. See style-library skill.
The graph-paper template is a background; it needs your story content on top.

## 5. Check, preview, and render

```sh
node modules/montage-toolkit/scripts/preflight.mjs work/my-video
node modules/montage-toolkit/scripts/validate-beat-sync.mjs work/my-video
cd work/my-video
npx hyperframes lint
npx hyperframes preview
```

Run beat-sync only for anchored external sub-compositions; it fails when none
are present. For inline compositions, check timing manually. Review Studio, then
render a draft. Inspect encoded frames at hero moments and transitions, and
listen at joins. Fix problems and write VERIFY.md before a standard render.
Publication is a separate action requiring the student's instruction.
