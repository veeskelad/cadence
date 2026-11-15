#!/usr/bin/env python3
"""Sanity-check a rendered video against its timeline.

usage: python check_render.py out/video.mp4 [--timeline src/slug/timeline.json] [--hits 5.9,61.5]

Reports duration (and the difference from the timeline), audio peak/RMS,
clipped samples, and the level around given hit times (seconds) compared with
the half second before them, so you can confirm SFX land on the action.
Needs ffmpeg/ffprobe and numpy.
"""
import argparse
import json
import subprocess

import numpy as np


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("--timeline")
    ap.add_argument("--hits", default="")
    a = ap.parse_args()
    dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", a.video], capture_output=True, text=True).stdout)
    rep = {"duration_s": round(dur, 2)}
    if a.timeline:
        with open(a.timeline, encoding="utf-8") as fh:
            tl = json.load(fh)
        rep["timeline_s"] = tl["seconds"]
        rep["delta_s"] = round(dur - tl["seconds"], 2)
    raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", a.video, "-vn", "-f", "f32le", "-ac", "1", "-ar", "8000", "-"], capture_output=True).stdout
    x = np.frombuffer(raw, np.float32)
    if len(x) == 0:
        rep["audio"] = "none"
    else:
        db = lambda v: round(float(20 * np.log10(max(float(v), 1e-9))), 1)
        rep["audio"] = {"peak_dBFS": db(abs(x).max()), "rms_dBFS": db(float(np.sqrt((x**2).mean()))), "clipped_samples": int((abs(x) >= 0.99).sum())}
        hits = [float(h) for h in a.hits.split(",") if h.strip()]
        rep["hits"] = []
        for h in hits:
            now = x[int(h * 8000) : int((h + 0.3) * 8000)]
            before = x[max(0, int((h - 0.6) * 8000)) : int((h - 0.1) * 8000)]
            if len(now) and len(before):
                rep["hits"].append({"t": h, "dB": db(abs(now).max()), "before_dB": db(abs(before).max())})
    print(json.dumps(rep, indent=2))


if __name__ == "__main__":
    main()
