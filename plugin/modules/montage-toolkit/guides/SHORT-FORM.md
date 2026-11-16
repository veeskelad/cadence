# Reels and YouTube Shorts

Когда: делается рилс, шортс или короткая реклама: порядок шагов, проверка плана и футажа.

Use `short-form-edit` for a raw talking-head recording, reel, YouTube Short, or
short advertisement. It defaults to 1080x1920. Request a separately composed
1920x1080 version when needed; a center crop is not a second composition.

## Start

Run `node modules/montage-toolkit/scripts/new-video.mjs my-reel`, then follow `guides/short-form-edit.md` to edit your local recording into that project. State
the audience, intended action, target duration, and any brand preferences.
The starter is landscape; the skill must set the reel's composition dimensions,
layout, and metadata to 1080x1920 before authoring. Keep all source footage and
outputs inside the new project.

1. Transcribe locally with Whisper (`python3 scripts/captions_whisper.py`, then `node modules/montage-toolkit/scripts/words-to-transcript.mjs`), or reuse verified word timestamps.
2. Review mistakes in context and establish one frame-aligned edit decision list.
3. Explore three opening directions and choose a truthful promise and payoff.
4. Plan scenes, exact captions, moving footage, and sound cues against retained words.
5. Build the composition with the HyperFrames and Cadence Tween skills. Use a footage ledger
   to record provenance and prevent unintentional reuse of the same source scene.
6. Validate, preview, render a draft, inspect frames, and listen to the full edit.
7. Resolve timing, audio, and composition problems before exporting the final video.

Transcription runs locally with Whisper. Generated video and image assets are not part
of this module: use the person's own footage or assets they supply. The synthetic
validation example needs no paid service.

## Validate from the repository root

```sh
node modules/montage-toolkit/workflows/short-form-edit/scripts/validate-plan.mjs work/my-reel
node modules/montage-toolkit/workflows/short-form-edit/scripts/validate-footage.mjs work/my-reel
node modules/montage-toolkit/scripts/preflight.mjs work/my-reel
```

The first validator reads `assets/plan.json`, `assets/transcript.json`, and
`assets/edit-decisions.json`. The second reads the plan and, for moving footage,
`assets/footage-ledger.json`, checks hashes, and confirms referenced files exist.
Follow the [plan schema](../modules/montage-toolkit/workflows/short-form-edit/references/plan-schema.md).
Use the [reference worksheet](../modules/montage-toolkit/workflows/short-form-edit/references/reference-analysis.md)
when analyzing a supplied reference video.

Try the synthetic fixture without a recording or API key:

```sh
node modules/montage-toolkit/workflows/short-form-edit/scripts/validate-plan.mjs modules/montage-toolkit/examples/short-form
node modules/montage-toolkit/workflows/short-form-edit/scripts/validate-footage.mjs modules/montage-toolkit/examples/short-form
npm test
```

The fixture contains invented words and timing data, not a rendered reel.
Validators check structure and declared timing. They do not prove a compelling
hook, factual claims, rights to footage, correct visual cropping, or audible sync.
The skill's quality gates require watching and listening to the actual output.
