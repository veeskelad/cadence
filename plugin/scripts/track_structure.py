#!/usr/bin/env python3
"""Структура трека для монтажа по долям: темп, первая доля, дроп, брейки, фразы.

Только ffmpeg, numpy и scipy. Работает локально, в сеть не ходит.

Что считает:
- темп — по автокорреляции потока спектра, затем сетка долей подгоняется по ударам баса;
- энергию низа (< 150 Гц) на каждую долю: где бас пропал — брейк, где вернулся — дроп;
- точку входа ролика: за сколько долей до дропа начать, чтобы хук успел прочитаться.

Запуск из корня набора:
  python3 scripts/track_structure.py <трек.mp3> [--hook-beats 3] [--json out.json] [--quiet-json]

Пример: трек 91 BPM, первая доля 0,133 с, дроп — доля 30 (19,92 с), брейк — доли 57–61,
возврат бита — доля 62, ровно через 32 доли после дропа.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from scipy.signal import stft

SR = 11025
HOP = 64


def decode(path: Path) -> np.ndarray:
    pcm = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(path), '-ac', '1', '-ar', str(SR), '-f', 's16le', '-'],
                         capture_output=True, check=True).stdout
    return np.frombuffer(pcm, np.int16).astype(np.float32) / 32768


def tempo(flux: np.ndarray, fps: float, lo: float, hi: float) -> float:
    span = int(fps * 90)
    o = flux[:span] - flux[:span].mean()
    ac = np.correlate(o, o, 'full')[len(o) - 1:]
    idx = np.arange(len(ac))
    best = max(np.arange(lo, hi, 0.05), key=lambda bpm: sum(np.interp(60 / bpm * fps * k, idx, ac) for k in (1, 2, 4)))
    return float(best)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('track', type=Path)
    ap.add_argument('--bpm-min', type=float, default=70)
    ap.add_argument('--bpm-max', type=float, default=180)
    ap.add_argument('--hook-beats', type=float, default=3, help='сколько долей до дропа отдать хуку')
    ap.add_argument('--json', type=Path, help='куда записать карту')
    ap.add_argument('--quiet-json', action='store_true', help='напечатать только карту JSON (для сборщика)')
    a = ap.parse_args()
    if not a.track.is_file():
        print(f'нет файла: {a.track}', file=sys.stderr)
        return 1

    x = decode(a.track)
    fr, _, Z = stft(x, SR, nperseg=1024, noverlap=1024 - HOP)
    fps = SR / HOP
    A = np.abs(Z)
    low = np.log1p(A[fr < 150] * 100).sum(0)
    lflux = np.maximum(0, np.diff(low, prepend=low[0]))
    full = np.log1p(A * 100)
    flux = np.maximum(0, np.diff(full, axis=1)).sum(0)

    bpm0 = tempo(flux, fps, a.bpm_min, a.bpm_max)
    dur = len(x) / SR
    # тонкая подгонка темпа и фазы по ударам баса в плотной части трека
    best = None
    t0, t1 = min(20.0, dur * 0.1), dur * 0.9
    for bpm in np.arange(bpm0 - 0.3, bpm0 + 0.3, 0.01):
        per = 60 / bpm
        for ph in np.arange(0, per, 0.005):
            idx = (np.arange(t0 + ph, t1, per) * fps).astype(int)
            s = lflux[idx].sum()
            if best is None or s > best[0]:
                best = (s, bpm, ph)
    _, bpm, ph = best
    beat = 60 / bpm
    first = (t0 + ph) % beat

    lowE = (A[fr < 150] ** 2).sum(0)
    n = int((dur - first) / beat)
    db = np.array([10 * np.log10(lowE[int((first + k * beat) * fps):int((first + (k + 1) * beat) * fps)].mean() + 1e-12) for k in range(n)])
    loud = np.median(db[db > np.percentile(db, 30)])
    quiet = db < loud - 10

    # брейк — подряд ≥ 2 тихих доли после громкой части; дроп — первая громкая доля после ≥ 4 тихих
    breaks, drops, k = [], [], 0
    while k < n:
        if quiet[k]:
            j = k
            while j < n and quiet[j]:
                j += 1
            if j < n:
                if k == 0 or j - k >= 4:
                    drops.append(j)
                if k > 0 and j - k >= 2:
                    breaks.append([k, j - 1])
            k = j
        else:
            k += 1
    # одна громкая доля посреди брейка (сбивка, вокальный выкрик) брейк не заканчивает
    merged = []
    for s, e in breaks:
        if merged and s - merged[-1][1] <= 2:
            merged[-1][1] = e
        else:
            merged.append([s, e])
    breaks = merged
    t = lambda b: round(first + b * beat, 3)
    out = {
        'track': a.track.name, 'bpm': round(bpm, 2), 'beat': round(beat, 4), 'firstBeat': round(first, 3), 'beats': n,
        'drops': [{'beat': d, 't': t(d)} for d in drops],
        'breaks': [{'from': s, 'to': e, 't': t(s), 'back': t(e + 1)} for s, e in breaks],
        'lowDbPerBeat': [round(float(v), 1) for v in db],
    }
    if drops:
        d = drops[0]
        out['entry'] = {'hookBeats': a.hook_beats, 'musicIn': round(first + (d - a.hook_beats) * beat, 3), 'dropAtReelBeat': a.hook_beats}
    if a.quiet_json:
        out.pop('lowDbPerBeat')
        print(json.dumps(out, ensure_ascii=False))
        return 0
    print(f"{a.track.name}: {out['bpm']} BPM, доля {out['beat']} с, первая доля {out['firstBeat']} с, долей {n}")
    for d in out['drops']:
        print(f"  дроп: доля {d['beat']} ({d['t']} с)")
    for b in out['breaks']:
        print(f"  брейк: доли {b['from']}–{b['to']} ({b['t']} с), бит возвращается на доле {b['to'] + 1} ({b['back']} с)")
    if 'entry' in out:
        e = out['entry']
        print(f"  вход ролика: {e['musicIn']} с — хук {e['hookBeats']:g} доли, дроп на доле {e['dropAtReelBeat']:g} ролика")
    if a.json:
        a.json.write_text(json.dumps(out, ensure_ascii=False, indent=1))
    return 0


if __name__ == '__main__':
    sys.exit(main())
