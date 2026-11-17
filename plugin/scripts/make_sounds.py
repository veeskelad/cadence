#!/usr/bin/env python3
"""Звуки Cadence, синтезированные кодом: клавиши, клик, вух, подлёт, райзер, удар, колокол.

Звуки свои — без чужих лицензий, их можно раздавать вместе с набором. Пишет WAV 44,1 кГц
в sounds/ и sounds/sounds.json: для каждого файла onset (начало звука) и peak (пик огибающей) —
сборщик ставит пик ровно на событие.

  python3 scripts/make_sounds.py [--out sounds]
"""

from __future__ import annotations

import argparse
import json
import wave
from pathlib import Path

import numpy as np

SR = 44100
rng = np.random.default_rng(7)


def t_(dur):
    return np.arange(int(SR * dur)) / SR


def env(n, attack, release):
    a = np.clip(np.arange(n) / max(1, int(SR * attack)), 0, 1)
    r = np.exp(-np.arange(n) / (SR * release))
    return a * r


def lowpass(x, cutoff):
    # однополюсный фильтр: достаточно для шума вуха
    k = np.exp(-2 * np.pi * cutoff / SR)
    y = np.zeros_like(x)
    acc = 0.0
    for i, v in enumerate(x):
        acc = (1 - k) * v + k * acc
        y[i] = acc
    return y


def sweep_noise(dur, f0, f1, shape):
    n = int(SR * dur)
    noise = rng.standard_normal(n)
    cut = f0 + (f1 - f0) * np.linspace(0, 1, n) ** 1.5
    out = np.zeros(n)
    acc = 0.0
    for i in range(n):
        k = np.exp(-2 * np.pi * cut[i] / SR)
        acc = (1 - k) * noise[i] + k * acc
        out[i] = acc
    return out * shape


def key(seed):
    r = np.random.default_rng(seed)
    n = int(SR * 0.09)
    click = r.standard_normal(n) * env(n, 0.0005, 0.006)
    body = np.sin(2 * np.pi * (1800 + 400 * r.random()) * t_(0.09)) * env(n, 0.0008, 0.012) * 0.4
    thock = np.sin(2 * np.pi * (180 + 40 * r.random()) * t_(0.09)) * env(n, 0.001, 0.02) * 0.6
    return click * 0.5 + body + thock


def tick():
    n = int(SR * 0.06)
    return np.sin(2 * np.pi * 2600 * t_(0.06)) * env(n, 0.0003, 0.008) + rng.standard_normal(n) * env(n, 0.0002, 0.003) * 0.3


def whoosh(dur=1.2):
    n = int(SR * dur)
    x = np.linspace(0, 1, n)
    shape = np.sin(np.pi * x ** 0.7) ** 2               # нарастает и спадает, пик около 0,6 длины
    return sweep_noise(dur, 300, 3500, shape) * 3


def swell(dur=2.2):
    n = int(SR * dur)
    x = np.linspace(0, 1, n)
    shape = np.where(x < 0.62, (x / 0.62) ** 2, np.exp(-(x - 0.62) * 9))
    low = np.sin(2 * np.pi * (55 + 25 * x) * t_(dur)) * shape * 0.5
    return sweep_noise(dur, 150, 900, shape) * 2.2 + low


def riser(dur=2.0):
    n = int(SR * dur)
    x = np.linspace(0, 1, n)
    shape = np.where(x < 0.94, x ** 2.2, np.exp(-(x - 0.94) * 60))
    tone = np.sin(2 * np.pi * np.cumsum(200 + 1400 * x ** 2) / SR) * 0.25
    return (sweep_noise(dur, 400, 6000, 1.0) * 2 + tone) * shape


def hit(dur=1.6):
    n = int(SR * dur)
    f = 48 + 70 * np.exp(-t_(dur) * 18)                 # «падающий» низ — удар
    boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.002, 0.45)
    crack = rng.standard_normal(n) * env(n, 0.0005, 0.03) * 0.5
    return boom + crack


def bell(dur=3.0):
    n = int(SR * dur)
    out = np.zeros(n)
    for ratio, amp, dec in [(1, 1, 1.2), (2.76, 0.5, 0.7), (5.4, 0.25, 0.4), (8.9, 0.12, 0.25)]:
        out += amp * np.sin(2 * np.pi * 523.25 * ratio * t_(dur)) * env(n, 0.002, dec)
    return out * 0.6


def save(path, x):
    x = x / (np.max(np.abs(x)) + 1e-9) * 0.89            # пик −1 dBFS
    pcm = (x * 32767).astype('<i2')
    with wave.open(str(path), 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
    e = np.abs(x)
    k = int(SR * 0.01)
    sm = np.convolve(e, np.ones(k) / k, 'same')
    onset = float(np.argmax(sm > 0.05 * sm.max()) / SR)
    peak = float(np.argmax(sm) / SR)
    return {'onset': round(onset, 3), 'peak': round(peak, 3), 'length': round(len(x) / SR, 3)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', type=Path, default=Path(__file__).resolve().parent.parent / 'sounds')
    a = ap.parse_args()
    a.out.mkdir(parents=True, exist_ok=True)
    sounds = {
        'key-1.wav': key(1), 'key-2.wav': key(2), 'key-3.wav': key(3), 'tick.wav': tick(),
        'whoosh.wav': whoosh(), 'swell.wav': swell(), 'riser.wav': riser(), 'hit.wav': hit(), 'bell.wav': bell(),
    }
    meta = {name: save(a.out / name, x) for name, x in sounds.items()}
    (a.out / 'sounds.json').write_text(json.dumps(meta, ensure_ascii=False, indent=1))
    for name, m in meta.items():
        print(f'{name:12s} onset {m["onset"]:.3f}  peak {m["peak"]:.3f}  {m["length"]:.2f} с')


if __name__ == '__main__':
    main()
