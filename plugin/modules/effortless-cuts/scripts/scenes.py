#!/usr/bin/env python3
"""Designed motion-graphics scenes, built as React components and composited as clips.

HyperFrames cards are text on a ground: a headline, a sub-line, a list. That
is the right form for most beats and stays where it is. A beat that needs a
*built* visual — a product card, a counter, a diagram assembling itself, a
simulated UI — is not a card, and forcing it into one is how a piece ends up
looking like a slideshow with a face attached (rules/motion.md).

Those beats are built as React components: frame-driven motion through the
frame runtime in templates/scenes/src/lib/frame.tsx (useCurrentFrame,
interpolate, spring, Sequence), no animation library and no clock. Each
approved scene is its own HyperFrames composition: build.mjs bundles it into a
project and the shared Cadence engine (engine/ at the Cadence root) renders it
to its own MP4. The MP4 is composited by compose.py through the same overlay
path B-roll uses, so captions still draw on top and the face still
repositions under a half-panel.

    python3 scripts/scenes.py init    --studio <footage>/studio
    python3 scripts/scenes.py sync    --studio <footage>/studio
    python3 scripts/scenes.py check   --studio <footage>/studio
    python3 scripts/scenes.py render  --studio <footage>/studio [--only <id>]
    python3 scripts/scenes.py studio  --studio <footage>/studio [--only <id>]

The approach, the per-scene composition rule and the spec-before-build gate are
adapted from Creatorberry's flick (MIT), which does this end to end:
https://github.com/Creatorberry/flick
"""

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from media import probe  # noqa: E402  (rotation-aware)

TEMPLATE = Path(__file__).resolve().parent.parent / "templates" / "scenes"
ID_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
# rules/motion.md: a shot that holds for more than about three seconds loses
# attention. A scene longer than this needs a second event inside it.
LONG_SCENE = 4.0
# rules/scenes.md: no animation library inside a scene; time is the frame.
# A scene imports React, the frame runtime and its own files, nothing else.
FORBIDDEN_IMPORTS = re.compile(
    r"""(?:from|import)\s+['"](?!\.|react(?:-dom)?(?:/|['"])|@cadence/frame['"])([^'"]+)['"]""")


def fail(msg):
    print(f"error: {msg}", file=sys.stderr)
    raise SystemExit(1)


def cut_video(studio):
    graded = studio / "cut_graded.mp4"
    video = graded if graded.is_file() else studio / "cut.mp4"
    if not video.is_file():
        fail(f"no cut at {video} — render the cut first")
    return video


def probe_fps(video):
    """Frame rate of the cut, as an exact ratio.

    A scene rendered at a different rate than the cut is resampled on
    composite: every few frames one is dropped or doubled, which reads as
    judder on exactly the moves that are supposed to look designed. Nothing
    errors, so it has to be checked here.
    """
    r = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=r_frame_rate", "-of", "csv=p=0", str(video)],
        capture_output=True, text=True)
    if r.returncode != 0:
        fail(f"ffprobe failed on {video}: {(r.stderr or '').strip()}")
    num, _, den = r.stdout.strip().partition("/")
    fps = float(num) / float(den or 1)
    rounded = round(fps)
    if abs(fps - rounded) > 0.02:
        fail(f"the cut is {fps:.3f} fps; scenes render at a whole-number rate. "
             f"Re-render the cut at {rounded} fps before building scenes")
    return rounded


def component_name(scene):
    if scene.get("component"):
        return scene["component"]
    return "".join(p.capitalize() for p in scene["id"].split("-"))


def read_scenes(studio):
    path = studio / "scenes.json"
    if not path.is_file():
        fail(f"no {path} — author it before building scenes (rules/scenes.md)")
    scenes = json.loads(path.read_text()).get("scenes", [])
    if not scenes:
        fail(f"{path} has no scenes")
    return scenes


def validate(scenes, fps, duration):
    seen, windows, warnings = set(), [], []
    for s in scenes:
        sid = s.get("id", "")
        if not ID_RE.match(sid):
            fail(f"scene id {sid!r} must be lowercase kebab-case")
        if sid in seen:
            fail(f"duplicate scene id {sid!r}")
        seen.add(sid)
        start, dur = float(s["start"]), float(s["duration"])
        if dur <= 0:
            fail(f"{sid}: duration must be positive")
        if start < 0 or start + dur > duration + 0.05:
            fail(f"{sid}: {start:.2f}–{start + dur:.2f}s falls outside the "
                 f"{duration:.2f}s cut")
        if round(dur * fps) < 1:
            fail(f"{sid}: {dur:.3f}s is shorter than one frame at {fps} fps")
        windows.append((start, start + dur, sid))
        if dur > LONG_SCENE:
            warnings.append(f"{sid} runs {dur:.1f}s — plan a second event "
                            f"inside it (rules/motion.md)")
    windows.sort()
    for (a_start, a_end, a_id), (b_start, _, b_id) in zip(windows, windows[1:]):
        if b_start < a_end - 0.01:
            fail(f"{a_id} and {b_id} overlap; one scene owns the frame at a "
                 f"time")
    return warnings


def spec(scenes, width, height, fps):
    return {
        "width": width, "height": height, "fps": fps,
        "scenes": [{
            "id": s["id"],
            "component": component_name(s),
            "start": round(float(s["start"]), 3),
            "duration": round(float(s["duration"]), 3),
            "durationInFrames": max(1, round(float(s["duration"]) * fps)),
            "full": bool(s.get("full")),
            "line": s.get("line", ""),
            "visual": s.get("visual", ""),
            "assets": s.get("assets", []),
        } for s in scenes],
    }


FONTS_IMPORT = "import {FONT_FACES} from './fonts';"


def root_tsx(scene_spec):
    """One composition per scene, generated — never hand-maintained.

    Hand-registering compositions is where a scene drifts from its spec: the
    component gets a new duration in the plan and Root.tsx keeps the old frame
    count, so the scene renders truncated and the render still succeeds.
    """
    names = sorted({s["component"] for s in scene_spec["scenes"]})
    imports = "\n".join(
        f"import {{{c}}} from './scenes/{c}';" for c in names)
    comps = "\n".join(
        f"  {json.dumps(s['id'])}: {{component: {s['component']} as Component, "
        f"fps: {scene_spec['fps']}, width: {scene_spec['width']}, "
        f"height: {scene_spec['height']}, "
        f"durationInFrames: {s['durationInFrames']}, fonts: FONT_FACES}},"
        for s in scene_spec["scenes"])
    return f"""// Generated by scripts/scenes.py — do not edit.
// Edit studio/scenes.json and re-run `scenes.py sync`.
import type {{CompositionSpec}} from '@cadence/frame';
{FONTS_IMPORT}
{imports}

type Component = CompositionSpec['component'];

// One composition per scene: the cut's size and frame rate, the scene's length.
export const COMPOSITIONS: Record<string, CompositionSpec> = {{
{comps}
}};
"""


def engine_dir():
    """The shared Cadence engine (HyperFrames): CADENCE_ENGINE, else engine/ at
    the Cadence root this module sits in, else an engine/ above the studio."""
    def is_engine(d):
        try:
            name = json.loads((d / "package.json").read_text()).get("name")
        except (OSError, ValueError):
            return False
        return name == "cadence-engine"

    if os.environ.get("CADENCE_ENGINE"):
        cands = [Path(os.environ["CADENCE_ENGINE"])]
    else:
        here = Path(__file__)
        cands = [here.absolute().parents[3] / "engine",
                 here.resolve().parents[3] / "engine",
                 *(d / "engine" for d in Path.cwd().absolute().parents)]
    for d in cands:
        if is_engine(d):
            if not (d / "node_modules" / "hyperframes").is_dir():
                fail(f"the Cadence engine at {d} has no HyperFrames installed — "
                     f"python3 scripts/engine_setup.py status (from the Cadence "
                     f"root); install it only with the person's consent")
            return d
    fail("no Cadence engine found — set CADENCE_ENGINE to its engine/ folder")


def workspace(studio):
    return studio / "scenes"


def do_init(studio, install=True):
    ws = workspace(studio)
    if (ws / "package.json").is_file():
        print(f"workspace already at {ws}")
    else:
        if not TEMPLATE.is_dir():
            fail(f"missing template at {TEMPLATE}")
        ws.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(TEMPLATE, ws, dirs_exist_ok=True)
        print(f"-> {ws}")
    scenes_json = studio / "scenes.json"
    if not scenes_json.is_file():
        scenes_json.write_text(json.dumps({"scenes": []}, indent=2) + "\n")
        print(f"-> {scenes_json} (author it, then run sync)")
    if install and not (ws / "node_modules").is_dir():
        print("installing scene packages (React, esbuild, TypeScript)…")
        r = subprocess.run(["npm", "install"], cwd=ws)
        if r.returncode != 0:
            fail("npm install failed")
    return 0


def do_sync(studio, quiet=False):
    ws = workspace(studio)
    if not (ws / "package.json").is_file():
        fail(f"no workspace at {ws} — run `scenes.py init` first")
    video = cut_video(studio)
    width, height, duration = probe(video)
    fps = probe_fps(video)
    scenes = read_scenes(studio)
    warnings = validate(scenes, fps, duration)
    s = spec(scenes, width, height, fps)
    (ws / "src" / "data").mkdir(parents=True, exist_ok=True)
    (ws / "src" / "data" / "scene-spec.json").write_text(
        json.dumps(s, indent=2) + "\n")
    (ws / "src" / "Root.tsx").write_text(root_tsx(s))
    missing = [x["component"] for x in s["scenes"]
               if not (ws / "src" / "scenes" / f"{x['component']}.tsx").is_file()]
    if not quiet:
        for w in warnings:
            print(f"  note: {w}")
        print(f"{len(s['scenes'])} scene(s) at {width}x{height} {fps}fps")
        for x in s["scenes"]:
            print(f"  {x['id']:<24} {x['start']:6.2f}s  "
                  f"{x['durationInFrames']:>4}f  "
                  f"{'full' if x['full'] else 'panel'}")
    if missing:
        print("\nno component yet for: " + ", ".join(sorted(set(missing))))
        print(f"write them in {ws / 'src' / 'scenes'} (see rules/scenes.md)")
    return s, missing


def banned_imports(ws):
    """Packages a scene may not import: anything but React, the frame runtime
    and its own files (an animation library brings its own clock)."""
    return [f"{p.relative_to(ws)}: {m.group(1)}"
            for p in sorted((ws / "src").rglob("*.ts*"))
            for m in FORBIDDEN_IMPORTS.finditer(p.read_text(errors="replace"))]


def do_check(studio):
    s, missing = do_sync(studio)
    if missing:
        fail("every scene needs its component before check can pass")
    ws = workspace(studio)
    banned = banned_imports(ws)
    if banned:
        fail("a scene imports a package outside React and '@cadence/frame' — "
             "drive everything from the frame: " + "; ".join(banned))
    print("\ntype-checking…")
    r = subprocess.run(["npx", "--yes", "tsc", "--noEmit"], cwd=ws,
                       capture_output=True, text=True, errors="replace")
    print((r.stdout or "")[-1500:].strip() or (r.stderr or "")[-800:].strip()
          or "clean")
    return 0 if r.returncode == 0 else 1


def has_audio(path):
    r = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries",
         "stream=index", "-of", "csv=p=0", str(path)],
        capture_output=True, text=True)
    return bool(r.stdout.strip())


def stream_info(path):
    """(width, height, fps, frames) of the first video stream, as encoded."""
    r = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-count_packets",
         "-show_entries", "stream=width,height,r_frame_rate,nb_read_packets",
         "-of", "json", str(path)], capture_output=True, text=True)
    st = (json.loads(r.stdout or "{}").get("streams") or [{}])[0]
    num, _, den = str(st.get("r_frame_rate", "0/1")).partition("/")
    fps = float(num or 0) / float(den or 1)
    return (st.get("width"), st.get("height"), round(fps, 3),
            int(st.get("nb_read_packets") or 0))


def merge_overlays(studio, rendered):
    """Hand the rendered scenes to compose.py through broll.json.

    Overlays authored by broll-gen are kept; only entries this script wrote
    before (source: "scene") are replaced, so re-rendering one scene does not
    drop the B-roll plan.
    """
    path = studio / "broll.json"
    data = json.loads(path.read_text()) if path.is_file() else {}
    existing = data.get("overlays", [])
    kept = [o for o in existing if o.get("source") != "scene"]
    mine = {o["id"]: o for o in existing if o.get("source") == "scene"}
    mine.update(rendered)
    data["overlays"] = sorted(kept + list(mine.values()),
                              key=lambda o: float(o["start"]))
    path.write_text(json.dumps(data, indent=2) + "\n")
    print(f"-> {path} ({len(data['overlays'])} overlay(s))")


def build_scene(ws, sid, out_dir):
    """build.mjs: one scene -> a HyperFrames project in out_dir."""
    r = subprocess.run(
        ["node", str(ws / "build.mjs"), str(ws), "--entry", "src/index.tsx",
         "--composition", sid, "--out", str(out_dir),
         "--node-modules", str(ws / "node_modules")],
        capture_output=True, text=True, errors="replace")
    for line in (r.stderr or "").splitlines():
        print(f"  {line}")
    if r.returncode != 0:
        fail(f"{sid}: build failed")
    return json.loads(r.stdout.strip().splitlines()[-1])


def ready_to_build(studio):
    s, missing = do_sync(studio, quiet=True)
    if missing:
        fail("missing component(s): " + ", ".join(sorted(set(missing))))
    ws = workspace(studio)
    if not (ws / "node_modules" / "react").is_dir():
        fail(f"no scene packages in {ws} — run `scenes.py init` (it installs "
             f"them)")
    banned = banned_imports(ws)
    if banned:
        fail("a scene imports a package outside React and '@cadence/frame': "
             + "; ".join(banned))
    return s, ws, engine_dir()


def do_render(studio, only=None):
    s, ws, engine = ready_to_build(studio)
    out_dir = studio / "assets" / "scenes"
    out_dir.mkdir(parents=True, exist_ok=True)
    targets = [x for x in s["scenes"] if only is None or x["id"] == only]
    if not targets:
        fail(f"no scene with id {only!r}")
    rendered = {}
    for x in targets:
        out = out_dir / f"{x['id']}.mp4"
        proj = ws / "out" / x["id"]
        print(f"rendering {x['id']}…")
        info = build_scene(ws, x["id"], proj)
        if info.get("sound"):
            # compose.py mounts every overlay with the `muted` attribute, so
            # audio baked into a scene is dropped without a warning and the
            # sting the scene was cut against is simply absent from the mix.
            fail(f"{x['id']} plays sound; scene audio is dropped on "
                 f"composite — plan the sting in sfx.json instead "
                 f"(HARD-RULES.md)")
        r = subprocess.run(
            ["npm", "--prefix", str(engine), "run", "--silent", "render", "--",
             str(proj.resolve()), "--fps", str(s["fps"]), "--crf", "16",
             "--workers", "1", "--output", str(out.resolve())],
            stdout=sys.stderr)
        if r.returncode != 0 or not out.is_file():
            fail(f"{x['id']} failed to render")
        if has_audio(out):
            fail(f"{x['id']}.mp4 carries an audio stream; scene audio is "
                 f"dropped on composite — plan the sting in sfx.json instead "
                 f"(HARD-RULES.md)")
        # HARD-RULES.md rule 15: the cut's size and rate, the scene's length.
        got = stream_info(out)
        want = (s["width"], s["height"], float(s["fps"]), x["durationInFrames"])
        if got != want:
            fail(f"{x['id']}.mp4 is {got[0]}x{got[1]} {got[2]:g}fps "
                 f"{got[3]} frames; the spec is {want[0]}x{want[1]} "
                 f"{want[2]:g}fps {want[3]} frames")
        shutil.rmtree(proj, ignore_errors=True)  # the build is regenerated each render
        rendered[x["id"]] = {
            "id": x["id"], "source": "scene",
            "file": str(Path("assets") / "scenes" / f"{x['id']}.mp4"),
            "start": x["start"], "end": round(x["start"] + x["duration"], 3),
            "full": x["full"],
        }
        print(f"  -> {out}")
    if (ws / "out").is_dir() and not any((ws / "out").iterdir()):
        (ws / "out").rmdir()
    merge_overlays(studio, rendered)
    print("\nnow run compose.py — the scenes composite under the captions")
    return 0


def do_studio(studio, only=None):
    """Preview one scene in the engine's studio (HyperFrames preview)."""
    s, ws, engine = ready_to_build(studio)
    sid = only or s["scenes"][0]["id"]
    if sid not in {x["id"] for x in s["scenes"]}:
        fail(f"no scene with id {sid!r}")
    proj = ws / "out" / sid
    build_scene(ws, sid, proj)
    print(f"opening the preview of {sid} (ctrl-c to stop)…")
    return subprocess.run(["npm", "--prefix", str(engine), "run", "preview",
                           "--", str(proj.resolve())]).returncode


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("command",
                    choices=["init", "sync", "check", "render", "studio"])
    ap.add_argument("--studio", default="studio")
    ap.add_argument("--only", default=None,
                    help="render or preview a single scene id")
    ap.add_argument("--no-install", action="store_true",
                    help="init without running npm install")
    args = ap.parse_args()
    studio = Path(args.studio)

    if args.command == "init":
        return do_init(studio, install=not args.no_install)
    if args.command == "sync":
        do_sync(studio)
        return 0
    if args.command == "check":
        return do_check(studio)
    if args.command == "render":
        return do_render(studio, args.only)
    return do_studio(studio, args.only)


if __name__ == "__main__":
    sys.exit(main())
