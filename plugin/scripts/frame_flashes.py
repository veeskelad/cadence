#!/usr/bin/env python3
"""Вспышки и пропадания на один кадр в готовом ролике. Только читает файл.

    python3 scripts/frame_flashes.py work/<проект>/out/reel.mp4
    python3 scripts/frame_flashes.py reel.mp4 --allow 3.2,8.27 --json work/<проект>/check/flashes.json

Ролик уменьшается до серых кадров 64×114 и проверяется двумя сигналами:
- вспышка (стоп): средняя яркость кадра прыгает и сразу возвращается — белый или чёрный кадр,
  мигание всей сцены на стыке;
- пятно на кадр (внимание): заметная часть кадра меняется только на один кадр, а соседние кадры
  в этом месте одинаковые — предмет пропал или выскочил на кадр. Быстрый предмет на ровном фоне
  даёт то же самое, поэтому это повод открыть кадр, а не провал.
Задуманную вспышку перечислить в --allow (секунды, допуск ±1,5 кадра).
Мелкий значок (меньше ≈0,6 % кадра) детектор не видит — его ловят глазами.
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from cadence_paths import (  # noqa: E402
    CadenceError, ffmpeg_cmd, main_guard, probe, require_input, video_fps, write_json,
)

SAMPLE_W, SAMPLE_H = 64, 114


def _np():
    try:
        import numpy
    except ImportError as exc:
        raise CadenceError("Нет numpy: python3 -m pip install -r requirements.txt", code=3) from exc
    return numpy


def find_luma_flashes(luma, fps: float, min_step: float = 12.0, median_factor: float = 6.0) -> dict:
    """Кадры, где средняя яркость скачет туда и сразу обратно. luma — ряд 0–255 по кадрам."""
    np = _np()
    luma = np.asarray(luma, dtype=float)
    steps = np.abs(np.diff(luma)) if len(luma) > 1 else np.zeros(0)
    threshold = max(min_step, (float(np.sort(steps)[len(steps) // 2]) if len(steps) else 0.0) * median_factor)
    found = []
    for i in range(1, len(luma) - 1):
        up, down = luma[i] - luma[i - 1], luma[i] - luma[i + 1]
        around = abs(luma[i - 1] - luma[i + 1])
        if np.sign(up) == np.sign(down) and abs(up) > threshold and abs(down) > threshold and around < threshold / 3:
            found.append({'frame': i, 'time': round(i / fps, 3), 'step': round(float(min(abs(up), abs(down))), 1)})
    return {'threshold': round(threshold, 1), 'found': found}


def find_local_blinks(frames, fps: float, pixel_delta: int = 40, neighbour_tolerance: int = 12,
                      min_share: float = 0.006) -> list[dict]:
    """Пятна на один кадр. frames — массив (кадры × пиксели) серых значений.

    Пиксель «одиночный», если он отличается от обоих соседних кадров больше чем на pixel_delta,
    а соседи между собой почти равны. Быстрое движение даёт серию таких кадров подряд —
    её отбрасываем, оставляем одиночные кадры.
    """
    np = _np()
    f = np.asarray(frames, dtype=np.int16)
    found = []
    if len(f) >= 3:
        prev, cur, nxt = f[:-2], f[1:-1], f[2:]
        lonely = (np.abs(cur - prev) > pixel_delta) & (np.abs(cur - nxt) > pixel_delta) & (np.abs(prev - nxt) < neighbour_tolerance)
        share = lonely.mean(axis=1)
        for k in np.nonzero(share >= min_share)[0]:
            i = int(k) + 1
            found.append({'frame': i, 'time': round(i / fps, 3), 'share': round(float(share[k]) * 100, 2)})
    flagged = {b['frame'] for b in found}
    return [b for b in found if not any(b['frame'] + d in flagged for d in (-2, -1, 1, 2))]


def drop_allowed(items: list[dict], allow: list[float], fps: float) -> list[dict]:
    tolerance = 1.5 / fps
    return [it for it in items if not any(abs(it['time'] - t) <= tolerance for t in allow)]


def read_frames(path: Path):
    np = _np()
    fps = video_fps(probe(path))
    if fps <= 0:
        raise CadenceError(f"Не понял частоту кадров у {path.name}")
    proc = subprocess.run(ffmpeg_cmd('-v', 'error', '-i', path, '-map', '0:v:0',
                                     '-vf', f'scale={SAMPLE_W}:{SAMPLE_H}:flags=area,format=gray',
                                     '-f', 'rawvideo', '-'), capture_output=True)
    if proc.returncode != 0:
        raise CadenceError(f"ffmpeg не прочитал кадры {path.name}: {proc.stderr.decode(errors='replace')[-400:]}")
    size = SAMPLE_W * SAMPLE_H
    raw = np.frombuffer(proc.stdout, dtype=np.uint8)
    count = len(raw) // size
    return fps, raw[:count * size].reshape(count, size)


def analyse(path: Path, allow: list[float] | None = None) -> dict:
    allow = allow or []
    fps, frames = read_frames(path)
    luma = frames.mean(axis=1) if len(frames) else []
    flashes = find_luma_flashes(luma, fps)
    flash_frames = {f['frame'] for f in flashes['found']}
    blinks = [b for b in find_local_blinks(frames, fps) if b['frame'] not in flash_frames]
    return {'file': path.name, 'fps': round(fps, 3), 'frames': int(len(frames)),
            'flashThreshold': flashes['threshold'],
            'flashes': drop_allowed(flashes['found'], allow, fps),
            'blinks': drop_allowed(blinks, allow, fps)}


def parse_allow(value: str | None) -> list[float]:
    out = []
    for part in (value or '').split(','):
        try:
            out.append(float(part))
        except ValueError:
            pass
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description='Вспышки и пропадания на один кадр в готовом ролике.')
    ap.add_argument('video')
    ap.add_argument('--allow', help='задуманные вспышки, секунды через запятую')
    ap.add_argument('--json', help='куда записать отчёт JSON')
    args = ap.parse_args()
    path = require_input(args.video, 'ролик')
    report = analyse(path, parse_allow(args.allow))
    if args.json:
        write_json(Path(args.json).expanduser(), report)
    print(f"{report['frames']} кадров, {report['fps']} к/с; вспышек: {len(report['flashes'])}, "
          f"пятен на кадр: {len(report['blinks'])}")
    for f in report['flashes']:
        print(f"  стоп      вспышка {f['time']} с (кадр {f['frame']}), скачок яркости {f['step']}")
    for b in report['blinks']:
        print(f"  внимание  пятно на один кадр {b['time']} с (кадр {b['frame']}), {b['share']} % кадра — открыть кадр")
    return 1 if report['flashes'] else 0


if __name__ == '__main__':
    main_guard(main)
