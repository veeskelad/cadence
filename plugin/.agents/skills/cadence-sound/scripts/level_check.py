#!/usr/bin/env python3
"""Проверка микса: эффекты под музыкой, а не над ней.

  python3 level_check.py --music <музыка.wav> --sfx <эффекты.wav> [--placements placements.json]
  python3 level_check.py --mix <mix.wav> --sfx <sfx.wav> [--placements placements.json]

Второй вид — для пары mix.wav + sfx.wav из cue_mix.py: музыка = mix − sfx (оба файла опущены одной
поправкой, вычитание точное). Дорожки выровнены от нуля.

События ищутся по огибающей дорожки эффектов: соседние клипы ближе 150 мс сливаются в одно событие,
как их и слышно. Для каждого события самое громкое окно 200 мс эффекта сравнивается с музыкой
в окне --window секунд вокруг него (по умолчанию 1 с: так меряется громкость фразы, а не слога).

  громче −10 дБ к музыке      FAIL — эффект над музыкой
  от −12,5 до −10 дБ          предупреждение — на грани
  тише −30 дБ                 предупреждение — под музыкой не слышно
  эффекты подняли микс больше чем на 1,5 LUFS — FAIL

Рабочие уровни — от −14 (акцент) до −20 дБ (фон), см. references/under-vocal-track.md.
Печатает JSON; код выхода 1 при FAIL. Файлы только читаются. Нужны ffmpeg и numpy.
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np

SR = 48000
FAIL_REL, WARN_REL, QUIET_REL, FAIL_LUFS = -10.0, -12.5, -30.0, 1.5


def decode(path: Path) -> np.ndarray:
    if not shutil.which("ffmpeg"):
        sys.exit("Нужен ffmpeg: без него файл не прочитать.")
    if not path.is_file():
        sys.exit(f"Нет файла: {path}")
    proc = subprocess.run(["ffmpeg", "-v", "error", "-nostdin", "-i", str(path), "-ac", "2", "-ar", str(SR),
                           "-f", "f32le", "-"], capture_output=True)
    if proc.returncode != 0:
        sys.exit(f"{path}: ffmpeg не смог прочитать файл")
    return np.frombuffer(proc.stdout, np.float32).reshape(-1, 2).astype(np.float64)


def rms_db(x: np.ndarray) -> float:
    return float(10 * np.log10(np.mean(x ** 2) + 1e-12)) if len(x) else -120.0


def lufs(x: np.ndarray) -> float:
    proc = subprocess.run(["ffmpeg", "-hide_banner", "-nostdin", "-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", "-",
                           "-af", "ebur128", "-f", "null", "-"], input=x.astype(np.float32).tobytes(), capture_output=True)
    found = re.findall(r"I:\s+(-?[\d.]+) LUFS", proc.stderr.decode(errors="ignore"))
    return float(found[-1]) if found else float("nan")


def detect(sfx: np.ndarray) -> list[dict]:
    """События: окна 10 мс громче (пик − 40 дБ) и громче −60 dBFS; паузы до 150 мс склеиваются."""
    hop = SR // 100
    n = len(sfx) // hop
    if n == 0:
        return []
    env = 10 * np.log10(np.mean(sfx[: n * hop].reshape(n, hop, 2) ** 2, axis=(1, 2)) + 1e-12)
    on = env > max(env.max() - 40, -60)
    events, start, gap = [], None, 0
    for i, flag in enumerate(on):
        if flag:
            start, gap = (i if start is None else start), 0
        elif start is not None:
            gap += 1
            if gap > 15:
                events.append({"id": f"e{len(events) + 1}", "start": start / 100, "end": (i - gap + 1) / 100})
                start, gap = None, 0
    if start is not None:
        events.append({"id": f"e{len(events) + 1}", "start": start / 100, "end": len(on) / 100})
    return events


def event_levels(music: np.ndarray, sfx: np.ndarray, events: list[dict], window: float) -> list[dict]:
    out, w, big = [], int(0.2 * SR), int(window * SR)
    for e in events:
        a, b = max(0, int(e["start"] * SR)), min(len(sfx), int(e["end"] * SR))
        if b - a < SR // 100:
            continue
        seg = sfx[a:b]
        win = min(w, len(seg))
        s = max(range(0, max(1, len(seg) - win + 1), SR // 100), key=lambda i: rms_db(seg[i:i + win]))
        mid = a + s + win // 2
        m0 = min(max(0, mid - big // 2), max(0, len(music) - big))
        rel = rms_db(seg[s:s + win]) - rms_db(music[m0:m0 + big])
        out.append({"id": e["id"], "at": round((a + s) / SR, 2), "relDb": round(rel, 1), "clips": e.get("clips", "")})
    return out


def verdict(levels: list[dict], added: float) -> tuple[list[str], list[str]]:
    errors, warnings = [], []
    for lv in levels:
        where = f"{lv['at']:.2f} с ({lv['id']}{', ' + lv['clips'] if lv['clips'] else ''})"
        if lv["relDb"] > FAIL_REL:
            errors.append(f"{where}: эффект {lv['relDb']:+.1f} дБ к музыке — громче музыки, рабочие −14…−20")
        elif lv["relDb"] > WARN_REL:
            warnings.append(f"{where}: {lv['relDb']:+.1f} дБ — на грани, рабочие −14…−20")
        elif lv["relDb"] < QUIET_REL:
            warnings.append(f"{where}: {lv['relDb']:+.1f} дБ — под музыкой не слышно")
    if np.isfinite(added) and added > FAIL_LUFS:
        errors.append(f"эффекты подняли громкость микса на {added:+.1f} LUFS: они над музыкой")
    return errors, warnings


def main() -> int:
    ap = argparse.ArgumentParser(description="Эффекты под музыкой: уровень каждого события и прибавка LUFS")
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--music", type=Path, help="дорожка музыки (без эффектов)")
    src.add_argument("--mix", type=Path, help="mix.wav из cue_mix.py: музыка = mix − sfx")
    ap.add_argument("--sfx", type=Path, required=True, help="дорожка одних эффектов")
    ap.add_argument("--placements", type=Path, help="placements.json из cue_mix.py: подписать события id клипов")
    ap.add_argument("--window", type=float, default=1.0, help="окно музыки вокруг эффекта, с (1)")
    a = ap.parse_args()
    sfx = decode(a.sfx)
    other = decode(a.music or a.mix)
    n = min(len(sfx), len(other))
    sfx, other = sfx[:n], other[:n]
    music = other - sfx if a.mix else other
    events = detect(sfx)
    if a.placements:
        cues = json.loads(a.placements.read_text(encoding="utf-8"))["cues"]
        for e in events:
            e["clips"] = ", ".join(c["id"] for c in cues if c["start"] < e["end"] and c["end"] > e["start"])[:80]
    levels = event_levels(music, sfx, events, a.window)
    added = lufs(music + sfx) - lufs(music)
    errors, warnings = verdict(levels, added)
    print(json.dumps({"status": "FAIL" if errors else "OK", "events": len(levels),
                      "addedLufs": round(added, 2) if np.isfinite(added) else None,
                      "loudestRelDb": max((lv["relDb"] for lv in levels), default=None),
                      "levels": levels, "errors": errors, "warnings": warnings}, ensure_ascii=False, indent=1))
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
