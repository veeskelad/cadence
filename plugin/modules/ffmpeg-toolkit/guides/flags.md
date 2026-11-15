# Shared flags, codecs and dry-run

The long form of ffmpeg-skill.md's Quick start. `--help` on a script is still its full flag list;
`guides/scripts.md` covers most flags per tool.

## Running the scripts

Scripts live in `scripts/` next to ffmpeg-skill.md; run them with `python3 modules/ffmpeg-toolkit/scripts/<name>.py`, and delivery templates in `templates/`. ffmpeg-skill.md is enough to do a job: ffmpeg-skill.md's request table routes the request, and `--help` on the script about to run is the cheapest full flag list. A reference file costs as much as ffmpeg-skill.md; open one only for a question you have: `guides/scripts.md` (most flags; `--help` lists all), `guides/devices.md` (iPhone HDR, GoPro, DJI, screen recordings, Zoom), `guides/gotchas.md` (the long form of the one-line rules at the end of ffmpeg-skill.md).

## Shared flags

Shared flags (every script accepts them; the exceptions are named): `--dry-run` (`verify.py` ignores it); `--json` (output path, its probe, the commands run); `--json-brief` (status/output/verified + a `summary`); `--fast` (preview quality); `--progress` (%/ETA); `--timeout SECONDS` (`kind: timeout`; per ffmpeg run, default 1800, `verify.py` per step, default 600, `batch.py` one budget for the whole batch when `--timeout` is given or `--jobs` is above 1; `0` for hour-long encodes; below 0 or above 500000 is refused); `--overwrite` (step 7); `--plan FILE` (a dry run `render.py FILE` runs later; refuses a changed input; `render.py` and `verify.py` refuse `--plan`). `-o` is not shared: `probe`, `check`, `cropdetect`, `scenes`, `batch` and `verify` have none. Re-encoding tools also take `--hw` (Apple Silicon GPU, big files; `FFMPEG_SKILL_HW=1` = default, not export), `--codec h264|hevc|av1|prores` and `--quality N`: unset, SDR is x264 (`cut.py`: HEVC source stays HEVC, `--no-keep-hevc` x264), HDR is x265 Main10; `prores` needs `-o NAME.mov`, `h264` refuses HDR (`color.py --to-sdr` first).

## What `--dry-run` runs

Writing tools run no ffmpeg under `--dry-run` (ffprobe still reads an input that exists); the measuring tools (`probe` with `--analyze`, `check`, `sync`, `multicam`, `scenes`, `cropdetect`, `report`, `silence`, `loudness`, `stabilize`; `overlay` for a multi-line `--text` on FFmpeg 8.0-8.1.0; `metadata` with `--auto-chapters`; `cut` with `--snap beats`) still run their ffmpeg measurements, skipping artifacts/side files (`--edl`, `--sheet`, a generated `.ass`), and `render` and `batch` run each stage or step as its own dry run; `verify` ignores the flag. Per tool: `contract --json --tool NAME` `dry_run`.
