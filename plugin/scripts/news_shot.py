#!/usr/bin/env python3
"""Снимок статьи вокруг цитаты для доказательства article со shot (engine/lib/proofs.js).

    # свой снимок: картинка страницы, которую человек снял сам (любым браузером или инструментом)
    python3 scripts/news_shot.py own --image page.png --quote "цитата дословно" --name primer \\
        [--head head.png] [--lines "x,y,w,h;x,y,w,h"] [--url https://…] --out "$WORK"/<проект>/in/news

    # снимок по ссылке: Chrome движка Cadence, чистый профиль, без входа и cookies — сеть, только с согласия
    python3 scripts/news_shot.py url --url https://… --quote "цитата дословно" --name primer --out … [--yes]

Пишет в --out: <имя>.png (абзац с цитатой), <имя>-head.png (шапка статьи, если есть) и <имя>.json:
ширина и высота снимка, строки цитаты [x, y, w, h] в пикселях снимка, шапка, источник и время снимка.
По json сборщик ставит маркер на каждую строку цитаты. В сценарии: {"kind": "article", "shot": "in/news/primer.png", ...}.

Строки цитаты в своём снимке находит OCR macOS (Vision через swift, локально). Без него — --lines вручную
(прямоугольник каждой строки цитаты в пикселях снимка). url без --yes ничего не скачивает: печатает план.
Права на показ чужой страницы проверяет человек.
"""

from __future__ import annotations

import argparse
import datetime
import json
import re
import shutil
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from cadence_paths import RELEASE_ROOT, CadenceError, first_stream, main_guard, probe, require_input, run  # noqa: E402


def norm(s: str) -> str:
    s = s.replace('“', '"').replace('”', '"').replace('„', '"').replace('«', '"').replace('»', '"')
    s = s.replace('‘', "'").replace('’', "'").replace('ё', 'е').replace('Ё', 'Е')
    return re.sub(r'\s+', ' ', s).strip().lower()


def image_size(path: Path) -> tuple[int, int]:
    st = first_stream(probe(path), 'video') or {}
    w, h = int(st.get('width') or 0), int(st.get('height') or 0)
    if not w or not h:
        raise CadenceError(f'Не прочитать размер картинки {path.name}: нужен PNG или JPG')
    return w, h


def parse_lines(text: str) -> list[list[int]]:
    rows = []
    for part in filter(None, (p.strip() for p in text.split(';'))):
        nums = [float(x) for x in part.split(',')]
        if len(nums) != 4 or min(nums[2:]) <= 0:
            raise CadenceError(f'--lines: «{part}» — нужно x,y,w,h, ширина и высота больше нуля')
        rows.append([round(n) for n in nums])
    if not rows:
        raise CadenceError('--lines пустой')
    return rows


def quote_lines(boxes: list[dict], quote: str) -> list[list[int]]:
    """Строки OCR сверху вниз; ищем подряд идущие строки, в склейке которых есть цитата.
    Начало первой и конец последней строки режем пропорционально числу знаков: OCR даёт рамку строки целиком."""
    lines = sorted((b for b in boxes if b.get('text', '').strip()), key=lambda b: (round(b['y'] / 8), b['x']))
    q = norm(quote)
    for i in range(len(lines)):
        joined, spans = '', []
        for j in range(i, min(len(lines), i + 12)):
            t = norm(lines[j]['text'])
            start = len(joined) + (1 if joined else 0)
            joined = f'{joined} {t}' if joined else t
            spans.append((start, len(joined), lines[j]))
            k = joined.find(q)
            if k < 0:
                continue
            if k >= spans[0][1]:
                break  # цитата начинается не в первой строке окна: её найдёт следующий i
            end = k + len(q)
            rows = []
            for s0, s1, b in spans:
                if s1 <= k or s0 >= end:
                    continue
                n = max(1, s1 - s0)
                a = max(0.0, (k - s0) / n)
                z = min(1.0, (end - s0) / n)
                rows.append([round(b['x'] + b['w'] * a), round(b['y']), round(b['w'] * (z - a)), round(b['h'])])
            return rows
    raise CadenceError('Цитата не найдена в тексте снимка. Проверь, что она дословная и целиком видна на снимке, '
                       'или задай строки вручную: --lines "x,y,w,h;…"')


def ocr_boxes(image: Path) -> list[dict]:
    from safe_zone_check import ocr, ocr_available  # noqa: E402 — тот же OCR, что у проверки зон
    if not ocr_available():
        raise CadenceError('OCR есть только на macOS со swift (Xcode Command Line Tools). Задай строки цитаты вручную: --lines "x,y,w,h;…"')
    with tempfile.TemporaryDirectory() as tmp:
        return ocr([image], Path(tmp))


def write_meta(out: Path, name: str, image: Path, head: Path | None, lines: list[list[int]], quote: str, source: str) -> Path:
    w, h = image_size(image)
    meta = {'source': source, 'quote': quote, 'shotAt': datetime.datetime.now().astimezone().isoformat(timespec='seconds'),
            'width': w, 'height': h, 'lines': lines, 'head': None}
    if head:
        hw, hh = image_size(head)
        meta['head'] = {'file': head.name, 'width': hw, 'height': hh}
    path = out / f'{name}.json'
    path.write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding='utf-8')
    return path


def cmd_own(a) -> None:
    image = require_input(a.image, 'снимок страницы')
    head = require_input(a.head, 'снимок шапки') if a.head else None
    out = Path(a.out).resolve()
    out.mkdir(parents=True, exist_ok=True)
    lines = parse_lines(a.lines) if a.lines else quote_lines(ocr_boxes(image), a.quote)
    dst = out / f'{a.name}{image.suffix.lower()}'
    if dst.resolve() != image:
        shutil.copyfile(image, dst)
    hdst = None
    if head:
        hdst = out / f'{a.name}-head{head.suffix.lower()}'
        if hdst.resolve() != head:
            shutil.copyfile(head, hdst)
    meta = write_meta(out, a.name, dst, hdst, lines, a.quote, a.url or 'свой снимок')
    print(json.dumps({'png': str(dst), 'json': str(meta), 'lines': len(lines)}, ensure_ascii=False))


def chrome_path() -> str:
    hf = RELEASE_ROOT / 'engine/node_modules/.bin/hyperframes'
    if not hf.exists():
        raise CadenceError('Движок не подключён: python3 scripts/engine_setup.py status')
    return run([str(hf), 'browser', 'path']).stdout.strip().splitlines()[-1]


def cmd_url(a) -> None:
    out = Path(a.out).resolve()
    if not a.yes:
        print('План (ничего не скачано):\n'
              f'  открыть {a.url} в Chrome движка Cadence — чистый временный профиль, без входа и cookies;\n'
              '  спрятать закреплённые плашки (cookie, подписка), найти цитату, снять шапку статьи и абзац с цитатой;\n'
              f'  записать {out}/{a.name}.png, {a.name}-head.png, {a.name}.json.\n'
              'Это сеть. Запусти с --yes после согласия человека. Права на показ страницы в ролике проверяет человек.')
        return
    out.mkdir(parents=True, exist_ok=True)
    args = {'url': a.url, 'quote': a.quote, 'png': str(out / f'{a.name}.png'), 'vw': a.width, 'chrome': chrome_path()}
    res = run(['node', str(Path(__file__).with_name('news_shot_page.mjs')), json.dumps(args, ensure_ascii=False)], cwd=RELEASE_ROOT / 'engine')
    geo = json.loads(res.stdout.strip().splitlines()[-1])
    if geo.get('error'):
        raise CadenceError(f'Снимок не сделан: {geo["error"]}')
    head = out / f'{a.name}-head.png' if geo.get('head') else None
    meta = write_meta(out, a.name, out / f'{a.name}.png', head, geo['lines'], a.quote, a.url)
    print(json.dumps({'png': args['png'], 'json': str(meta), 'lines': len(geo['lines'])}, ensure_ascii=False))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest='mode', required=True)
    own = sub.add_parser('own', help='свой снимок страницы')
    own.add_argument('--image', required=True, help='снимок абзаца с цитатой (PNG или JPG)')
    own.add_argument('--head', help='снимок шапки статьи: заголовок, автор, дата')
    own.add_argument('--lines', help='строки цитаты вручную: "x,y,w,h;x,y,w,h" в пикселях снимка')
    own.add_argument('--url', help='адрес страницы — только для записи в json')
    url = sub.add_parser('url', help='снимок по ссылке (сеть, с согласия)')
    url.add_argument('--url', required=True)
    url.add_argument('--width', type=int, default=540, help='ширина окна страницы, CSS px (по умолчанию 540: узкая вёрстка, текст в ролике крупнее)')
    url.add_argument('--yes', action='store_true', help='согласие человека на сеть')
    for p in (own, url):
        p.add_argument('--quote', required=True, help='цитата дословно, как на странице')
        p.add_argument('--name', required=True, help='имя файлов без расширения')
        p.add_argument('--out', required=True, help='папка проекта для снимка, например "$WORK"/<проект>/in/news')
    a = ap.parse_args()
    if not re.fullmatch(r'[A-Za-z0-9_-]+', a.name):
        raise CadenceError('--name: латиница, цифры, дефис и подчёркивание')
    (cmd_own if a.mode == 'own' else cmd_url)(a)


if __name__ == '__main__':
    main_guard(main)
