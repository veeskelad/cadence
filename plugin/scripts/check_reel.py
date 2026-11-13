#!/usr/bin/env python3
"""Техническая проверка ролика перед публикацией. Только читает файл.

    python3 scripts/check_reel.py work/first-reel/out/reel.mp4
    python3 scripts/check_reel.py reel.mp4 --json

Проверяет: формат кадра, частоту, кодек, длину, звук, громкость и пик, чёрные кадры,
замершие куски, тишину в начале. Каждая строка — ок, внимание или стоп.
Технический «ок» — не решение о публикации: смотреть ролик и решать — человеку.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from cadence_paths import (  # noqa: E402
    duration_of, ffmpeg_cmd, first_stream, main_guard, parse_ebur128, probe, require_input, run, video_fps,
)

FORMATS = {(1080, 1920): '9:16', (1920, 1080): '16:9', (1080, 1350): '4:5', (1080, 1080): '1:1'}
TARGET_LUFS, PEAK_MAX = -14.0, -1.0


def scan(path: Path, has_audio: bool) -> tuple[dict, list, list, float | None]:
    """Один проход ffmpeg: громкость, чёрные кадры, замершие куски, тишина в начале."""
    graph = '[0:v:0]scale=320:-2,blackdetect=d=0.1:pix_th=0.08,freezedetect=n=0.002:d=0.6[v]'
    maps = ['-map', '[v]']
    if has_audio:
        graph += ';[0:a:0]asplit=2[a1][a2];[a1]ebur128=peak=true:framelog=quiet[l];[a2]silencedetect=noise=-50dB:d=0.3[s]'
        maps += ['-map', '[l]', '-map', '[s]']
    err = run(ffmpeg_cmd('-nostats', '-i', path, '-filter_complex', graph, *maps, '-f', 'null', '-')).stderr or ''
    loud = parse_ebur128(err) if has_audio else {}
    blacks = [(float(a), float(b)) for a, b in re.findall(r'black_start:([\d.]+) black_end:([\d.]+)', err)]
    freezes = [float(x) for x in re.findall(r'freeze_start: ([\d.]+)', err)]
    m = re.search(r'silence_start: (-?[\d.]+)', err)
    head_silence = None
    if m and float(m.group(1)) <= 0.05:
        end = re.search(r'silence_end: ([\d.]+)', err)
        head_silence = float(end.group(1)) if end else None
    return loud, blacks, freezes, head_silence


def check(path: Path) -> list[dict]:
    info = probe(path)
    v, a = first_stream(info, 'video'), first_stream(info, 'audio')
    rows = []

    def row(level, what, text):
        rows.append({'level': level, 'what': what, 'text': text})

    if not v:
        row('стоп', 'видео', 'в файле нет видеодорожки')
        return rows
    w, h = int(v.get('width', 0)), int(v.get('height', 0))
    fmt = FORMATS.get((w, h))
    row('ок' if fmt else 'внимание', 'кадр', f'{w}×{h}' + (f' ({fmt})' if fmt else ' — не 1080×1920 и не 1920×1080, площадка пережмёт'))
    fps = video_fps(info)
    row('ок' if 23.9 <= fps <= 60.1 else 'внимание', 'частота', f'{fps:.2f} к/с')
    codec, pix = v.get('codec_name'), v.get('pix_fmt')
    row('ок' if codec in ('h264', 'hevc') and pix == 'yuv420p' else 'внимание', 'кодек',
        f'{codec}, {pix}' + ('' if pix == 'yuv420p' else ' — нужен yuv420p, иначе часть телефонов не покажет'))
    dur = duration_of(info)
    row('ок' if 3 <= dur <= 90 else 'внимание', 'длина', f'{dur:.1f} с' + ('' if dur <= 90 else ' — для Reels длинно'))

    loud, blacks, freezes, head_silence = scan(path, bool(a))
    if not a:
        row('внимание', 'звук', 'звука нет — без музыки ролик в ленте теряет часть зрителей')
    else:
        lufs, peak = loud.get('lufs'), loud.get('true_peak')
        if lufs is not None:
            gap = lufs - TARGET_LUFS
            level = 'ок' if -3 <= gap <= 1 else 'внимание'
            row(level, 'громкость', f'{lufs:.1f} LUFS (ориентир {TARGET_LUFS:.0f})' + (
                '' if level == 'ок' else (' — тихо: python3 scripts/deliver.py' if gap < 0 else ' — громко, площадка убавит')))
        if peak is not None:
            row('ок' if peak <= PEAK_MAX else 'стоп', 'пик', f'{peak:.1f} dBTP' + ('' if peak <= PEAK_MAX else ' — выше −1: на телефоне захрипит; python3 scripts/deliver.py'))
        if head_silence and head_silence > 0.3:
            row('внимание', 'начало', f'первые {head_silence:.1f} с тишина — в ленте листают раньше')
    inner = [(s, e) for s, e in blacks if s > 0.05 and e < dur - 0.05]
    if inner:
        row('внимание', 'чёрные кадры', ', '.join(f'{s:.2f}–{e:.2f} с' for s, e in inner[:5]) + ' — проверь, что это задумано')
    else:
        row('ок', 'чёрные кадры', 'внутри ролика нет')
    if freezes:
        row('внимание', 'замершие куски', ', '.join(f'{t:.2f} с' for t in freezes[:5]) + ' — картинка стоит дольше 0.6 с; задумано или стоп-кадр?')
    else:
        row('ок', 'замершие куски', 'нет')
    return rows


def main() -> int:
    ap = argparse.ArgumentParser(description='Техническая проверка ролика перед публикацией.')
    ap.add_argument('video')
    ap.add_argument('--json', action='store_true')
    args = ap.parse_args()
    path = require_input(args.video, 'ролик')
    rows = check(path)
    if args.json:
        print(json.dumps({'file': path.name, 'checks': rows}, ensure_ascii=False, indent=2))
    else:
        print(path.name)
        for r in rows:
            print(f"  {r['level']:<8} {r['what']}: {r['text']}")
        stops = sum(r['level'] == 'стоп' for r in rows)
        warns = sum(r['level'] == 'внимание' for r in rows)
        print(f"итог: {'стоп' if stops else 'технически ок'}" + (f', замечаний {warns}' if warns else '') +
              '. Смотреть ролик и решать о публикации — тебе.')
    return 1 if any(r['level'] == 'стоп' for r in rows) else 0


if __name__ == '__main__':
    main_guard(main)
