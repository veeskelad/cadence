#!/usr/bin/env python3
"""Cut the speaker out of a clip -> VP9 webm with an alpha channel.

    python kit/cutout.py <clip.mp4> <out.webm> [--quality balanced|accurate|fast]

The webm lines up frame for frame with the clip, so a skill can put graphics BEHIND the speaker (background video,
then the graphics, then this cutout on top). The mask comes from the person segmentation built into macOS (Vision):
nothing is downloaded, the helper `kit/person_matte.swift` is compiled once with the system `swiftc` into the
module cache. `balanced` is the default and is stable from frame to frame; `accurate` is cleaner around hair and
hands and about three times slower. On Linux the mask comes from MediaPipe selfie segmentation (Apache-2.0; the model
ships inside the pip package, nothing else is downloaded): `pip install mediapipe` via module_setup.
"""
import argparse
import hashlib
import json
import os
import platform
import shutil
import subprocess
import sys
import time
from pathlib import Path

import numpy as np

KIT = Path(__file__).resolve().parent
SWIFT = KIT / 'person_matte.swift'


def helper() -> Path:
    """Скомпилировать person_matte один раз на версию исходника: кэш ~/.cache/cadence/modules/."""
    if not shutil.which('swiftc'):
        sys.exit('нет swiftc: поставить Xcode Command Line Tools (xcode-select --install), сеть — только с согласия человека')
    tag = hashlib.sha256(SWIFT.read_bytes()).hexdigest()[:12]
    cache = Path(os.environ.get('XDG_CACHE_HOME') or Path.home() / '.cache') / 'cadence' / 'modules'
    exe = cache / f'video-editing-skills-matte-{tag}'
    if not exe.exists():
        cache.mkdir(parents=True, exist_ok=True)
        tmp = exe.with_suffix('.partial')
        subprocess.run(['swiftc', '-O', str(SWIFT), '-o', str(tmp)], check=True)
        tmp.rename(exe)
    return exe


def probe(clip):
    s = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries',
                                            'stream=width,height,r_frame_rate,nb_frames', '-of', 'json', str(clip)]))['streams'][0]
    a, b = s['r_frame_rate'].split('/')
    return s['width'], s['height'], float(a) / float(b), int(s.get('nb_frames') or 0)


class VisionMatte:
    """macOS: встроенная сегментация Vision через person_matte (кадр BGRA в stdin, маска в stdout)."""

    def __init__(self, w, h, quality):
        self.w, self.h = w, h
        self.proc = subprocess.Popen([str(helper()), str(w), str(h), quality], stdin=subprocess.PIPE, stdout=subprocess.PIPE)

    def __call__(self, bgra_bytes):
        self.proc.stdin.write(bgra_bytes)
        self.proc.stdin.flush()
        a = self.proc.stdout.read(self.w * self.h)
        if len(a) < self.w * self.h:
            sys.exit('сегментация кадра не удалась')
        return np.frombuffer(a, np.uint8).reshape(self.h, self.w)

    def close(self):
        self.proc.stdin.close()
        self.proc.wait()


class MediaPipeMatte:
    """Linux и прочие: сегментация MediaPipe (Apache-2.0), модель внутри pip-пакета."""

    def __init__(self, w, h, quality):
        try:
            import mediapipe as mp
        except ImportError:
            sys.exit('нет mediapipe: python3 scripts/module_setup.py install video-editing-skills (сеть — с согласия человека)')
        self.w, self.h = w, h
        # 0 — общая модель 256x256, 1 — альбомная, быстрее; для вертикального говорящего лучше общая
        self.seg = mp.solutions.selfie_segmentation.SelfieSegmentation(model_selection=1 if quality == 'fast' else 0)
        self.prev = None

    def __call__(self, bgra_bytes):
        bgra = np.frombuffer(bgra_bytes, np.uint8).reshape(self.h, self.w, 4)
        m = self.seg.process(np.ascontiguousarray(bgra[..., 2::-1])).segmentation_mask
        if self.prev is not None:  # лёгкое сглаживание во времени, иначе край дрожит
            m = 0.6 * m + 0.4 * self.prev
        self.prev = m
        return (np.clip((m - 0.35) / 0.3, 0, 1) * 255).astype(np.uint8)

    def close(self):
        self.seg.close()


def cutout(clip, out, quality='balanced'):
    w, h, fps, n = probe(clip)
    matte = (VisionMatte if platform.system() == 'Darwin' else MediaPipeMatte)(w, h, quality)
    dec = subprocess.Popen(['ffmpeg', '-v', 'error', '-i', str(clip), '-f', 'rawvideo', '-pix_fmt', 'bgra', '-'],
                           stdout=subprocess.PIPE)
    enc = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', f'{w}x{h}',
                            '-r', f'{fps:.6f}', '-i', '-', '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-b:v', '0',
                            '-crf', '22', '-deadline', 'good', '-cpu-used', '4', '-row-mt', '1', '-auto-alt-ref', '0',
                            str(out)], stdin=subprocess.PIPE)
    size, i, t0 = w * h * 4, 0, time.time()
    while True:
        buf = dec.stdout.read(size)
        if len(buf) < size:
            break
        a = matte(buf)
        bgra = np.frombuffer(buf, np.uint8).reshape(h, w, 4)
        rgba = np.dstack([bgra[..., 2], bgra[..., 1], bgra[..., 0], a])
        enc.stdin.write(rgba.tobytes())
        i += 1
        if i % 30 == 0:
            print(f'  cutout {i}/{n or "?"} frames  {(time.time() - t0) / i:.2f}s/frame', flush=True)
    matte.close()
    enc.stdin.close()
    enc.wait()
    dec.wait()
    if enc.returncode:
        sys.exit('ffmpeg could not write the cutout')
    print(f'wrote {out}  ({i} frames, {time.time() - t0:.0f}s)')
    return Path(out)


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('clip')
    ap.add_argument('out')
    ap.add_argument('--quality', default='balanced', choices=['balanced', 'accurate', 'fast'])
    a = ap.parse_args()
    cutout(a.clip, a.out, a.quality)
