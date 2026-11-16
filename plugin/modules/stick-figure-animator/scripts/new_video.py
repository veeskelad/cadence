#!/usr/bin/env python3
"""Create a new stick-figure video: a HyperFrames project with the engine and the scene template.

usage:
    python new_video.py --project PATH --slug my-video [--size 1920x1080] [--fps 30] [--seconds 60]

* the video lives in PATH/<slug>/ (setup_project.py prepares it: engine, fonts, index.html, render.mjs)
* copies assets/template/*.js to PATH/<slug>/src/ (never overwrites existing files)
* writes a placeholder src/timeline.js (--seconds long) if parse_input.py has not run yet
* PATH/<slug>/assets/ is for music, sfx/*.wav and the voiceover (gen_audio.py --out PATH/<slug>/assets)

Render from the video folder: node render.mjs (see guides/stickman-video.md).
"""
import argparse
import json
import re
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
TEMPLATE = HERE.parent / "assets" / "template"
sys.path.insert(0, str(HERE))
from parse_input import JS_HEADER  # noqa: E402  same format as the real timeline
from setup_project import setup  # noqa: E402


def placeholder_timeline(path: Path, seconds: float, fps: int) -> None:
    tl = {"fps": fps, "durationInFrames": int(seconds * fps), "seconds": seconds, "cues": [], "chapters": []}
    path.write_text(JS_HEADER + json.dumps(tl, indent=2) + ";\n", encoding="utf-8")
    path.with_suffix(".json").write_text(json.dumps(tl, indent=1) + "\n", encoding="utf-8")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--project", required=True, help="folder that holds the videos of this project")
    ap.add_argument("--slug", required=True)
    ap.add_argument("--size", default="1920x1080")
    ap.add_argument("--fps", type=int, default=30)
    ap.add_argument("--seconds", type=float, default=60)
    a = ap.parse_args()
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]*", a.slug):
        sys.exit("slug: lowercase letters, digits and dashes only (e.g. petrodollar-explainer)")
    video = Path(a.project).expanduser().resolve() / a.slug
    info = setup(video, a.size, a.fps, slug=a.slug)
    src = video / "src"
    for f in TEMPLATE.iterdir():
        out = src / f.name
        if not out.exists():
            shutil.copy2(f, out)
    tl = src / "timeline.js"
    if not tl.exists():
        placeholder_timeline(tl, a.seconds, a.fps)
    print(json.dumps({"video": str(video), "src": str(src), "assets": str(video / "assets"),
                      "render": f"node {video / 'render.mjs'}", "engine_ready": info["engine_ready"]}, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
