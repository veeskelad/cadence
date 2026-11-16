# Montage Toolkit: workspace guide

Когда: нужно смонтировать запись говорящего человека целиком (транскрипт, нарезка, графика, проверка) или выбрать нужный этап и открыть его справку.

Turn a talking-head recording into an intentional edit using local HyperFrames
rendering, transcript-driven cuts, and reusable motion graphics.

## Routing

Справки лежат в `guides/<имя>.md`, скрипты и материалы этапа в `workflows/<имя>/`. Рендер идёт общим движком Cadence, а не `npx hyperframes`.
Model and permission choices belong to the user. Work locally unless the user requests subagents.

## Start and route

Read `guides/WORKFLOW.md` for a complete edit.
Use `edit-video` to coordinate transcription, cuts, design, and verification.
For one stage, open the matching guide:

| Need | Guide |
| --- | --- |
| Reels, Shorts, and short advertisements | `short-form-edit` |
| Motion-design showreels and brand reels cut to music | `motion-showreel` |
| Existing short-form example maintenance | `short-form-video` |
| New motion-graphics video from a brief | `make-a-video` |
| Full raw-video edit | `edit-video` |
| Silence removal | `cut-silences` |
| Retakes, false starts, or stutters | `cut-mistakes` |
| Narrative arc, persistent world, and visual callbacks | `video-storytelling` |
| Overlay beats, paper takeovers, and glass cards | `hyperframes-video-beats` |
| Select or extend styles and templates | `style-library` |
| HTML compositions and media timing (engine reference) | `hyperframes` |
| Preview, lint, and rendering (engine reference) | `hyperframes-cli` |
| Timeline animation | `cadence` |

Before a creative session read `guides/motion-philosophy.md` and the project's DESIGN.md.
The philosophy's fast sizzle pacing is a style reference. Give educational speech
room to breathe. The project brief controls pacing, palette, and typography.
The framework contracts in `guides/hyperframes.md` override historical code recipes in the style guide.

## Workspace

Create a project with `node modules/montage-toolkit/scripts/new-video.mjs my-video`. Keep source media, EDLs,
transcripts, compositions, and renders together under `work/<slug>/`.
Render from the Cadence root with the shared engine. The module `scripts/` utilities
accept paths from the working directory. `style-library/registry.json` indexes
cards; each style has a DESIGN.md, CSS tokens, and named text slots.
See `style-templates/README.md` for whole-scene templates.

Preserve raw files. Use a new output filename for each editing stage. Archive
obsolete work. Projects live in `work/<slug>/`, outside the repository. Never copy private media into library examples.

## Editing and timing

Transcription is local Whisper (`scripts/captions_whisper.py`, then
`modules/montage-toolkit/scripts/words-to-transcript.mjs` for the cutting tools).
No transcription, generation or voice service is built into this module. Reuse existing
transcripts and assets; make any upload or paid call concrete before asking the person.

Cut silences first; use its edited video AND retimed transcript for cut-mistakes.
Review each mistake in context. Intentional repetition is not a mistake. Record
the reviewed decisions before applying them. If no cuts are needed, preserve the
input or use an empty cuts list. Never mix original timestamps with edited footage.

Read the relevant guides before changing HTML. Root compositions use a visible
div with id, data-composition-id, data-start, duration, width, and height. Timed
elements carry data-start, data-duration, and data-track-index; same-track clips
must not overlap. Visible timed divs use class="clip"; videos do not.
Mute videos and use sibling audio for the mix. Animate a non-timed video wrapper.
Register one synchronous paused Cadence Tween timeline per composition in `cadence.mount`
using its exact composition ID. Keep finite timelines and explicit durations.
HyperFrames owns media playback. Use deterministic animation and local assets.

## Verification and approvals

Run `node modules/montage-toolkit/scripts/preflight.mjs <project>` and HyperFrames lint. For anchored
sub-compositions, run `node modules/montage-toolkit/scripts/validate-beat-sync.mjs <project>`; each beat
needs data-anchor with an exact transcript phrase. Enter between 0.2 seconds after
and 1.8 seconds before that word. Inline timelines require manual timing review.

Review Studio before draft rendering. Review the encoded draft, extract and
inspect hero frames and transition boundaries, and listen to the audio joins.
Check cropped faces, overflow, black flashes, readable labels, clipping, and A/V
sync. Resolve problems before the final render. Save evidence in VERIFY.md.
Use a Range-capable preview server for MP4 scrubbing (for example `npx serve`).

Honor approvals already provided. When review approval is missing, prepare the
concrete preview or cut proposal first. Never claim a lint result proves visual
quality. Only publish or upload a finished video when the user authorizes it.
Automated browser checks must be headless, with Pointer Lock and cursor capture
disabled; synthetic input must remain inside the virtual browser.

For short-form edits, read `guides/SHORT-FORM.md` and `guides/EDITING-PLAYBOOK.md`
(measured house style and lessons), and use the plan and footage
validators. Structural checks supplement rendered video and audio review.
