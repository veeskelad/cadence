#!/usr/bin/env python3
"""Find existing stick-figure videos (HyperFrames projects made by new_video.py).

Usage:
    python find_projects.py [--path DIR] [--deep]

Looks in --path (if given), the current directory and its sub-folders (2 levels; 3 with --deep), and the
Cadence work folder. A video is a folder whose project.json says "kind": "stickman".

Prints JSON: {"node", "ffmpeg", "engine_ready", "videos": [{"dir", "slug", "size", "fps", "scenes", "rendered"}]}
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

MODULE = Path(__file__).resolve().parent.parent
CADENCE = MODULE.parent.parent
SKIP = {"node_modules", ".git", ".hyperframes", "out", "assets", "fonts", "src", "lib", ".venv", "venv"}


def tool_version(cmd):
    exe = shutil.which(cmd)
    if not exe:
        return None
    try:
        out = subprocess.run([exe, "--version"], capture_output=True, text=True, timeout=20)
        return (out.stdout.strip() or out.stderr.strip()).splitlines()[0]
    except Exception:
        return "found"


def inspect(d: Path):
    try:
        meta = json.loads((d / "project.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if meta.get("kind") != "stickman":
        return None
    return {
        "dir": str(d.resolve()),
        "slug": meta.get("slug"),
        "size": f"{meta.get('width')}x{meta.get('height')}",
        "fps": meta.get("fps"),
        "scenes": sorted(p.name for p in (d / "src").glob("S*.js")),
        "has_timeline": (d / "src" / "timeline.json").is_file(),
        "rendered": sorted(p.name for p in (d / "out").glob("*.mp4")),
    }


def walk(root: Path, depth: int):
    if not root.is_dir():
        return
    yield root
    if depth <= 0:
        return
    try:
        entries = list(os.scandir(root))
    except OSError:
        return
    for e in entries:
        if e.is_dir(follow_symlinks=False) and e.name not in SKIP and not e.name.startswith("."):
            yield from walk(Path(e.path), depth - 1)


def work_root():
    sys.path.insert(0, str(CADENCE / "scripts"))
    try:
        import cadence_paths  # noqa: PLC0415

        return Path(cadence_paths.work_root())
    except Exception:
        return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--path")
    ap.add_argument("--deep", action="store_true")
    a = ap.parse_args()
    extra = 1 if a.deep else 0
    roots = [Path(a.path).expanduser()] if a.path else []
    roots.append(Path.cwd())
    wr = work_root()
    if wr:
        roots.append(wr)
    seen, videos = set(), []
    for r in roots:
        for d in walk(r, 2 + extra):
            key = os.path.normcase(str(d.resolve()))
            if key in seen:
                continue
            seen.add(key)
            info = inspect(d)
            if info:
                videos.append(info)
    print(json.dumps({"cwd": os.getcwd(), "node": tool_version("node"), "ffmpeg": bool(shutil.which("ffmpeg")),
                      "engine_ready": (CADENCE / "engine" / "node_modules" / "hyperframes").is_dir(), "videos": videos},
                     ensure_ascii=False, indent=2))


if __name__ == "__main__":
    sys.exit(main())
