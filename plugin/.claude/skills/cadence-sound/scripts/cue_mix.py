#!/usr/bin/env python3
"""Дорожка эффектов по карте событий: опорная точка каждого файла (onset или пик) встаёт ровно на событие.

  python3 cue_mix.py <cues.json> --out <папка> [--library <папка с эффектами>] [--overwrite]

В папке появятся:
  sfx.wav          одни эффекты;
  mix.wav          трек + эффекты (только если в карте есть "bed");
  placements.json  где встал каждый клип, его усиление и обрезанная подводка.

cues.json:
  {"duration": 15.5,
   "bed": {"file": "track.mp3", "from": 42.0, "gainDb": 0, "fadeIn": 0.2, "fadeOut": 0.3, "window": 1.0},
   "cues": [{"id": "fly", "event": 4.62, "file": "whoosh.wav", "anchor": "peak", "rel": -14, "hp": 80, "fade": 0.2}]}

- Файл эффекта: абсолютный путь или путь от --library; без --library — от папки, где лежит cues.json.
  Файл трека — абсолютный или от папки cues.json.
- anchor: "onset" — удар, щелчок, клавиша; "peak" — whoosh, нарастание. Точки меряются как в sound_anchor.py
  (по исходному файлу), поэтому совпадают с sounds/sounds.json и с полями onset/peak в film.json.
- hp — срез низа, Гц (по умолчанию 80); fade — затухание к концу файла, с.
- С треком громкость — "rel": самое громкое окно клипа (до 200 мс) против трека в окне bed.window (1 с)
  вокруг него. Рабочие уровни: акцент −14, живой звук −15, фон −20 дБ. Пик клипа не выше −6 dBFS.
- Без трека громкость — "level": пик огибающей клипа (RMS 10 мс), dBFS.
- Лимитера нет. Если сумма громче −1,5 dBFS по отсчётам (без трека — −1 dBFS), всё опускается одной
  поправкой: трек и эффекты вместе, соотношение сохраняется, и level_check.py --mix вычитает точно.

Исходники только читаются. Нужны ffmpeg и numpy.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from sfx_probe import SR, anchor_points, decode  # noqa: E402

DEFAULT_WINDOW = 1.0
CLIP_PEAK = -6.0


def rms_db(x: np.ndarray) -> float:
    return float(10 * np.log10(np.mean(x.astype(np.float64) ** 2) + 1e-12)) if len(x) else -120.0


def loudest(x: np.ndarray) -> tuple[int, int]:
    """Начало и длина самого громкого окна клипа (до 200 мс, шаг 10 мс)."""
    w = min(int(0.2 * SR), len(x))
    best = max(range(0, max(1, len(x) - w + 1), SR // 100), key=lambda s: rms_db(x[s:s + w]))
    return best, w


def env_peak_db(x: np.ndarray) -> float:
    hop, win = SR // 500, SR // 100
    m = np.concatenate([x.mean(axis=1), np.zeros(win, np.float32)])
    n = max(1, (len(m) - win) // hop)
    return float(max(rms_db(m[i * hop: i * hop + win]) for i in range(n)))


def load_bed(bed: dict, base: Path, n: int) -> tuple[np.ndarray, Path, float]:
    path = resolve(bed["file"], base)
    start = float(bed.get("from", 0))
    proc = subprocess.run(["ffmpeg", "-v", "error", "-nostdin", "-ss", f"{start:.3f}", "-i", str(path), "-ac", "2",
                           "-ar", str(SR), "-f", "f32le", "-"], capture_output=True)
    if proc.returncode != 0:
        sys.exit(f"{path}: ffmpeg не смог прочитать трек")
    x = np.frombuffer(proc.stdout, np.float32).reshape(-1, 2)[:n]
    out = np.zeros((n, 2), np.float32)
    out[:len(x)] = x * 10 ** (bed.get("gainDb", 0) / 20)
    for key, ramp in (("fadeIn", (0, 1)), ("fadeOut", (1, 0))):
        k = min(n, int(bed.get(key, 0) * SR))
        if k:
            sl = slice(0, k) if key == "fadeIn" else slice(n - k, n)
            out[sl] *= np.linspace(*ramp, k, dtype=np.float32)[:, None]
    return out, path, len(x) / SR


def resolve(name: str, base: Path) -> Path:
    p = Path(name).expanduser()
    if not p.is_absolute():
        p = base / p
    if not p.is_file():
        sys.exit(f"Нет файла: {p}")
    return p.resolve()


def same(a: Path, b: Path) -> bool:
    try:
        return a.resolve() == b.resolve() or (a.exists() and b.exists() and os.path.samefile(a, b))
    except OSError:
        return False


def write_wav(path: Path, x: np.ndarray) -> None:
    pcm = (np.clip(x, -1, 1) * 32767).round().astype("<i2")
    with wave.open(str(path), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def main() -> int:
    ap = argparse.ArgumentParser(description="Дорожка эффектов по карте событий; с треком — ещё и микс")
    ap.add_argument("cues", type=Path, help="cues.json")
    ap.add_argument("--out", type=Path, required=True, help="папка для sfx.wav, mix.wav и placements.json")
    ap.add_argument("--library", type=Path, help="папка с эффектами: от неё считаются пути file")
    ap.add_argument("--overwrite", action="store_true", help="разрешить заменить прежний результат")
    a = ap.parse_args()
    if not a.cues.is_file():
        sys.exit(f"Нет файла: {a.cues}")
    cfg = json.loads(a.cues.read_text(encoding="utf-8"))
    base = a.cues.resolve().parent
    lib = a.library.expanduser().resolve() if a.library else base
    duration = float(cfg.get("duration", 0))
    if duration <= 0 or not cfg.get("cues"):
        sys.exit("В cues.json нужны duration (с) и непустой список cues.")
    n = int(round(duration * SR))

    inputs = [a.cues.resolve()]
    bed = None
    if cfg.get("bed"):
        bed, bed_path, bed_len = load_bed(cfg["bed"], base, n)
        inputs.append(bed_path)
        if bed_len < duration - 0.05:
            print(f"Внимание: трека с {cfg['bed'].get('from', 0)} с хватает на {bed_len:.2f} с из {duration:.2f} — дальше тишина.")
    files = [resolve(c["file"], lib) for c in cfg["cues"]]
    inputs += files

    out_dir = a.out.expanduser()
    targets = {"sfx": out_dir / "sfx.wav", "placements": out_dir / "placements.json"}
    if bed is not None:
        targets["mix"] = out_dir / "mix.wav"
    for t in targets.values():
        for s in inputs:
            if same(t, s):
                sys.exit(f"Отказ: {t} совпадает с исходником. Укажи другую --out.")
        if t.exists() and not a.overwrite:
            sys.exit(f"Отказ: {t} уже есть. Другая --out или --overwrite, если старый результат не нужен.")

    window = float(cfg.get("bed", {}).get("window", DEFAULT_WINDOW)) if bed is not None else None
    stem = np.zeros((n, 2), np.float32)
    placed = []
    for c, path in zip(cfg["cues"], files):
        anchor = c.get("anchor", "onset")
        if anchor not in ("onset", "peak"):
            sys.exit(f"{c.get('id')}: anchor должен быть onset или peak")
        x = decode(path, channels=2, highpass=c.get("hp", 80))
        if not len(x):
            sys.exit(f"{path}: в файле нет звука")
        onset, peak = anchor_points(path)
        at = peak if anchor == "peak" else onset
        if c.get("fade"):
            k = min(len(x), int(c["fade"] * SR))
            x[-k:] *= np.linspace(1, 0, k, dtype=np.float32)[:, None]
        i0 = int(round((c["event"] - at) * SR))
        if bed is not None:
            if "rel" not in c:
                sys.exit(f"{c.get('id')}: с треком громкость задаётся полем rel (дБ к треку)")
            s, w = loudest(x)
            big = min(int(window * SR), n)
            m0 = min(max(0, i0 + s + w // 2 - big // 2), n - big)
            gain = c["rel"] - (rms_db(x[s:s + w]) - rms_db(bed[m0:m0 + big]))
            gain = min(gain, CLIP_PEAK - 20 * float(np.log10(np.abs(x).max() + 1e-12)))
        else:
            if "level" not in c:
                sys.exit(f"{c.get('id')}: без трека громкость задаётся полем level (dBFS)")
            gain = c["level"] - env_peak_db(x)
        x *= np.float32(10 ** (gain / 20))
        cut = max(0, -i0)                          # подводка раньше начала ролика обрезается
        i1 = min(n, i0 + len(x))
        if i1 > max(0, i0):
            stem[max(0, i0):i1] += x[cut: cut + i1 - max(0, i0)]
        placed.append({"id": c.get("id", f"c{len(placed) + 1}"), "file": str(path), "event": c["event"],
                       "anchor": anchor, "anchorSec": round(at, 3), "start": round(i0 / SR, 3),
                       "end": round((i0 + len(x)) / SR, 3), "gainDb": round(gain, 1),
                       "cutHead": round(cut / SR, 3), "note": c.get("note", "")})

    if bed is not None:
        mix = bed + stem
        trim = min(0.0, -1.5 - 20 * float(np.log10(np.abs(mix).max() + 1e-12)))
    else:
        trim = min(0.0, -1.0 - 20 * float(np.log10(np.abs(stem).max() + 1e-12)))
    g = np.float32(10 ** (trim / 20))
    out_dir.mkdir(parents=True, exist_ok=True)
    write_wav(targets["sfx"], stem * g)
    if bed is not None:
        write_wav(targets["mix"], (bed + stem) * g)
    targets["placements"].write_text(json.dumps({"trimDb": round(trim, 2), "window": window, "cues": placed},
                                                ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    for p in placed:
        cut = f", подводка обрезана на {p['cutHead']} с" if p["cutHead"] else ""
        print(f"{p['id']:>8} {p['event']:6.2f} с ← {p['anchor']} {p['anchorSec']:.3f} · клип {p['start']:.3f}–"
              f"{p['end']:.3f} · {p['gainDb']:+.1f} дБ{cut} · {Path(p['file']).name}")
    peak = 20 * np.log10(float(np.abs(stem).max()) * float(g) + 1e-12)
    print(f"эффекты: {len(placed)} событий, пик {peak:.1f} dBFS, общая поправка {trim:+.1f} дБ → {targets['sfx']}"
          + (f"; с треком → {targets['mix']}" if bed is not None else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
