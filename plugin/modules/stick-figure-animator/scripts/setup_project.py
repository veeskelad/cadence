#!/usr/bin/env python3
"""Prepare a folder as a stick-figure video project for the shared Cadence engine (HyperFrames).

Usage:
    python setup_project.py --dir PATH [--size 1920x1080] [--fps 30] [--update-engine]

A video project is one HyperFrames page:
    index.html            the page (frame = function of time, no animation library)
    render.mjs            fills index.html (sound, fonts, size) and renders / makes contact sheets
    project.json          size, fps, slug and where the Cadence engine lives
    src/stickman/*.js     the engine (characters, effects, stage, props)
    src/*.js              the video: scenes, timeline, cues (new_video.py adds them)
    lib/motion.js         time binding from the engine
    fonts/                Bangers, Oswald, Inter Tight (OFL) and fonts.css
    assets/               music, sfx/*.wav, voiceover (gen_audio.py writes here)
    out/                  renders and contact sheets

* Missing or empty PATH: the project is created. Nothing is downloaded: the engine is engine/ at the
  Cadence root (python3 scripts/engine_setup.py status).
* PATH already a stick-figure project: nothing changes, unless --update-engine refreshes the engine copy,
  fonts, lib/, render.mjs and index.html (scenes in src/ and assets/ are never touched).
* PATH not empty and not a stick-figure project: refused (exit 3), so nobody's folder gets mixed up.
"""
import argparse
import json
import re
import shutil
import sys
from pathlib import Path

MODULE = Path(__file__).resolve().parent.parent
CADENCE = MODULE.parent.parent
ENGINE_SRC = MODULE / "assets" / "engine"
PROJECT_SRC = MODULE / "assets" / "project"
FONTS_SRC = MODULE / "assets" / "fonts"
ENGINE_FONTS = {"Oswald": "oswald", "Inter Tight": "inter-tight"}


def is_project(d: Path) -> bool:
    try:
        return json.loads((d / "project.json").read_text(encoding="utf-8")).get("kind") == "stickman"
    except (OSError, ValueError):
        return False


def fonts_css(engine: Path) -> str:
    """Bangers from the module, Oswald and Inter Tight blocks from engine/fonts/fonts.css."""
    out = ["@font-face {\n  font-family: 'Bangers';\n  font-style: normal;\n  font-display: block;\n  font-weight: 400;\n"
           "  src: url(./Bangers-Regular.ttf) format('truetype');\n}\n"]
    css = (engine / "fonts" / "fonts.css").read_text(encoding="utf-8")
    for family in ENGINE_FONTS:
        blocks = re.findall(r"@font-face\s*\{[^}]*font-family:\s*'" + re.escape(family) + r"';[^}]*\}", css)
        if not blocks:
            sys.exit(f"engine/fonts/fonts.css has no {family}: update the Cadence engine")
        out += [b + "\n" for b in blocks]
    return "\n".join(out)


def copy_runtime(d: Path, engine: Path) -> None:
    (d / "src" / "stickman").mkdir(parents=True, exist_ok=True)
    for f in ENGINE_SRC.glob("*.js"):
        shutil.copy2(f, d / "src" / "stickman" / f.name)
    (d / "lib").mkdir(exist_ok=True)
    shutil.copy2(engine / "lib" / "motion.js", d / "lib" / "motion.js")
    fonts = d / "fonts"
    fonts.mkdir(exist_ok=True)
    for f in FONTS_SRC.iterdir():
        shutil.copy2(f, fonts / f.name)
    for folder in ENGINE_FONTS.values():
        shutil.copytree(engine / "fonts" / folder, fonts / folder, dirs_exist_ok=True)
    (fonts / "fonts.css").write_text(fonts_css(engine), encoding="utf-8")
    for f in PROJECT_SRC.iterdir():
        shutil.copy2(f, d / f.name)
    # src/*.js are ES modules: render.mjs imports them in Node too (no packages, only the module type)
    pkg = d / "package.json"
    if not pkg.exists():
        pkg.write_text(json.dumps({"private": True, "type": "module"}, indent=2) + "\n", encoding="utf-8")


def setup(d: Path, size: str = "1920x1080", fps: int = 30, update: bool = False, slug: str | None = None) -> dict:
    engine = CADENCE / "engine"
    if not (engine / "lib" / "motion.js").is_file():
        sys.exit(f"Cadence engine not found at {engine}")
    w, h = (int(x) for x in size.lower().split("x"))
    if is_project(d):
        if update:
            copy_runtime(d, engine)
            print("engine, fonts, lib/, render.mjs and index.html refreshed in", d)
        else:
            print("project already set up:", d, "(use --update-engine to refresh the engine copy)")
    elif d.exists() and any(d.iterdir()):
        print(f"{d} is not empty and is not a stick-figure project: not touching it. Choose another folder.")
        sys.exit(3)
    else:
        d.mkdir(parents=True, exist_ok=True)
        copy_runtime(d, engine)
        for sub in ("assets/sfx", "out"):
            (d / sub).mkdir(parents=True, exist_ok=True)
        (d / ".gitignore").write_text("out/\nassets/mix/\n.hyperframes/\n", encoding="utf-8")
        meta = {"kind": "stickman", "slug": slug or d.name, "width": w, "height": h, "fps": fps,
                "cadenceRoot": str(CADENCE.resolve())}
        (d / "project.json").write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")
        print("created", d)
    engine_ready = (engine / "node_modules" / "hyperframes").is_dir()
    return {"dir": str(d), "engine": str(engine), "engine_ready": engine_ready}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", required=True)
    ap.add_argument("--size", default="1920x1080")
    ap.add_argument("--fps", type=int, default=30)
    ap.add_argument("--update-engine", action="store_true")
    a = ap.parse_args()
    print(json.dumps(setup(Path(a.dir).expanduser().resolve(), a.size, a.fps, a.update_engine)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
