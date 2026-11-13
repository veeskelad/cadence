#!/usr/bin/env python3
"""Паспорт звуковых эффектов: длина, onset, пик, конец хвоста, доля низа, тональность, центроид.

onset и пик — как в sound_anchor.py и sounds/sounds.json: огибающая — среднее |x| в окне 10 мс по центру,
onset — первая точка выше 5 % максимума огибающей, пик — максимум огибающей.
Конец — последнее окно 10 мс громче пика −40 дБ. Низ — доля энергии ниже 60 Гц (её перегружает телефон).
Плоскостность спектра 100 Гц–8 кГц меньше 0,1 — звук тональный: у него есть высота нот, и под трек
с неизвестной тональностью он может прозвучать фальшиво. Шумовые whoosh и щелчки — выше 0,1.

  python3 sfx_probe.py <файл> [<файл> ...] [--library <папка>] [--json]

Относительные пути берутся от --library (папка с эффектами человека), без него — от текущей папки.
Нужны ffmpeg и numpy. Файлы только читаются.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np

SR = 48000
ANCHOR_SR = 44100
TONAL = 0.1


def decode(path: Path, sr: int = SR, channels: int = 1, highpass: float | None = None) -> np.ndarray:
    if not shutil.which("ffmpeg"):
        sys.exit("Нужен ffmpeg: без него файл не прочитать.")
    cmd = ["ffmpeg", "-v", "error", "-nostdin", "-i", str(path)]
    if highpass:
        cmd += ["-af", f"highpass=f={highpass}:poles=2,highpass=f={highpass}:poles=2"]
    cmd += ["-ac", str(channels), "-ar", str(sr), "-f", "f32le", "-"]
    proc = subprocess.run(cmd, capture_output=True)
    if proc.returncode != 0:
        sys.exit(f"{path}: ffmpeg не смог прочитать файл: {proc.stderr.decode(errors='replace').strip()[-300:]}")
    x = np.frombuffer(proc.stdout, np.float32)
    return x.reshape(-1, channels).copy() if channels > 1 else x.copy()


def anchors(mono: np.ndarray, sr: int = SR) -> tuple[float, float]:
    """(onset, peak) в секундах — то же определение, что в sound_anchor.py."""
    n = len(mono)
    if n == 0:
        return 0.0, 0.0
    k = max(1, int(sr * 0.010))
    half = k // 2
    prefix = np.concatenate(([0.0], np.cumsum(np.abs(mono.astype(np.float64)))))
    i = np.arange(n)
    lo = np.maximum(0, i - half)
    hi = np.minimum(n, i - half + k)
    env = (prefix[hi] - prefix[lo]) / k
    top = int(np.argmax(env))
    if env[top] <= 0:
        return 0.0, 0.0
    onset = int(np.argmax(env > 0.05 * env[top]))
    return onset / sr, top / sr


def anchor_points(path: Path) -> tuple[float, float]:
    """onset и пик файла как у sound_anchor.py: моно, 44,1 кГц. У шумового whoosh вершина — плато,
    и другая частота сдвинула бы пик внутри плато; так числа совпадают с sounds/sounds.json."""
    return anchors(decode(path, sr=ANCHOR_SR), ANCHOR_SR)


def passport(path: Path) -> dict:
    x = decode(path)
    if len(x) < SR // 100:
        sys.exit(f"{path}: файл короче 10 мс")
    onset, peak = anchor_points(path)
    hop, win = SR // 500, SR // 100
    xp = np.concatenate([x, np.zeros(win, np.float32)])
    n = max(1, len(x) // hop)
    db = 10 * np.log10(np.array([np.mean(xp[j * hop: j * hop + win] ** 2) for j in range(n)]) + 1e-12)
    loud = np.where(db > db.max() - 40)[0]
    end = (int(loud[-1]) * hop + win) / SR if len(loud) else len(x) / SR
    spec = np.abs(np.fft.rfft(x * np.hanning(len(x)))) ** 2 + 1e-20
    f = np.fft.rfftfreq(len(x), 1 / SR)
    band = (f > 100) & (f < 8000)
    flat = float(np.exp(np.mean(np.log(spec[band]))) / np.mean(spec[band])) if band.any() else 1.0
    return {
        "file": str(path), "length": round(len(x) / SR, 3), "onset": round(onset, 3), "peak": round(peak, 3),
        "end": round(min(end, len(x) / SR), 3), "peakDb": round(float(db.max()), 1),
        "lowShare": round(float(spec[f < 60].sum() / spec.sum()), 3),
        "flatness": round(flat, 3), "tonal": flat < TONAL,
        "centroidHz": round(float((f * spec).sum() / spec.sum())),
    }


def resolve(name: str, library: Path | None) -> Path:
    p = Path(name).expanduser()
    if not p.is_absolute() and library:
        p = library / p
    if not p.is_file():
        sys.exit(f"Нет файла: {p}")
    return p


def main() -> int:
    ap = argparse.ArgumentParser(description="Паспорт эффектов: onset, пик, хвост, низ, тональность")
    ap.add_argument("files", nargs="+")
    ap.add_argument("--library", type=Path, help="папка с эффектами: от неё считаются относительные пути")
    ap.add_argument("--json", action="store_true", help="напечатать JSON")
    a = ap.parse_args()
    lib = a.library.expanduser() if a.library else None
    rows = [passport(resolve(name, lib)) for name in a.files]
    if a.json:
        print(json.dumps(rows, ensure_ascii=False, indent=1))
        return 0
    for r in rows:
        mark = ""
        if r["tonal"]:
            mark = (" · тональный по числу, но короче 0,1 с: на слух высоты нет" if r["end"] - r["onset"] < 0.1
                    else " · ТОНАЛЬНЫЙ: под чужой трек не ставить")
        print(f"{r['file']}\n  длина {r['length']:.3f} с · onset {r['onset']:.3f} · пик {r['peak']:.3f} "
              f"({r['peakDb']:.1f} дБ) · конец {r['end']:.3f} · ниже 60 Гц {r['lowShare'] * 100:.0f} % · "
              f"плоскостность {r['flatness']:.3f} · центроид {r['centroidHz']} Гц{mark}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
