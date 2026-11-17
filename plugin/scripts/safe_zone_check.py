#!/usr/bin/env python3
"""Формат кадра и текст в безопасных зонах ролика или обложки. Исходник не меняется.

    python3 scripts/safe_zone_check.py check work/<проект>/out/reel.mp4 --overlay work/<проект>/check/zones
    python3 scripts/safe_zone_check.py check work/<проект>/out/cover.jpg --overlay work/<проект>/check/zones
    python3 scripts/safe_zone_check.py cover work/<проект>/out/reel.mp4 --at 2.1,5.4,8.0 --out work/<проект>/check/cover

check — формат (1080×1920 или 1920×1080, квадратный пиксель, без поворота в метаданных) и строки
текста на кадрах каждые --every с. Три рамки:
- зона из design/tokens.json (safe) — текст за ней: стоп (красная рамка);
- запас под кнопки и подпись площадки в 9:16: сверху 15 %, снизу 25 %, слева 6 %, справа 18 % —
  текст за ним: внимание (жёлтая рамка);
- у обложки 9:16 — центральная обрезка 3:4 в сетке профиля: текст за ней — стоп (синяя рамка).
Строки текста ищет OCR macOS (Vision через swift, локально). Без него (Windows, Linux) формат
проверяется, а текст — глазами по листу кадров с рамками (--overlay).
Строки ниже --min-text-px (48) не проверяются: это обычно текст внутри съёмки, а не титры.

cover — кадры-кандидаты обложки из ролика (--at, секунды) в полном размере и лист сравнения,
на котором у каждого отмечена обрезка 3:4.
"""

from __future__ import annotations

import argparse
import json
import platform
import shutil
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from cadence_paths import (  # noqa: E402
    RELEASE_ROOT, CadenceError, check_output, ffmpeg_cmd, first_stream, main_guard, probe, require_input, run,
)

TARGETS = {(1080, 1920): 'vertical', (1920, 1080): 'horizontal'}
PLATFORM_9x16 = {'top': 0.15, 'bottom': 0.25, 'left': 0.06, 'right': 0.18}  # те же доли, что в engine/lib/reel-layout.js
TOLERANCE = 16  # px: рамка OCR чуть шире самих букв
IMAGE_EXT = {'.jpg', '.jpeg', '.png', '.webp'}
COLORS = {'tokens': 'red', 'platform': 'yellow', 'grid': 'blue'}
SIDES_RU = {'top': 'сверху', 'bottom': 'снизу', 'left': 'слева', 'right': 'справа'}

OCR_SWIFT = r'''
import Foundation
import ImageIO
import Vision
var rows: [[String: Any]] = []
for path in CommandLine.arguments.dropFirst() {
    guard let source = CGImageSourceCreateWithURL(URL(fileURLWithPath: path) as CFURL, nil),
          let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else { continue }
    let w = Double(image.width), h = Double(image.height)
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.recognitionLanguages = ["ru-RU", "en-US"]
    request.usesLanguageCorrection = false
    try? VNImageRequestHandler(cgImage: image, options: [:]).perform([request])
    for item in request.results ?? [] {
        guard let best = item.topCandidates(1).first else { continue }
        let b = item.boundingBox
        rows.append(["file": path, "text": best.string, "conf": Double(best.confidence),
                     "x": b.minX * w, "y": (1 - b.maxY) * h, "w": b.width * w, "h": b.height * h])
    }
}
FileHandle.standardOutput.write(try JSONSerialization.data(withJSONObject: rows))
'''


# ---------------------------------------------------------------- зоны

def token_zone(width: int, height: int, tokens: Path | None = None) -> dict | None:
    """Отступы {top, bottom, left, right} в пикселях из design/tokens.json → safe."""
    kind = TARGETS.get((width, height))
    try:
        safe = json.loads((tokens or RELEASE_ROOT / 'design/tokens.json').read_text(encoding='utf-8'))['safe'][kind]
        return {'top': int(safe['top']), 'bottom': int(safe['bottom']), 'left': int(safe['side']), 'right': int(safe['side'])}
    except (OSError, ValueError, KeyError, TypeError):
        return None


def platform_zone(width: int, height: int) -> dict | None:
    if width * 16 != height * 9:
        return None
    return {side: round(share * (height if side in ('top', 'bottom') else width)) for side, share in PLATFORM_9x16.items()}


def grid_zone(width: int, height: int) -> dict | None:
    """Обрезка 3:4 по центру — так обложку 9:16 показывает сетка профиля."""
    if width * 16 != height * 9:
        return None
    pad = (height - width * 4 // 3) // 2
    return {'top': pad, 'bottom': pad, 'left': 0, 'right': 0}


def outside(box: dict, zone: dict, width: int, height: int, tolerance: int = 0) -> list[str]:
    """Стороны зоны, за которые выходит рамка строки текста."""
    sides = []
    if box['y'] < zone['top'] - tolerance:
        sides.append('top')
    if box['y'] + box['h'] > height - zone['bottom'] + tolerance:
        sides.append('bottom')
    if box['x'] < zone['left'] - tolerance:
        sides.append('left')
    if box['x'] + box['w'] > width - zone['right'] + tolerance:
        sides.append('right')
    return sides


def format_rows(info: dict) -> list[dict]:
    v = first_stream(info, 'video') or {}
    w, h = int(v.get('width', 0)), int(v.get('height', 0))
    rotation = 0
    for side in v.get('side_data_list', []) or []:
        if 'rotation' in side:
            rotation = int(float(side['rotation']))
    rotation = rotation or int(float((v.get('tags') or {}).get('rotate', 0) or 0))
    sar = v.get('sample_aspect_ratio') or '1:1'
    rows = [{'level': 'ок' if (w, h) in TARGETS else 'стоп', 'what': 'кадр',
             'text': f'{w}×{h}' + ('' if (w, h) in TARGETS else ' — нужен 1080×1920 или 1920×1080')}]
    rows.append({'level': 'ок' if sar in ('1:1', '0:1', 'N/A') else 'стоп', 'what': 'пиксель',
                 'text': 'квадратный' if sar in ('1:1', '0:1', 'N/A') else f'SAR {sar} — площадка растянет кадр'})
    rows.append({'level': 'стоп' if rotation % 360 else 'ок', 'what': 'поворот',
                 'text': f'в метаданных {rotation}° — площадка повернёт кадр' if rotation % 360 else 'нет'})
    return rows


# ---------------------------------------------------------------- кадры и OCR

def extract_frames(path: Path, every: float, out: Path, is_image: bool) -> list[tuple[float, Path]]:
    if is_image:
        return [(0.0, path)]
    run(ffmpeg_cmd('-v', 'error', '-i', path, '-vf', f'fps=1/{every}', '-q:v', '3', out / 'f_%05d.jpg'))
    return [((int(f.stem[2:]) - 1) * every, f) for f in sorted(out.glob('f_*.jpg'))]


def ocr_available() -> bool:
    return platform.system() == 'Darwin' and bool(shutil.which('swift'))


def ocr(frames: list[Path], tmp: Path) -> list[dict]:
    script = tmp / 'ocr_boxes.swift'
    script.write_text(OCR_SWIFT, encoding='utf-8')
    boxes: list[dict] = []
    for i in range(0, len(frames), 40):  # пачками: каждый запуск swift заново компилирует скрипт
        out = run([shutil.which('swift'), script, *frames[i:i + 40]]).stdout
        boxes += json.loads(out or '[]')
    return boxes


def boxes_filter(width: int, height: int, zones: dict) -> str:
    parts = []
    for name, z in zones.items():
        if z:
            parts.append(f"drawbox=x={z['left']}:y={z['top']}:w={width - z['left'] - z['right']}:"
                         f"h={height - z['top'] - z['bottom']}:color={COLORS[name]}@0.9:t=8")
    return ','.join(parts) or 'null'


def overlay_sheets(path: Path, every: float, width: int, height: int, zones: dict, out: Path, is_image: bool) -> list[Path]:
    out.mkdir(parents=True, exist_ok=True)
    boxes = boxes_filter(width, height, zones)
    if is_image:
        dest = check_output(out / 'zones-cover.png', [path], overwrite=True)
        run(ffmpeg_cmd('-v', 'error', '-y', '-i', path, '-vf', boxes, dest))
        return [dest]
    for old in out.glob('zones-sheet-*.png'):
        old.unlink()
    stamp = "drawtext=text='%{pts\\:hms}':x=6:y=6:fontsize=18:fontcolor=white:box=1:boxcolor=black@0.6,"
    for label in (stamp, ''):  # ffmpeg без шрифтов (drawtext) — лист без таймкода
        try:
            run(ffmpeg_cmd('-v', 'error', '-y', '-i', path, '-vf', f'fps=1/{every},{boxes},scale=270:-2,{label}tile=6x4',
                           out / 'zones-sheet-%02d.png'))
            break
        except CadenceError:
            if not label:
                raise
    return sorted(out.glob('zones-sheet-*.png'))


# ---------------------------------------------------------------- команды

def cmd_check(args: argparse.Namespace) -> dict:
    path = require_input(args.input, 'ролик или обложку')
    info = probe(path)
    rows = format_rows(info)
    v = first_stream(info, 'video') or {}
    width, height = int(v.get('width', 0)), int(v.get('height', 0))
    is_image = path.suffix.lower() in IMAGE_EXT
    zones = {'tokens': token_zone(width, height), 'platform': platform_zone(width, height),
             'grid': grid_zone(width, height) if is_image else None}
    use_ocr = args.ocr == 'on' or (args.ocr == 'auto' and ocr_available())
    if args.ocr == 'on' and not ocr_available():
        raise CadenceError('OCR есть только на macOS со swift (Xcode Command Line Tools). Запусти с --ocr off и смотри лист с рамками.')
    found: dict[tuple, dict] = {}
    sheets: list[Path] = []
    with tempfile.TemporaryDirectory(prefix='cadence-zones-') as tmp:
        tmp = Path(tmp)
        frames = extract_frames(path, args.every, tmp, is_image) if use_ocr else []
        times = {str(f): t for t, f in frames}
        boxes = ocr([f for _, f in frames], tmp) if use_ocr else []
        for box in boxes:
            if box['h'] < args.min_text_px or box['conf'] < 0.5 or len(box['text'].strip()) < 2:
                continue
            for level, name, tol in (('стоп', 'tokens', TOLERANCE), ('стоп', 'grid', 0), ('внимание', 'platform', 0)):
                zone = zones[name]
                sides = outside(box, zone, width, height, tol) if zone else []
                if not sides:
                    continue
                t = times.get(box['file'], 0.0)
                key = (level, name, box['text'].strip(), ','.join(sides))
                item = found.setdefault(key, {'from': t, 'to': t, 'frames': 0,
                                              'box': [round(box[k]) for k in ('x', 'y', 'w', 'h')]})
                item['from'], item['to'] = min(item['from'], t), max(item['to'], t)
                item['frames'] += 1
                break  # за жёсткой рамкой — уже стоп, мягкую не добавляем
    if args.overlay:
        sheets = overlay_sheets(path, args.every, width, height, zones, Path(args.overlay).expanduser(), is_image)
    where = {'tokens': 'за зоной design/tokens.json', 'grid': 'срежется в сетке профиля 3:4',
             'platform': 'под кнопками или подписью площадки'}
    for (level, name, text, sides), item in found.items():
        single = not is_image and item['frames'] < 2  # одна выборка — обычно влёт текста: показать, не валить
        span = '' if is_image else f"{item['from']:.1f}–{item['to']:.1f} с: "
        rows.append({'level': 'внимание' if single else level, 'what': 'текст',
                     'text': f"{span}«{text[:60]}» — {where[name]} ({', '.join(SIDES_RU[x] for x in sides.split(','))}), "
                             f"рамка {item['box']}"
                             + (' — мелькает в одной выборке' if single else '')})
    if use_ocr and not found:
        rows.append({'level': 'ок', 'what': 'текст', 'text': 'все строки текста внутри рамок'})
    if not use_ocr:
        rows.append({'level': 'внимание', 'what': 'текст', 'text': 'автоматически не проверен (OCR только на macOS) — '
                     + ('смотри лист с рамками' if sheets else 'запусти с --overlay <папка> и смотри лист с рамками')})
    return {'file': path.name, 'size': [width, height], 'zones': zones, 'ocr': use_ocr,
            'checks': rows, 'overlay': [str(s) for s in sheets]}


def cmd_cover(args: argparse.Namespace) -> dict:
    path = require_input(args.input, 'ролик')
    info = probe(path)
    v = first_stream(info, 'video') or {}
    width, height = int(v.get('width', 0)), int(v.get('height', 0))
    grid = grid_zone(width, height)
    if not grid:
        raise CadenceError(f'Обложка с обрезкой 3:4 — только для 9:16, а кадр {width}×{height}')
    times = [float(x) for x in args.at.split(',') if x.strip()]
    if not times:
        raise CadenceError('Укажи кадры-кандидаты: --at 2.1,5.4,8.0')
    out = Path(args.out).expanduser()
    out.mkdir(parents=True, exist_ok=True)
    picks = []
    for t in times:
        dest = check_output(out / f'cover-{t:06.2f}s.png', [path], overwrite=True)
        run(ffmpeg_cmd('-v', 'error', '-y', '-ss', f'{t:.3f}', '-i', path, '-frames:v', '1', dest))
        picks.append(dest)
    box = boxes_filter(width, height, {'grid': grid})
    inputs = [a for p in picks for a in ('-i', p)]
    chains = ''.join(f'[{i}:v]{box},scale=360:-2[c{i}];' for i in range(len(picks)))
    graph = chains + (''.join(f'[c{i}]' for i in range(len(picks))) + f'hstack=inputs={len(picks)}[s]' if len(picks) > 1 else '[c0]null[s]')
    sheet = check_output(out / 'cover-sheet.png', [path], overwrite=True)
    run(ffmpeg_cmd('-v', 'error', '-y', *inputs, '-filter_complex', graph, '-map', '[s]', sheet))
    rows = [{'level': 'ок', 'what': 'кандидаты', 'text': f'кадров: {len(picks)}, лист сравнения с обрезкой 3:4 — {sheet}'}]
    return {'file': path.name, 'grid': grid, 'checks': rows, 'covers': [str(p) for p in picks], 'sheet': str(sheet)}


def main() -> int:
    ap = argparse.ArgumentParser(description='Формат кадра и текст в безопасных зонах ролика или обложки.')
    sub = ap.add_subparsers(dest='command', required=True)
    c = sub.add_parser('check', help='проверить ролик или обложку')
    c.add_argument('input', help='mp4/mov или jpg/png')
    c.add_argument('--every', type=float, default=0.5, help='шаг кадров, секунды')
    c.add_argument('--min-text-px', type=float, default=48, help='строки ниже этой высоты не проверяются')
    c.add_argument('--ocr', choices=('auto', 'on', 'off'), default='auto', help='поиск строк текста (macOS)')
    c.add_argument('--overlay', help='папка для листов кадров с рамками зон')
    c.add_argument('--json', action='store_true')
    c.set_defaults(func=cmd_check)
    k = sub.add_parser('cover', help='кадры-кандидаты обложки и лист сравнения с обрезкой 3:4')
    k.add_argument('input', help='готовый ролик 9:16')
    k.add_argument('--at', required=True, help='секунды через запятую, 2–3 кадра')
    k.add_argument('--out', required=True, help='папка для кадров и листа')
    k.add_argument('--json', action='store_true')
    k.set_defaults(func=cmd_cover)
    args = ap.parse_args()
    result = args.func(args)
    rows = result['checks']
    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(result['file'])
        for r in rows:
            print(f"  {r['level']:<8} {r['what']}: {r['text']}")
        for s in result.get('overlay', []):
            print(f'  лист с рамками: {s}')
        stops = sum(r['level'] == 'стоп' for r in rows)
        print(f"итог: {'стоп' if stops else 'технически ок'}. Лица и важные детали у края смотри глазами.")
    return 1 if any(r['level'] == 'стоп' for r in rows) else 0


if __name__ == '__main__':
    main_guard(main)
