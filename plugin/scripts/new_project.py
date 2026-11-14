#!/usr/bin/env python3
"""Новый проект в рабочей папке: work/<имя>/in, out и копии исходников со сверкой хэша.

Исходники не переносятся и не меняются — только копируются. Существующий проект
не перезаписывается: файл с тем же именем в in/ — отказ.

    python3 scripts/new_project.py first-reel --dry-run
    python3 scripts/new_project.py first-reel --copy ~/Music/track.mp3 --film beat-reel
    python3 scripts/new_project.py showreel --copy track.mp3 work-a.mp4 work-b.mp4 --film one-take-showreel
    python3 scripts/new_project.py my-vlog --copy ~/Movies/take1.mp4

--film кладёт в проект сценарий-пример из examples/ и вписывает в него пути к
скопированному треку (и к двум видео для шоурила).
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from cadence_paths import (  # noqa: E402
    AUDIO_EXT, VIDEO_EXT, CadenceError, RELEASE_ROOT, main_guard, require_input, sha256, slugify, work_root,
)

FILMS = {p.name: p / 'film.json' for p in (RELEASE_ROOT / 'examples').iterdir() if (p / 'film.json').is_file()}


def plan(args) -> dict:
    name = slugify(args.name)
    root = work_root() / name
    sources = [require_input(c) for c in args.copy]
    names = [s.name for s in sources]
    if len(set(names)) != len(names):
        raise CadenceError('Два исходника с одинаковым именем — переименуй один из них.')
    for s in sources:
        if (root / 'in' / s.name).exists():
            raise CadenceError(f'В проекте {name} уже есть in/{s.name}. Исходники не перезаписываю — возьми другое имя проекта.')
    if args.film and args.film not in FILMS:
        raise CadenceError(f'Нет примера {args.film}; есть: {", ".join(sorted(FILMS))}')
    if args.film and (root / 'film.json').exists():
        raise CadenceError(f'В проекте {name} уже есть film.json — не перезаписываю.')
    return {'name': name, 'root': root, 'sources': sources}


def fill_film(film: dict, kind: str, copied: list[Path]) -> list[str]:
    notes = []
    audio = [p for p in copied if p.suffix.lower() in AUDIO_EXT]
    video = [p for p in copied if p.suffix.lower() in VIDEO_EXT]
    if audio:
        film.setdefault('music', {})['src'] = f'in/{audio[0].name}'
    else:
        notes.append(f'трек не скопирован — в film.json остался путь {film.get("music", {}).get("src")}')
    if kind == 'one-take-showreel':
        for screen, clip in zip(film.get('screens', []), video):
            screen['src'] = f'in/{clip.name}'
        if len(video) < len(film.get('screens', [])):
            notes.append(f'шоурилу нужно {len(film["screens"])} видео, скопировано {len(video)}')
    return notes


def main() -> int:
    ap = argparse.ArgumentParser(description='Новый проект в рабочей папке Cadence.')
    ap.add_argument('name', help='имя проекта латиницей: first-reel, my-vlog')
    ap.add_argument('--copy', nargs='*', default=[], help='файлы, которые скопировать в in/')
    ap.add_argument('--film', help=f'сценарий-пример: {", ".join(sorted(FILMS))}')
    ap.add_argument('--dry-run', action='store_true', help='показать план и ничего не создавать')
    args = ap.parse_args()

    p = plan(args)
    root = p['root']
    print(f'проект: {root}')
    for s in p['sources']:
        print(f'  копия: {s} → in/{s.name}')
    if args.film:
        print(f'  сценарий: examples/{args.film}/film.json → film.json')
        print('  тексты в film.json — заготовка: впиши хук, название, подпись и кнопку по идее человека')
    if args.dry_run:
        print('--dry-run: ничего не создано')
        return 0

    (root / 'in').mkdir(parents=True, exist_ok=True)
    (root / 'out').mkdir(exist_ok=True)
    copied = []
    for s in p['sources']:
        dst = root / 'in' / s.name
        shutil.copy2(s, dst)
        a, b = sha256(s), sha256(dst)
        if a != b:
            dst.unlink()
            raise CadenceError(f'Копия {s.name} не совпала с исходником по хэшу — удалил копию, исходник не тронут.')
        copied.append(dst)
        print(f'  in/{s.name}: sha256 {a[:12]}… совпал')
    if args.film:
        film = json.loads(FILMS[args.film].read_text(encoding='utf-8'))
        for note in fill_film(film, args.film, copied):
            print(f'  внимание: {note}')
        (root / 'film.json').write_text(json.dumps(film, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print('  film.json записан — поправь в нём хук и тексты')
    print('готово')
    return 0


if __name__ == '__main__':
    main_guard(main)
