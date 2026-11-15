Когда: нужно один раз настроить зависимости и бренд (цвета, шрифты) перед первым рендером.

# Video Pipeline — Setup Guide

One-time setup for the branded video editing pipeline. For the per-video
workflow, see **[EXECUTION.md](execution.md)**.

---

## What this is

A pipeline that turns a talking-head clip (or a voiceover-only script) into
a branded, captioned, graphics-rich video — 9:16 shorts, 16:9 long-form, or
faceless motion-graphics reels. Everything renders through Remotion; ffmpeg
handles cutting/muxing only (this machine's ffmpeg may be a minimal build
with no libass — captions and overlays render inside Remotion, never via
ffmpeg subtitle-burn).

## Prerequisites (macOS)

| Tool | Version | Install |
|---|---|---|
| Node | 18+ (tested 22) | `brew install node` |
| Python | **3.11** (PyTorch/WhisperX don't support 3.14) | `brew install python@3.11` |
| ffmpeg | 6+ | `brew install ffmpeg` |
| git | any | `brew install git` |

## Install

Through the Cadence module setup, from the Cadence root. Nothing is installed without the person's consent (network, about 3 GB: WhisperX with torch, Remotion, a browser for Remotion on its first render).

```bash
python3 scripts/module_setup.py status video-director-skills     # no network
python3 scripts/module_setup.py install video-director-skills    # with consent
```

This puts the Python packages (`requirements.txt`) and the Remotion packages of the main route (`routes/video-edit-longform/remotion`) into the shared cache. The two other routes use the same packages: link them once.

```bash
for r in video-edit motion-design-edit; do
  ln -s ../../video-edit-longform/remotion/node_modules modules/video-director-skills/routes/$r/remotion/node_modules
done
PY="$(python3 scripts/module_setup.py python video-director-skills | python3 -c 'import sys,json;print(json.load(sys.stdin)["python"])')"; export VIDEO_DIRECTOR_PYTHON="$PY"
```

### Keys and network

There are no keys by default and no network at run time. Two steps are off:
- `polish_transcript.py` (a language-model pass over the transcript): runs only with `POLISH_TRANSCRIPT=1` and a key in `ANTHROPIC_API_KEY`;
- the speaker cutout model (`rembg`) is downloaded on its first use.

Transcription is local (WhisperX). A cloud transcription bridge is not part of the module.

---

## Brand setup — not one-size-fits-all

The pipeline ships with an example "Visual OS" brand preset (deep navy ink,
electric-blue accent, Claude-orange punch, light background; Georgia
headlines / Inter body / JetBrains Mono chrome) so it renders something
reasonable out of the box. **Before your first real render**, replace it
with your own brand — this is a one-time conversation, not a config file to
fill in by hand.

### The flow (run this once, or whenever you want to rebrand)

Ask the user (via AskUserQuestion or plain conversation):

1. **Primary color** — the one color that should read as "this brand" at a
   glance. Hex, a color name, or "match my logo/website" (fetch it if a URL
   is given).
2. **Background preference** — light, dark, or "whichever suits the primary
   color best."
3. **A second color** — for punch/execution moments distinct from the
   primary accent (e.g. a warm color against a cool primary, or vice versa).
   If the user has no preference, pick one with clear hue separation from
   the primary (roughly complementary or triadic) and confirm it back to them.
4. **Fonts** — a headline/display font, a body font, and (optional) a
   monospace font for peripheral chrome (eyebrows/tags/timestamps). If the
   user just describes a vibe ("modern and clean", "editorial/serif",
   "playful") instead of naming fonts, pick a reasonable Google Fonts pairing
   that matches the vibe and confirm it back.
5. **Anything to avoid** — e.g. "no gradients", "no violet", matching an
   existing style guide.

### Deriving the rest of the palette

Don't just drop the two chosen colors in and stop — build a coherent set:
- **ink** (primary text / dark blocks): a near-black or very dark shade of
  the background's opposite pole — reuse the existing preset's neutral if
  the user has no preference, don't invent a new dark color per brand.
- **muted** (sub-labels, secondary text): a desaturated, mid-lightness
  version of ink — should read as "quieter", never competing with the
  primary accent.
- **glass/card surfaces**: white or near-white with the ink color tinted in
  at low opacity, matching the existing preset's approach (`rgba` glass
  fills/borders/shadows) — don't redesign the surface system, just recolor
  its tint.
- **Discipline that must survive any rebrand:** one accent color reads as
  THE accent per frame — don't let the primary and the punch color both
  compete for attention in the same beat. This is a hard rule across all
  the token files, not a style suggestion.

### Applying it

Edit these token files directly (they're the single source of truth — no
separate brand config the templates read from):
- `modules/video-director-skills/routes/video-edit/remotion/src/templates/hfBrand.ts` (9:16 shorts)
- `modules/video-director-skills/routes/video-edit-longform/remotion/src/motion/tokens.ts` (16:9 long-form)
- `modules/video-director-skills/routes/motion-design-edit/remotion/src/templates/paperBrand.ts`'s
  `visual-os` style, if the user wants that option too — leave the `paper`
  style alone, it's an intentionally separate look (see EXECUTION.md's
  "Visual style" section)

Then write **`BRAND.md`** at the repo root recording what was chosen (colors
with hex values, fonts, any constraints) — this is the marker future
sessions check before re-running the wizard, and the reference if you want
to tweak one value later without re-deriving the whole palette.

---

## Folder conventions (per project)

```
$WORK/<name>/
├─ raw/                 source video(s) ONLY (untouched)
├─ refs/                references, logos, svgs, mascot clips
└─ outputs/
   ├─ <video>.enhanced.mp4     final (1080p)
   └─ previews/
      └─ <video>.preview.mp4   preview scratch (720p)
```
- **Working intermediates** live in `~/.cache/video-edit/<hash>/` (outside
  the repo — macOS permissions), *not* in the project.
- Renders route via the `OUT_DIR` env var (see EXECUTION.md) — never dump in `raw/`.

## Verify the install
```bash
cd modules/video-director-skills/routes/video-edit/remotion && npx tsc --noEmit   # templates typecheck
node -e 'console.log(require("./node_modules/remotion/package.json").version)'  # Remotion present
```

Then follow **[EXECUTION.md](execution.md)** to edit your first video.

---

## Assets

> **No media ships with this repo.** Every directory below arrives empty (just
> a `.gitkeep`) — no music, no SFX, no brand logos, no mascot art. That's
> deliberate: the only thing shipped here is code you can license freely, so
> you bring your own media and stay in control of its licensing. Nothing
> breaks in the meantime — a missing SFX cue is skipped, an empty `music/`
> renders unscored, and a missing mascot file just drops the mascot.

**SFX are shared across all three engines from one place: repo-root
`assets/sfx/` (module root)** (not inside any individual skill folder) — `video-edit`,
`video-edit-longform`, and `motion-design-edit` all resolve their SFX
directory to `assets/sfx/` (module root) (see each skill's `scripts/build_sfx_track.py`
and `scripts/score.sh`), so add or replace a cue once and every engine picks
it up.

| Thing | Where | Notes |
|---|---|---|
| **Mascot clips** | drop your own in `$WORK/<name>/refs/`, then stage to `modules/video-director-skills/routes/video-edit/remotion/public/mascots/` | animated `.mp4`s used by `hf_mascot` via `hf_clips`. A still `claude-mascot.png` in `remotion/public/` is used by `hf_mascot` / `hf_callout` when no clips are given — supply your own, or those beats render without a mascot. |
| **SFX** | `assets/sfx/` (module root) | Filenames are the contract (extension matters — scripts look for these exact names): `hook-whoosh.wav`, `hook-boom.wav`, `flare-hit.mp3`, `card-pop.wav`, and optionally `timeline-rise.wav`, `caption-tick.wav`, `caption-write.wav`, `click.wav`. None ship; a cue is silently skipped (not an error) if its file is missing. |
| **Brand logos** | `modules/video-director-skills/routes/video-edit{,-longform}/assets/logos/` | None ship. Put the person's own logo files here; `render.sh` does not download anything. |
| **Music** | `modules/video-director-skills/routes/video-edit/music/*.mp3` | No bed ships — add your own **licensed** tracks (naming spec in `knowledge/music_library.md`). An empty dir renders unscored, not broken. |

`video-edit-longform` and `motion-design-edit` share `video-edit`'s music
folder (see each skill's `scripts/score.sh`) the same way they share
`assets/sfx/` (module root) — add tracks in one place.
