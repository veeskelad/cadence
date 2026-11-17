Когда: нужен пошаговый порядок работы над одним роликом от исходника до финала.

# Video Pipeline — Execution Guide

How to edit one video end-to-end. Assumes you've done **[SETUP.md](setup.md)**
(including the one-time **Brand setup**, if you haven't run it yet).

Shorthand used below:
```
SKILL=modules/video-director-skills/routes/video-edit
PY="$(python3 scripts/module_setup.py python video-director-skills | python3 -c 'import sys,json;print(json.load(sys.stdin)["python"])')"; export VIDEO_DIRECTOR_PYTHON="$PY"
```
The **workdir** for a video is `~/.cache/video-edit/<stem>_<sha1[:12]>/` (printed
by `transcribe.py`). Your plan, captions, and words files live there.

---

## 0. Drop the source
Put the clip in `$WORK/<name>/raw/`.

**Phone video shot portrait?** It may be stored landscape + a `rotation=90` flag,
which the skill reads as landscape. Bake rotation first:
```bash
ffmpeg -i raw/clip.mp4 -vf "scale=1080:1920:flags=lanczos" -c:v libx264 -crf 18 \
  -c:a aac -metadata:s:v:0 rotate=0 -movflags +faststart raw/clip.portrait.mp4
```
Use the `.portrait.mp4` as your source from here on.

---

## 1. Transcribe → `words.json`
```bash
"$PY" "$SKILL/scripts/transcribe.py" $WORK/<name>/raw/<video>.mp4
# → writes <workdir>/words.json  (prints the workdir path)
```
Local WhisperX: offline, no key.
Read the transcript back against the audio and hand-patch wrong
words in `words.json` (keep `start`/`end`), ensuring `.polished` exists.

---

## 2. Author the beat plan
Create `<workdir>/broll_plan.json` — an array of beats. Each beat needs
`start_sec`, `end_sec`, `kind`, `reason`, plus that kind's fields. Add
`speech_anchor: "<exact spoken phrase>"` to snap the beat to the word boundary.

### Branded graphic kinds (`hf_*`, the shipped "Visual OS" preset)
| kind | required fields | optional | placement |
|---|---|---|---|
| `hf_callout` | `headline` | `eyebrow`, `pill`, `pill_color` ("accent") | overlay bug + mascot (bottom-left) |
| `hf_stat` | `value` | `eyebrow`, `label` | overlay card |
| `hf_title` | `headline` | `subhead` | **fullscreen** |
| `hf_chart` | `hf_items` (`"Label:val,Label:val"`) | `eyebrow`, `value`, `sub` | glass overlay |
| `hf_listicle` | `hf_items` (`"a,b,c"`) | `eyebrow` | **fullscreen** numbered list |
| `hf_card_list` | `hf_items` | `headline` | overlay rail |
| `hf_lower_third` | `name` | `role` | overlay plate |
| `hf_before_after` | `before_label`, `after_label` | — | **fullscreen** two-panel |
| `hf_mascot` | `headline` | `sub`, `hf_clips` (`["mascots/x.mp4", …]`) | **fullscreen** (animated montage if `hf_clips`) |

The engine's own native kinds (`stat_punch`, `word_pop`, `bar_chart`, timelines,
`subscribe`, …) also work — see `knowledge/template_library.md`.

**Rules of thumb:** open with an `hf_callout`/`hf_title` in the first ~0.5s;
overlays suppress captions while up (captions fill the gaps); leave ≥1.5s of
speaker between full-screen takeovers; keep ≤4 beats per 12s.

**Example beat:**
```json
{ "kind": "hf_chart", "start_sec": 19.9, "end_sec": 23.4,
  "eyebrow": "MOTION GRAPHICS", "value": "94%", "sub": "auto-built · on beat",
  "hf_items": "Auto-edit:40,Crop:25,Captions:20,Extras:15",
  "speech_anchor": "like bar charts",
  "reason": "glass chart payoff on 'bar charts and pie charts'" }
```

---

## 3. Lint (must pass)
```bash
$PY "$SKILL/scripts/lint_plan.py" <workdir>/broll_plan.json
```
Blocks blank/overlapping/too-dense plans. `SKIP_LINT=1` bypasses (test only).

---

## 4. Preview render (fast, iterate here)
```bash
OUT_DIR=$WORK/<name>/out \
CAPTION_EMPHASIS="phrase 1|phrase 2|phrase 3" \
  bash "$SKILL/scripts/render.sh" $WORK/<name>/raw/<video>.mp4
```
→ `$WORK/<name>/out/previews/<video>.preview.mp4` (720p, captions, no
audio score). Open it, tweak `broll_plan.json`, re-render (~15-20s). Repeat.

- `CAPTION_EMPHASIS` = 2-3 phrases highlighted in the captions (your brand's accent color).
- Captions auto-generate from `words.json`.

---

## 5. Final render (after you approve the preview)
```bash
OUT_DIR=$WORK/<name>/out QUALITY=final SCORE=0 \
CAPTION_EMPHASIS="phrase 1|phrase 2|phrase 3" \
  bash "$SKILL/scripts/render.sh" $WORK/<name>/raw/<video>.mp4
```
→ `$WORK/<name>/out/<video>.enhanced.mp4` (1080p, CRF 20, voice preserved).
`SCORE=0` = **no music** (music is bring-your-own — see SETUP.md). Never
auto-run final — only after explicit sign-off.

---

## 6. SFX (no music) — optional
Music isn't required, but SFX add energy. Keep it **sparse**.

1. Put SFX in the shared `assets/sfx/` (exact names — see SETUP.md; shared
   across `video-edit`, `video-edit-longform`, and `motion-design-edit`, not
   per-skill).
2. Build the timed track from the *rendered* beat times, then mix under the voice:
```bash
WD=<workdir>
cp "$WD/broll_plan.json" "$WD/broll_plan.presfx.json"
$PY "$SKILL/scripts/align_to_speech.py" "$WD/broll_plan.json" "$WD/words.json"
$PY "$SKILL/scripts/sync_list_items.py" "$WD/broll_plan.json" "$WD/words.json"
$PY "$SKILL/scripts/close_gaps.py"      "$WD/broll_plan.json"
$PY "$SKILL/scripts/build_sfx_track.py" "$WD/broll_plan.json" "$WD/captions_plan.json" 36.8 "$WD/sfx_track.wav"
cp "$WD/broll_plan.presfx.json" "$WD/broll_plan.json"   # restore authored plan

FINAL=$WORK/<name>/out/<video>.enhanced.mp4
ffmpeg -i "$FINAL" -i "$WD/sfx_track.wav" \
  -filter_complex "[0:a][1:a]amix=inputs=2:duration=first:normalize=0[m];[m]loudnorm=I=-14:TP=-1:LRA=11[a]" \
  -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k -movflags +faststart "$FINAL.sfx.mp4"
mv "$FINAL.sfx.mp4" "$FINAL"
```
`build_sfx_track.py` fires only on key beats (hook stack, listicle/mascot
entrances, stat + CTA pops) — don't add per-item pops.

## 6b. Music + SFX together — optional
Drop a **licensed** `.mp3` in `$SKILL/music/`, then render with `SCORE=1`
(instead of `SCORE=0`). `score.sh` lays the music bed (sidechain-ducked ~10dB
under the voice, with a swell into the climax) **and** the SFX in one pass.

---

## Re-branding
Run the "Brand setup" flow in SETUP.md once (writes `BRAND.md` + edits the
token files), or edit `hyperframes/src/templates/hfBrand.ts` (colors + the 3
fonts) directly → re-render. Every `hf_*` graphic updates together; no
per-template edits.

## Quick reference — what lands where
| Step | Output |
|---|---|
| transcribe | `<workdir>/words.json` |
| plan / lint | `<workdir>/broll_plan.json` |
| preview | `$WORK/<name>/out/previews/<video>.preview.mp4` |
| final | `$WORK/<name>/out/<video>.enhanced.mp4` |

---

# Long-form workflow (`video-edit-longform`)

Same loop as above but for 16:9 long-form, using the richer camera-driven
`viz` motion library instead of `hf_*` overlays. Shorthand: `F5=modules/video-director-skills/routes/video-edit-longform`.
Transcribe → author the beat plan with `viz`/native kinds (`$F5`'s
`knowledge/` + `template_library.md`) → lint → preview
`bash "$F5/scripts/render.sh"` with an absolute `OUT_DIR` → sign-off → final.
For a hero intro worth hand-crafting (not template-driven), see
`$F5/knowledge/bespoke_intro.md`'s Part 1 principles.

---

# Faceless motion-graphics workflow (`motion-design-edit`)

A separate pipeline for reels with **no camera** — every beat is a `pr_card`
/ `pr_punch` / `pr_proof` graphic timed to a voiceover recording, no talking
head at all. Uses its own skill at `modules/video-director-skills/routes/motion-design-edit/`
(shorthand below: `MSKILL=modules/video-director-skills/routes/motion-design-edit`). Read
`$MSKILL/knowledge/paper_style.md` first — it has the full design system and
the 5-part story structure every beat plan should follow.

## 0. Get a script + record VO
Write the script with the reel-script guide (`guides/reel-script.md`) (or by hand) in the
hook/credibility/reframe/numbered-tips/CTA structure, then record a
voiceover from it. Drop the VO in `$WORK/<name>/raw/`.

**Optional: `raw/captions.txt`** — the on-screen text, authored by the user
alongside the VO. Format: `LABEL:` headers (one per motion-phrase, in
chronological order) followed by one on-screen line per line of text;
`{word or phrase}` marks the accent-colored span; `#` = comment. Parse with
`python3 $MSKILL/scripts/parse_captions.py <path>`.

**This file is authoritative for wording.** When it's present, use its lines
verbatim as on-screen text — do not paraphrase or re-compress them. Claude's
job is layout, timing, and motion around exactly what's written; the words
themselves are the user's call. Timing still comes from the transcript
(`words.json` / `speech_anchor` fuzzy-matching) — caption text doesn't need
to match the spoken words verbatim, just land near where the phrase is said.
Without a captions.txt, fall back to compressing the transcript as before.

## 1. Build a blank base video with the VO muxed in
The render pipeline expects a video file (`pr_*` beats cover the whole frame
anyway, so a black frame is fine). Get the exact duration first — don't rely
on `-shortest` with an infinite lavfi source, it overshoots:
```bash
DUR=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 \
  $WORK/<name>/raw/<vo>.m4a)
ffmpeg -y -f lavfi -i "color=c=black:s=1080x1920:r=30" -i $WORK/<name>/raw/<vo>.m4a \
  -t "$DUR" -c:v libx264 -pix_fmt yuv420p -c:a aac -b:a 192k \
  $WORK/<name>/working/base.mp4
```

## 2. Transcribe
```bash
python3 "$MSKILL/scripts/transcribe.py" $WORK/<name>/working/base.mp4
```
Prints the workdir (`~/.cache/video-edit/<hash>/` — shared cache namespace
with `video-edit`, jobs are keyed by content hash so this is fine).
**Read the transcript back and check it against what was actually said** —
ASR mishears predictably (e.g. "instructions" → "injections"). Hand-patch
`words.json` directly for any wrong word, preserving `start`/`end`
timestamps, then `touch <workdir>/.polished` so a re-run doesn't overwrite
the fix.

## 3. Author `broll_plan.json`
**One idea, one cut — never two sentences on one card.** The single biggest
gap between a first-draft plan and something that actually feels crafted:
grouping the VO's natural sentences onto one card each time a topic doesn't
change. Split on (almost) every sentence boundary. Exception: the
`pr_punch` reframe beat (`pr_fullbleed: false`) is allowed two short
contrasting clauses on one card — that's the reference style's own pattern
for the "twist" moment (two halves of one realization landing together).

| kind | required fields | optional | notes |
|---|---|---|---|
| `pr_card` | `headline` | `eyebrow`, `strike`, `align` | the default "idea" beat. `{word}` bracket syntax accents one sub-span in punch orange (same convention as `word_pop`) |
| `pr_punch` | `value` | `label`, `pr_color`, `pr_fullbleed` | `pr_fullbleed` defaults true (single word/number full-bleed takeover); `pr_fullbleed: false` = centered boxed reframe card |
| `pr_proof` | — | `tag`, `image_path`, `caption`, `rotate` | taped index-card/polaroid. **Renders as a blank card without `image_path`** — source a real screenshot/photo before calling a render "done" |
| `pr_stack` | `lines` (`[{text, at}]`, `at` = sec **relative to beat start**, from words.json) | `chyron` | cinematic accumulating-lines scene on animated navy bg (drifting glows + particles). Lines ghost in dim, pop bright on their spoken moment. **Never give it a `speech_anchor`** — alignment shifting the beat start would break the relative line times. Use as hook/CTA bookends |
| `pr_chart` | `value`, `pr_bars` (`[{label,v,at,accent?}]`) | `label`, `annotation*`, `handoff`, `handoff_at` | a number becomes a picture: bars land at their `at`s, XL gradient numeral upper-right; `handoff` retreats the numeral to the corner for the next beat's `corner_stat` |
| `pr_terminal` | `lines` (`[{text,at,bad?,accent?}]`) | `title`, `boxed_label*`, `annotation*` | mac window typing real prompts; `bad` lines get struck, `accent` renders brand blue |
| `pr_checklist` | `check_items` (`[{text,at}]`) | `headline*`, `annotation*`, `layout` | items tick in one-by-one |
| `pr_equation` | `parts` (`[{text,at,op?,punch?}]`) | `eyebrow`, `annotation*`, `corner_stat`, `layout` | boxed formula terms land separately; `punch` = gradient box |

**Timed-layer fields on `pr_card` (MOTION-STYLE.md):** `layout` (left/upper-left/right/low — center must be earned), `scale` (m/l/xl), per-layer `*_at` times (`headline_at`, `eyebrow_at`, `strike_at`, `annotation_at`, `boxed_label_at`), `annotation`+`annotation_pos`, `boxed_label`, `rule_lines`, `bg_panel`, `corner_stat`, `seed`, `chyron`. `transition` on any pr beat: `cut` (default) / `wipe` / `push`.

All full-frame takeovers cover the **entire** timeline back to back from
frame 0 — there's no speaker, so no gaps to fill and no 1.5s "face-time"
floor before the first takeover (that rule is disabled for plans whose
first beat is a `pr_*` kind).

**Scene connection is automatic:** consecutive `pr_*` beats chain — the
outgoing scene stays alive ~0.5s under the incoming one, which travels in
**left→right** (cards/proof: push; punch/stack: brand-gradient panel wipe).
A persistent gradient progress bar runs along the bottom for the whole reel.
Keep beats butted (≤0.12s gap) or the chain breaks into a hard cut. Use
`speech_anchor` on every beat so `align_to_speech.py` snaps it to the actual
spoken words; set a generous hand-authored `end_sec` (through the next
beat's natural start) and let alignment + `close_gaps.py` tighten it.

## 4. Lint, then render
```bash
python3 "$MSKILL/scripts/lint_plan.py" <workdir>/broll_plan.json $WORK/<name>/working/base.mp4
bash "$MSKILL/scripts/series_pipeline.sh" <name> preview
```
→ `$WORK/<name>/out/previews/base.preview.mp4`, scored (music + SFX)
by default. Preview only, same rule as `video-edit`: never run `… final`
until the user has seen the preview and explicitly approved it. (Calling
`render.sh` directly still works for a quick one-off check — see "Recurring
series" below for when `series_pipeline.sh` is worth scaffolding a
`STYLE.md` around instead.)

## Visual style: Paper Brand vs Visual OS

`pr_*` graphics support two selectable token sets in
`$MSKILL/hyperframes/src/templates/paperBrand.ts`, resolved per-render from
`props.json`'s `prStyle` field (set via the `PR_STYLE` env var, which
`series_pipeline.sh` reads automatically from the project's `.pr_style`
file):

| Style | `.pr_style` value | Look |
|---|---|---|
| **Paper Brand** (default) | `paper` (or file absent) | Cream `#F1ECE0` bg, near-black `#231F1B` ink, punch-orange `#E8622C` accent, sans-serif throughout — the original paper-reel look |
| **Visual OS** | `visual-os` | The shipped example preset (or your customized brand, if you've run Brand setup) |

Ask the user which style at project scaffold time (make-video's Route C
intake) and write it once to `$WORK/<name>/.pr_style` — every subsequent
render for that project picks it up with no flags needed. One-off override
for a single render: `PR_STYLE=visual-os bash $MSKILL/scripts/render.sh …`.

## Recurring series (multi-episode projects)

Once a faceless project is going to produce more than one episode (not a
single one-off reel), scaffold two things instead of hand-running steps 0-4
fresh each time:

1. **`$WORK/<name>/STYLE.md`** — the creative contract: palette table
   (mirrors `.pr_style`'s choice), component rules (which `pr_*` kinds for
   which beat), the beat arc (HOOK → … → CTA), timing rules.
2. **The shared script**, not a per-project copy:
   ```bash
   bash modules/video-director-skills/routes/motion-design-edit/scripts/series_pipeline.sh <name> build raw/<vo>.m4a
   bash modules/video-director-skills/routes/motion-design-edit/scripts/series_pipeline.sh <name> preview
   bash modules/video-director-skills/routes/motion-design-edit/scripts/series_pipeline.sh <name> final
   ```
   Reads `.pr_style` automatically; `preview` and `final` are both scored
   (music + SFX) by default so a sign-off on the preview covers the full
   experience and `final` ships publish-ready. `FORCE_RENDER=1` bypasses the
   content-hash cache; `SCORE=0` skips scoring for a quick visual-only check.

Do **not** hand-copy `series_pipeline.sh` into the project folder and edit
its paths — that's the old pattern (it hardcoded `PROJECT_DIR` to one
project and couldn't be reused). The script takes the project name as its
first argument; there is exactly one copy, shared by every series.

## Known gaps
- `build_followcam.py` needs the module Python (`VIDEO_DIRECTOR_PYTHON`) — without it it
  warns and falls back to a static zoom automatically. Harmless; faceless
  videos don't need camera-follow anyway.
- `build_sfx_track.py`'s per-beat SFX cues (card pop / whoosh / tick) are
  keyed to `video-edit`/`hf_*` plan kinds, not `pr_*` — a `pr_*` render only
  gets the universal t=0 hook stack (whoosh/flare/boom), not per-beat pops.
  Music always works (score.sh auto-picks from `video-edit`'s music
  folder). Adapting per-beat cues to `pr_*` kinds is unstarted.
