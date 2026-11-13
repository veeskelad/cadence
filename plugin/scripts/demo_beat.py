#!/usr/bin/env python3
"""Демо-бит для первого ролика, если своего трека нет: синтезируется кодом, лицензия не нужна.

Тихое вступление 8 долей (пэд и хэты), дроп — бочка, малый, бас, затем 40 долей бита.
Для публикации лучше свой трек или трек из библиотеки площадки: демо-бит простой.

  python3 scripts/demo_beat.py --out work/demo/in/demo-beat.wav [--bpm 100]
"""

from __future__ import annotations

import argparse
import wave
from pathlib import Path

import numpy as np

SR = 44100


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', type=Path, required=True)
    ap.add_argument('--bpm', type=float, default=100)
    ap.add_argument('--beats', type=int, default=40, help='долей бита после дропа (шоурилу нужно 56)')
    a = ap.parse_args()
    beat = 60 / a.bpm
    intro, body = 8, a.beats
    n = int(SR * beat * (intro + body + 2))
    mix = np.zeros(n)
    rng = np.random.default_rng(3)
    t = lambda d: np.arange(int(SR * d)) / SR

    def add(x, at):
        i = int(at * SR)
        j = min(n, i + len(x))
        mix[i:j] += x[: j - i]

    kick = np.sin(2 * np.pi * np.cumsum(45 + 110 * np.exp(-t(0.35) * 28)) / SR) * np.exp(-t(0.35) * 9)
    snare = rng.standard_normal(int(SR * 0.22)) * np.exp(-t(0.22) * 22) * 0.5 + np.sin(2 * np.pi * 190 * t(0.22)) * np.exp(-t(0.22) * 30) * 0.4
    hat = rng.standard_normal(int(SR * 0.05)) * np.exp(-t(0.05) * 90) * 0.18
    hat = np.diff(hat, prepend=0) * 3                  # верха без низа
    chord = [220.0, 261.63, 329.63]
    for k in range(intro + body):
        at = k * beat
        add(hat, at + beat / 2)
        if k >= intro:
            add(hat, at)
            if k % 2 == 0:
                add(kick, at)
            if k % 4 == 3:
                add(kick, at + beat / 2)
            if k % 2 == 1:
                add(snare, at)
            f = 55 if (k // 4) % 2 == 0 else 49
            add(np.sin(2 * np.pi * f * t(beat * 0.9)) * np.exp(-t(beat * 0.9) * 2) * 0.55, at)
    pad_len = beat * (intro + body)
    pad = sum(np.sin(2 * np.pi * f * t(pad_len)) for f in chord) * 0.06
    pad *= np.minimum(1, np.arange(len(pad)) / (SR * beat * 2))
    add(pad, 0)
    mix = mix / (np.max(np.abs(mix)) + 1e-9)
    mix = np.tanh(mix * 3) / np.tanh(3) * 0.85          # мягкая сатурация: бит плотный, как у сведённого трека
    a.out.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(a.out), 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((mix * 32767).astype('<i2').tobytes())
    print(f'{a.out}: {a.bpm:g} BPM, дроп на {intro * beat:.2f} с, длина {len(mix) / SR:.1f} с')


if __name__ == '__main__':
    main()
