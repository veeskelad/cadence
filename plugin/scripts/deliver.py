#!/usr/bin/env python3
"""Сдача ролика: громкость к −14 LUFS без лимитера, пик не выше −1 dBFS, faststart.

Громкость поднимается или опускается одним усилением: не больше, чем позволяет пик.
Тихий ролик с громким эффектом останется тише −14 — это честнее, чем прижать пики лимитером
(звук «плющится»). Видео копируется без перекодирования. Исходник не меняется.

  python3 scripts/deliver.py <рендер.mp4> --out <готовый.mp4> [--target -14] [--peak -1]
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path


def measure(path: Path) -> tuple[float, float]:
    err = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', str(path), '-af', 'ebur128=peak=true', '-f', 'null', '-'],
                         capture_output=True, text=True).stderr
    summary = err[err.rfind('Summary:'):]
    lufs = float(re.search(r'I:\s+(-?[\d.]+) LUFS', summary).group(1))
    peak = float(re.search(r'Peak:\s+(-?[\d.]+) dBFS', summary).group(1))
    return lufs, peak


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('video', type=Path)
    ap.add_argument('--out', type=Path, required=True)
    ap.add_argument('--target', type=float, default=-14.0)
    ap.add_argument('--peak', type=float, default=-1.0)
    a = ap.parse_args()
    if not a.video.is_file():
        print(f'нет файла: {a.video}', file=sys.stderr)
        return 1
    if a.out.resolve() == a.video.resolve():
        print('--out совпадает с исходником: исходник не перезаписываю', file=sys.stderr)
        return 1
    lufs, peak = measure(a.video)
    gain = min(a.target - lufs, a.peak - peak)
    a.out.parent.mkdir(parents=True, exist_ok=True)
    # Кодек AAC сам поднимает пик на 0.3–0.6 дБ: меряем готовый файл и, если пик вылез, убавляем.
    for _ in range(3):
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(a.video), '-c:v', 'copy', '-af', f'volume={gain:.2f}dB',
                        '-c:a', 'aac', '-b:a', '256k', '-movflags', '+faststart', str(a.out)], check=True)
        l2, p2 = measure(a.out)
        if p2 <= a.peak:
            break
        gain -= p2 - a.peak + 0.1
    print(f'было {lufs:.1f} LUFS, пик {peak:.1f} dBFS → усиление {gain:+.1f} дБ → {l2:.1f} LUFS, пик {p2:.1f} dBFS: {a.out}')
    if l2 < a.target - 3:
        print('ролик тише цели: громкость упёрлась в пик. Сделай эффекты тише или музыку громче в сценарии и пересобери.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
