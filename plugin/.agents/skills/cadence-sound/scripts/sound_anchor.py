#!/usr/bin/env python3
"""Опорные точки звукового файла: onset (где звук стал слышен) и peak (где он громче всего).

Мерит так же, как sounds/sounds.json: огибающая — среднее |x| в окне 10 мс по центру,
onset — первая точка выше 5 % максимума огибающей, peak — максимум огибающей.
Нужен только ffmpeg (декодирует любой формат), Python — стандартная библиотека.

  python3 sound_anchor.py <файл> [<файл> ...]            # таблица
  python3 sound_anchor.py <файл> --json                    # строки для film.json → sfx
  python3 sound_anchor.py <файл> --event 4.62 --anchor peak [--media-start 0]
                                                           # где начать клип, чтобы точка попала в 4,62 с
"""

from __future__ import annotations

import argparse
import json
import math
import shutil
import subprocess
import sys
from array import array
from pathlib import Path

SR = 44100
WINDOW = 0.010
THRESHOLD = 0.05


def decode(path: Path) -> array:
    if not shutil.which('ffmpeg'):
        sys.exit('Нужен ffmpeg: без него файл не прочитать.')
    cmd = ['ffmpeg', '-v', 'error', '-i', str(path), '-ac', '1', '-ar', str(SR), '-f', 's16le', '-']
    proc = subprocess.run(cmd, capture_output=True)
    if proc.returncode != 0:
        sys.exit(f'{path}: ffmpeg не смог прочитать файл: {proc.stderr.decode(errors="replace").strip()}')
    pcm = array('h')
    pcm.frombytes(proc.stdout[: len(proc.stdout) // 2 * 2])
    if sys.byteorder == 'big':
        pcm.byteswap()
    return pcm


def measure(path: Path) -> dict:
    x = decode(path)
    n = len(x)
    if n == 0:
        sys.exit(f'{path}: в файле нет звука')
    k = max(1, int(SR * WINDOW))
    half = k // 2
    # префиксные суммы |x| → среднее в окне k с центром в каждой точке (как np.convolve 'same')
    prefix = [0] * (n + 1)
    s = 0
    for i, v in enumerate(x):
        s += -v if v < 0 else v
        prefix[i + 1] = s
    env = [0.0] * n
    top = 0.0
    top_i = 0
    for i in range(n):
        lo = max(0, i - half)
        hi = min(n, i - half + k)
        val = (prefix[hi] - prefix[lo]) / k
        env[i] = val
        if val > top:
            top, top_i = val, i
    if top == 0:
        sys.exit(f'{path}: файл беззвучный')
    limit = THRESHOLD * top
    onset_i = next(i for i, v in enumerate(env) if v > limit)
    peak_abs = max(abs(v) for v in x) / 32768
    return {
        'file': str(path),
        'onset': round(onset_i / SR, 3),
        'peak': round(top_i / SR, 3),
        'length': round(n / SR, 3),
        'peakDb': round(20 * math.log10(max(peak_abs, 1e-9)), 1),
    }


def main() -> None:
    ap = argparse.ArgumentParser(description='onset и пик звукового файла; начало клипа под событие')
    ap.add_argument('files', nargs='+', type=Path)
    ap.add_argument('--json', action='store_true', help='напечатать JSON для поля sfx в film.json')
    ap.add_argument('--event', type=float, help='время события в ролике, с')
    ap.add_argument('--anchor', choices=['onset', 'peak'], default='peak', help='какую точку файла ставить на событие')
    ap.add_argument('--media-start', type=float, default=0.0, help='с какого места файла начинать клип, с')
    a = ap.parse_args()

    rows = []
    for f in a.files:
        if not f.is_file():
            sys.exit(f'Нет файла: {f}')
        rows.append(measure(f))

    if a.json:
        print(json.dumps({Path(r['file']).stem: {'src': r['file'], 'onset': r['onset'], 'peak': r['peak'], 'volume': 0.5}
                          for r in rows}, ensure_ascii=False, indent=1))
        return

    for r in rows:
        print(f"{r['file']}\n  длина {r['length']:.3f} с · тишина в начале {r['onset']:.3f} с · "
              f"onset {r['onset']:.3f} с · пик {r['peak']:.3f} с · пиковый уровень {r['peakDb']} dBFS")
        if a.event is None:
            continue
        point = r[a.anchor]
        if a.media_start > point:
            print(f'  --media-start {a.media_start} позже точки {a.anchor} ({point}): точка вырезана, выберите меньше')
            continue
        start = a.event - (point - a.media_start)
        print(f'  {a.anchor} на {a.event:.3f} с → клип начать в {start:.3f} с (кадр {round(start * 30)} при 30 fps), '
              f'вход в файл {a.media_start:.3f} с')
        if start < 0:
            print(f'  Начало отрицательное: подводка длиннее, чем время до события. '
                  f'Начните файл с {point - a.event:.3f} с (--media-start) или возьмите короче.')


if __name__ == '__main__':
    main()
