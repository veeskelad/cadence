Когда: есть запись голоса и нужен ролик без лица: бумажная сетка, плашки-акценты, карточки-доказательства. Маршрут C.

> **Sources of material.** The module downloads nothing by itself. Use the person's own screenshots, logos, footage and music. Where this guide says WebSearch, `curl`, stock libraries or image generation, that is a network or paid step: do it only after the person agrees, and say what was fetched. Output goes to `$WORK/<name>/out` (pass it as an absolute `OUT_DIR`).

# /motion-design-edit

Turns a voiceover recording into a rendered faceless reel in the "paper-reel" style: cream grid background, a hand-drawn connector line, solid punch-color interrupt cards, taped index-card proof shots. Read [knowledge/paper_style.md](../routes/motion-design-edit/knowledge/paper_style.md) first — it has the full design system (colors, the three graphic kinds, the 5-part story structure) and is the reference for every beat you author.

**This is a sibling of the `video-edit` skill, not a variant of it.** `video-edit` assumes a visible talking head and is full of rules about that (speaker matte, follow-cam, "text never overlays the face"). None of that applies here — there is no camera in the shot at all. Beats cover the **entire timeline, back to back, from frame 0**. Don't borrow `video-edit`'s hf_* kinds or its speaker-first rules into a plan here.

## What you need from the user

A voiceover recording (any ffmpeg-readable audio: m4a, wav, mp3). If they only have a topic, use the sibling `reel-script` skill first to write the script, have them record VO from it, then come back here.

## Pipeline

**1. Build a blank base video with the VO muxed in.** The render pipeline (borrowed from `video-edit`, which expects a video file) needs *something* to treat as the source — a black frame is fine since `pr_*` beats cover the whole frame anyway.

```bash
ffmpeg -y -f lavfi -i "color=c=black:s=1080x1920:r=30" -i "<vo.m4a>" \
  -t <exact audio duration from ffprobe> -c:v libx264 -pix_fmt yuv420p -c:a aac -b:a 192k \
  "<workdir>/base.mp4"
```

Get the exact duration first with `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1 <vo.m4a>` and pass it to `-t` explicitly — don't rely on `-shortest` with an infinite lavfi source, it overshoots.

**2. Transcribe.**

```bash
python3 scripts/transcribe.py "<workdir>/base.mp4"
```

Prints the `words.json` path (under `~/.cache/video-edit/<hash>/`, shared cache namespace with `video-edit` — that's fine, jobs are keyed by content hash). **Read the transcript back and check it against what was actually said** — Whisper mishears predictably (e.g. "instructions" → "injections", "Comment" → "Common" happened on the first test). Hand-patch `words.json` directly for any wrong word, preserving `start`/`end` timestamps, then `touch <workdir>/.polished` so a future re-run doesn't overwrite your fix.

**3. Author `broll_plan.json`** in the same workdir as `words.json`. This is the part that actually determines whether the video feels like the reference or not — read the next section before writing beats.

**4. Lint, then render.**

```bash
python3 scripts/lint_plan.py <workdir>/broll_plan.json <workdir>/base.mp4
bash scripts/render.sh <workdir>/base.mp4          # preview tier — always first
```

Preview only. Never pass `QUALITY=final` until the user has seen the preview and approved it — same rule as `video-edit`.

## Beat authoring — the part that's easy to get wrong

**One idea, one cut. Never two sentences on one card.** The single biggest gap between a first-draft plan and something that actually feels designed: grouping the VO's natural sentences onto one card each time a topic doesn't change. If the VO has "Most people use Claude Code wrong. Here's the fix." — that is **two beats**, not one. A card with two stacked sentences reads as a paragraph and kills the pacing; the reference cuts to a new card on almost every sentence boundary. When in doubt, split.

**Exception:** the REFRAME beat (`pr_punch`, `pr_fullbleed: false`) is allowed two short contrasting clauses on one card — that's the reference's own pattern for the "twist" moment (two halves of one realization landing together). Every other beat kind: one sentence.

**`pr_proof` needs a real image to not look broken.** Without `image_path` it renders as a blank taped rectangle — fine as a placeholder while you don't have an asset yet, but flag it to the user before calling a render "done." Source a real screenshot/photo/logo the same way `video-edit` does (WebSearch + WebFetch, real assets over generated ones) before finalizing.

**Use `speech_anchor` on every beat**, not hand-guessed `start_sec`/`end_sec` — `align_to_speech.py` snaps beats to the actual spoken words. Set generous `end_sec` (through the next beat's natural start) when hand-authoring initially; alignment + `close_gaps.py` tighten it automatically at render time.

Full kind reference, color tokens, and the 5-part story structure (hook → credibility → reframe → numbered tips → CTA) are in [knowledge/paper_style.md](../routes/motion-design-edit/knowledge/paper_style.md).

## Known gaps (fix if you hit them)

- `build_followcam.py` may fail when the module's Python is not set (`VIDEO_DIRECTOR_PYTHON`): it falls back to a static zoom automatically. Harmless, faceless videos don't need camera-follow anyway.
- WhisperX runs from the one module Python (`VIDEO_DIRECTOR_PYTHON`), shared by all routes; it is about 1.3 GB, do not duplicate it.
