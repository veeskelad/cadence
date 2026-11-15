# Как делать ролик со стик-фигурами (Remotion)

Когда: нужен мультяшный объяснялка-ролик с человечками из текста, сценария, субтитров или чужого видео; озвучка записывается позже или уже есть.

Turns content (prompt, script, subtitles, YouTube video) into a stick-figure animated explainer
rendered with Remotion, with original sound effects and music, and keeps it in sync with a
voiceover recorded later.

The bundled engine (`assets/engine/`, copied into the project as `src/stickman/`) provides
posable characters, physical text, impacts, camera shake and props, so the work is choreography,
not plumbing. Paths below are relative to the module folder (modules/stick-figure-animator/); run scripts with Python 3.

## 0. Settle the brief (ask only what you can't infer)

Use the user's language for everything they read or hear (scripts, on-screen text, questions).

- **Content source**: prompt/topic · script/text · .srt · YouTube URL / long transcript.
- **Voiceover**: *none* · *recorded later* · *already recorded* (audio file).
  This decides how timing works (see step 2), so ask if it is unclear.
- **Format**: 16:9 1920×1080 (default) or 9:16 1080×1920 (vertical: lay scenes out for that frame).
- **Length**: for a prompt or a long source, agree a target (an explainer is usually 1–4 min).
- **Burned-in captions**: optional.

## 1. Find or install Remotion

```bash
python scripts/find_remotion.py            # add --path DIR if the user named a folder
```

It prints Node/npm versions and every Remotion project it finds (current folder and parents,
sub-folders, home, drive roots).

- One project found → use it (say which). Several → ask which one.
- None found, or the user wants a fresh one → ask: *"Install Remotion in `<current folder>`, or
  is it installed somewhere else (path)?"* A new install downloads a few hundred MB, so confirm.
- No Node.js → tell the user to install Node LTS from nodejs.org first.

Then prepare the project (installs the engine's packages pinned to the project's Remotion
version, copies the engine and the contact-sheet helper):

```bash
python scripts/setup_project.py --dir <project>            # existing project
python scripts/setup_project.py --dir <folder> --create    # new project here
```

Exit code 2 = no project and no `--create`; exit code 3 = a non-Remotion `package.json` is there
(don't add Remotion to someone's app without asking). Then create the video folder:

```bash
python scripts/new_video.py --project <project> --slug <video-slug> [--size 1080x1920]
```

It copies `assets/template/` to `src/<slug>/`, creates `public/<slug>/` and registers the
composition (PascalCase of the slug) in `src/Root.tsx`.

## 2. Content → planned timeline

Everything in the video is anchored to a **timeline of narration cues** (`src/<slug>/timeline.ts`).

| Input | What to do |
|---|---|
| Prompt / topic | Write the script yourself (research facts if needed, keep claims accurate). |
| Long source (YouTube, transcript, long .srt) | `scripts/fetch_transcript.py <url> --out src.srt`, read it, condense it into a script of the target length. Credit the source in the end titles. |
| Script / text | Use it (tighten lines over ~16 words). |
| .srt that IS the narration plan | Use it as is: `--srt`. |

Script format: one paragraph per idea, `# Chapter title` lines for chapter cards.

```bash
python scripts/parse_input.py --script script.md --out <project>/src/<slug> --wps 2.6
python scripts/parse_input.py --srt narration.srt --out <project>/src/<slug>
```

This writes `timeline.ts`, `timeline.json` and `voiceover.srt` (the timed script to record from)
and reports duration and lines that are too fast (> 3.3 words/s): shorten those lines.

**Timing modes.** The narration drives timing only when there is a voiceover:
- *Voiceover (later or already recorded)*: `--wps 2.4–2.7`, a natural reading pace. The video's
  length is the timeline's length. A recorded voice never matches the plan exactly, which is why
  step 8 re-times everything to the real audio.
- *No voiceover*: the cues are just the pacing plan for on-screen text and beats; use `--wps 2.8–3.2`
  and feel free to move scene starts and set `DURATION` to the end of the last scene.

A voiceover that already exists: build the plan from the script/SRT the user read, then run
step 8 right away; or, if there is no script, `scripts/transcribe_voice.py voice.wav --out voice.srt`
and use that SRT with `--srt`.

## 3. Storyboard

Write `src/<slug>/storyboard.md`: one row per scene with the cue range, the visual metaphor, the
characters (colour + label), the on-screen text, the key beats (as `cue i + fraction`) and the SFX.
Read `references/animation-style.md` first: principles, a table of visual metaphors for abstract
ideas, and proven scene recipes (cold open, clauses, loop wheel, station pan, data beat, lessons,
ending). Scenes typically last 6–20 s; chapters get a `chapter()` card.

For videos longer than ~2 minutes, show the user a short scene list and let them adjust before
building; for short ones, just go.

## 4. Build the scenes

Read `references/engine-api.md` (the whole engine on one page) and look at
`src/<slug>/S01Example.tsx`. For each scene write `src/<slug>/Sxx<Name>.tsx`:

- A scene is a `React.FC<SceneProps>` (`{ from, dur }`) returning a `<Stage svg={…} html={…} hits={…} />`.
- **Anchor to cues, not seconds**: in `Video.tsx` use `from: cueStart(i)` for scene starts; inside
  scenes use `beat(from, i, frac)` for anything that must match words (a title appearing when it's
  said, a hit on a key word). Short reactions can use fixed offsets from those anchors.
- Export the scene's SFX list (`SxxSFX: SfxCue[]`) with cues on the same frames as the action and
  add `{ c, from, sfx }` to `SCENES`. Replace the example scene when the first real scene exists.

## 5. Check visually (before any full render)

```bash
cd <project> && npx tsc --noEmit
node stickman-sheet.mjs <Composition> out/sheet-s02.png 0-450:45     # frames or ranges a-b:step
```

Open the contact sheet image and look for: text over characters, labels covered by held props,
props off-frame, characters floating or sinking (use `groundY(scale)`), unreadable text, scenes
where nothing moves for > 2 s. Fix and re-check; it is far cheaper than re-rendering.
`references/pitfalls.md` lists the usual suspects.

## 6. Audio: effects and music

```bash
python scripts/gen_audio.py --out <project>/public/<slug> --plan "intro:8.7,card:2.2,play:52.6,card:2.2,tense:35,finale:12"
```

Everything is synthesized (no samples, no licensing). Make the plan from the timeline: one style
per chapter (`intro play tense mystery hope finale`, `card` for chapter cards), seconds = the
section's frames / fps, summing to the video length. Effect names are listed in `src/<slug>/sfx.ts`.

## 7. Render and verify

```bash
cd <project> && npx remotion render <Composition> out/<slug>.mp4
python scripts/check_render.py <project>/out/<slug>.mp4 --timeline <project>/src/<slug>/timeline.json --hits 5.9,61.5
```

A full render takes minutes: run it in the background. The check reports duration vs timeline,
audio peak/clipping and whether the listed big hits stand out.

Volumes, voice and captions are composition props (`music` 0.35, `sfx` 0.8, `voice`, `captions`),
editable in Remotion Studio (`npm run dev`) or with `--props='{"captions":true}'` on render.

## 8. Sync to the recorded voiceover

When the user has recorded the narration (from `voiceover.srt`), copy the file to
`<project>/public/<slug>/voice.wav` (or .mp3) and run:

```bash
python scripts/align_voice.py --timeline <project>/src/<slug>/timeline.json --audio <project>/public/<slug>/voice.wav --out <project>/src/<slug> --lang it
```

It transcribes the recording with word timestamps (needs `pip install faster-whisper`),
aligns it to the planned lines and rewrites the timeline with the real times (the plan is kept as
`timeline.planned.json`). Because scenes and beats are anchored to cues, they now follow the
reader's pace. Then render with `--props='{"voice":"voice.wav"}'`: the music ducks under the voice.

Read the report: `coverage` < 0.8 means the reading differs a lot from the script (check
`voice.aligned.srt`); `short_chapter_gaps` lists chapter cards without a pause in the voice.
`--srt transcript.srt` works without a transcriber but is less precise near pauses.

## Deliverables

Tell the user where everything is: the video (`out/<slug>.mp4`), `voiceover.srt` (lines and timing
to record), `storyboard.md`, and how to re-render after recording (step 8). Report the real
duration and anything you could not verify (you can't hear the audio: say so).

## Guardrails

- Real people appear only as labelled generic figures; violence stays cartoonish and off-body.
- Content summarised from someone else's video or text is credited in the end titles.
- Keep the audio original (gen_audio.py); if the user brings music, they own the rights.
- Don't add Remotion to an existing non-Remotion project, or install packages, without the
  user's OK.
