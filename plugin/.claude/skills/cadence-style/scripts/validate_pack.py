#!/usr/bin/env python3
"""Проверка пака стиля Cadence: структура pack.json, контраст по WCAG, шрифты.

  python3 validate_pack.py design/packs/<id>/pack.json [ещё паки ...]
  python3 validate_pack.py --all                 # все паки в design/packs/
  python3 validate_pack.py <pack.json> --json    # результат для программы

Код выхода: 0 — пак годен (предупреждения допустимы), 1 — есть ошибки, 2 — нечего проверять.
Только стандартная библиотека Python, сеть не нужна.
"""

from __future__ import annotations

import argparse
import colorsys
import json
import re
import sys
from pathlib import Path

HEX = re.compile(r'^#[0-9A-Fa-f]{6}$')
ID = re.compile(r'^[a-z0-9][a-z0-9-]*$')
SCHEMA = re.compile(r'^[a-z0-9-]+\.style-pack\.v1$')
TOP = {'schemaVersion', 'id', 'title', 'wordmark', 'colors', 'typography', 'fonts', 'radii', 'stroke',
       'shadow', 'decor', 'motion', 'provenance'}
REQUIRED = TOP - {'wordmark', 'provenance'}
COLORS_REQUIRED = ['canvas', 'surface', 'ink', 'muted', 'signal', 'signalSoft', 'signalSecondary', 'line', 'positive']
COLORS_ALL = COLORS_REQUIRED + ['onSignal']
FACE_KEYS = {'family', 'weight', 'trackingEm', 'transform', 'sizeScale'}

# (текст, фон, порог, ошибка или предупреждение, зачем)
PAIRS = [
    ('ink', 'canvas', 4.5, True, 'основной текст на фоне'),
    ('ink', 'surface', 4.5, True, 'основной текст на карточке'),
    ('muted', 'canvas', 4.5, True, 'подписи на фоне'),
    ('muted', 'surface', 4.5, True, 'подписи на карточке'),
    ('onSignal', 'signal', 4.5, True, 'текст поверх акцента'),
    ('signal', 'canvas', 3.0, True, 'акцент на фоне (крупная графика)'),
    ('signalSecondary', 'canvas', 3.0, False, 'второй акцент на фоне'),
    ('positive', 'canvas', 3.0, False, '«успех» на фоне'),
]


def rgb(hex_: str) -> tuple[float, float, float]:
    return tuple(int(hex_[i:i + 2], 16) / 255 for i in (1, 3, 5))


def to_hex(c: tuple[float, float, float]) -> str:
    return '#' + ''.join(f'{round(max(0.0, min(1.0, v)) * 255):02X}' for v in c)


def luminance(hex_: str) -> float:
    def lin(v: float) -> float:
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    r, g, b = (lin(v) for v in rgb(hex_))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a: str, b: str) -> float:
    la, lb = luminance(a), luminance(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def suggest(fg: str, bg: str, need: float) -> str | None:
    """Ближайший по светлоте цвет того же оттенка, который проходит порог на этом фоне."""
    h, l, s = colorsys.rgb_to_hls(*rgb(fg))
    lighter = luminance(fg) >= luminance(bg)
    best = None
    for direction in ([1, -1] if lighter else [-1, 1]):
        for step in range(1, 101):
            nl = l + direction * step / 100
            if not 0 <= nl <= 1:
                break
            cand = to_hex(colorsys.hls_to_rgb(h, nl, s))
            if contrast(cand, bg) >= need:
                if best is None or step < best[0]:
                    best = (step, cand)
                break
    return best[1] if best else None


def check(path: Path, root: Path | None) -> dict:
    errors: list[str] = []
    warnings: list[str] = []
    notes: list[str] = []
    try:
        pack = json.loads(path.read_text(encoding='utf-8'))
    except FileNotFoundError:
        return {'file': str(path), 'ok': False, 'errors': ['файл не найден'], 'warnings': [], 'notes': []}
    except json.JSONDecodeError as e:
        return {'file': str(path), 'ok': False, 'errors': [f'не JSON: {e}'], 'warnings': [], 'notes': []}
    if not isinstance(pack, dict):
        return {'file': str(path), 'ok': False, 'errors': ['пак должен быть объектом JSON'], 'warnings': [], 'notes': []}

    def need_obj(key: str) -> dict:
        v = pack.get(key)
        if not isinstance(v, dict):
            errors.append(f'{key}: нужен объект')
            return {}
        return v

    def number(where: str, v, lo: float | None = None, hi: float | None = None, integer: bool = False) -> None:
        if isinstance(v, bool) or not isinstance(v, (int, float)) or (integer and not isinstance(v, int)):
            errors.append(f'{where}: нужно {"целое " if integer else ""}число, сейчас {v!r}')
            return
        if lo is not None and v < lo or hi is not None and v > hi:
            errors.append(f'{where}: {v} вне диапазона {lo}…{hi}')

    for k in sorted(REQUIRED - pack.keys()):
        errors.append(f'нет поля {k}')
    for k in sorted(pack.keys() - TOP):
        errors.append(f'лишнее поле {k}')

    sv = pack.get('schemaVersion')
    if sv is not None and not (isinstance(sv, str) and SCHEMA.match(sv)):
        errors.append(f'schemaVersion {sv!r}: ожидается вида cadence.style-pack.v1')
    elif isinstance(sv, str) and not sv.startswith('cadence.'):
        notes.append(f'schemaVersion {sv!r}: для новых паков — cadence.style-pack.v1')

    pid = pack.get('id')
    if pid is not None:
        if not (isinstance(pid, str) and ID.match(pid)):
            errors.append(f'id {pid!r}: латиница в нижнем регистре, цифры и дефис')
        elif path.parent.name != pid and path.name == 'pack.json':
            warnings.append(f'id {pid!r} не совпадает с папкой {path.parent.name!r}: сборщик ищет пак по имени папки')
    if 'title' in pack and not (isinstance(pack['title'], str) and pack['title']):
        errors.append('title: нужна непустая строка')
    if 'wordmark' in pack and not (isinstance(pack['wordmark'], str) and len(pack['wordmark']) <= 24):
        errors.append('wordmark: строка до 24 знаков')

    colors = need_obj('colors') if 'colors' in pack else {}
    for k in COLORS_REQUIRED:
        if colors and k not in colors:
            errors.append(f'colors.{k}: нет цвета')
    for k, v in colors.items():
        if k not in COLORS_ALL:
            errors.append(f'colors.{k}: неизвестная роль (есть: {", ".join(COLORS_ALL)})')
        elif not (isinstance(v, str) and HEX.match(v)):
            errors.append(f'colors.{k}: {v!r} — нужен цвет вида #RRGGBB')
    good = {k: v for k, v in colors.items() if isinstance(v, str) and HEX.match(v)}
    if 'onSignal' not in good and 'signal' in good:
        auto = max((good.get('canvas'), good.get('ink')), key=lambda c: contrast(c, good['signal']) if c else 0)
        if auto:
            notes.append(f'colors.onSignal не задан — текст на акценте возьмётся {auto}')
            good['onSignal'] = auto

    contrasts = []
    for fg, bg, need, hard, why in PAIRS:
        if fg not in good or bg not in good:
            continue
        ratio = contrast(good[fg], good[bg])
        row = {'pair': f'{fg} / {bg}', 'ratio': round(ratio, 2), 'need': need, 'ok': ratio >= need}
        contrasts.append(row)
        if ratio < need:
            fix = suggest(good[fg], good[bg], need)
            msg = f'контраст {fg} {good[fg]} на {bg} {good[bg]} = {ratio:.2f} : 1, нужно {need} ({why})'
            if fix:
                msg += f'; ближайший проходящий {fg}: {fix} ({contrast(fix, good[bg]):.2f} : 1)'
            (errors if hard else warnings).append(msg)

    typo = need_obj('typography') if 'typography' in pack else {}
    for face in ('display', 'body', 'mono'):
        if typo and face not in typo:
            errors.append(f'typography.{face}: нет')
    for face, spec in typo.items():
        where = f'typography.{face}'
        if face not in ('display', 'body', 'mono'):
            errors.append(f'{where}: лишнее лицо (есть display, body, mono)')
            continue
        if not isinstance(spec, dict):
            errors.append(f'{where}: нужен объект')
            continue
        for k in sorted(spec.keys() - FACE_KEYS):
            errors.append(f'{where}.{k}: лишнее поле')
        if not (isinstance(spec.get('family'), str) and spec['family']):
            errors.append(f'{where}.family: нужна строка с семейством шрифта')
        if 'weight' in spec:
            number(f'{where}.weight', spec['weight'], 100, 900, integer=True)
        if 'trackingEm' in spec:
            number(f'{where}.trackingEm', spec['trackingEm'], -0.2, 0.4)
        if 'sizeScale' in spec:
            number(f'{where}.sizeScale', spec['sizeScale'], 0.6, 1.4)
        if 'transform' in spec and spec['transform'] not in ('none', 'uppercase', 'lowercase'):
            errors.append(f'{where}.transform: none, uppercase или lowercase')

    fonts = pack.get('fonts')
    if 'fonts' in pack:
        if not (isinstance(fonts, list) and all(isinstance(f, str) and ID.match(f) for f in fonts)):
            errors.append('fonts: список имён папок шрифтов (латиница, дефис)')
        elif len(set(fonts)) != len(fonts):
            errors.append('fonts: имена повторяются')
        elif root is not None:
            fdir = root / 'engine' / 'fonts'
            if fdir.is_dir():
                for f in fonts:
                    if not (fdir / f).is_dir():
                        errors.append(f'fonts: нет папки engine/fonts/{f} — шрифт не встанет в рендер')

    for key, fields in (('radii', ('small', 'medium', 'large', 'pill')), ('stroke', ('hairline', 'regular', 'emphasis'))):
        obj = need_obj(key) if key in pack else {}
        for f in fields:
            if obj and f not in obj:
                errors.append(f'{key}.{f}: нет')
        for f, v in obj.items():
            if f not in fields:
                errors.append(f'{key}.{f}: лишнее поле')
            else:
                number(f'{key}.{f}', v, 0)

    shadow = need_obj('shadow') if 'shadow' in pack else {}
    if shadow:
        card = shadow.get('card')
        if not (isinstance(card, str) and card):
            errors.append('shadow.card: строка CSS box-shadow или "none"')
        else:
            for role in re.findall(r'\{(\w+)\}', card):
                if role not in COLORS_ALL:
                    errors.append(f'shadow.card: {{{role}}} — нет такой роли цвета')
        for k in shadow.keys() - {'card'}:
            errors.append(f'shadow.{k}: лишнее поле')

    decor = need_obj('decor') if 'decor' in pack else {}
    for f in ('grid', 'brackets', 'accentBlob'):
        if decor and not isinstance(decor.get(f), bool):
            errors.append(f'decor.{f}: true или false')
    if 'gridSize' in decor:
        number('decor.gridSize', decor['gridSize'], 8, integer=True)
    for k in decor.keys() - {'grid', 'gridSize', 'brackets', 'accentBlob'}:
        errors.append(f'decor.{k}: лишнее поле')

    motion = need_obj('motion') if 'motion' in pack else {}
    if motion and motion.get('character') not in ('hard', 'soft', 'editorial'):
        errors.append('motion.character: hard, soft или editorial')
    for k in motion.keys() - {'character'}:
        errors.append(f'motion.{k}: лишнее поле')

    prov = pack.get('provenance')
    if prov is not None:
        if not isinstance(prov, dict):
            errors.append('provenance: нужен объект')
        else:
            for k in prov.keys() - {'base', 'references', 'notes'}:
                errors.append(f'provenance.{k}: лишнее поле')
            if 'references' in prov and not (isinstance(prov['references'], list) and all(isinstance(r, str) for r in prov['references'])):
                errors.append('provenance.references: список строк')
            if 'notes' in prov and not isinstance(prov['notes'], str):
                errors.append('provenance.notes: строка')
            if 'base' in prov and prov['base'] is not None and not isinstance(prov['base'], str):
                errors.append('provenance.base: строка или null')

    return {'file': str(path), 'ok': not errors, 'errors': errors, 'warnings': warnings, 'notes': notes,
            'contrast': contrasts}


def find_root(start: Path) -> Path | None:
    for p in [start, *start.parents]:
        if (p / 'engine').is_dir() and (p / 'design').is_dir():
            return p
    return None


def main() -> int:
    ap = argparse.ArgumentParser(description='Проверка пака стиля Cadence')
    ap.add_argument('packs', nargs='*', type=Path)
    ap.add_argument('--all', action='store_true', help='проверить все design/packs/*/pack.json')
    ap.add_argument('--json', action='store_true', help='вывод JSON')
    a = ap.parse_args()

    paths = list(a.packs)
    if a.all:
        root = find_root(Path.cwd().resolve()) or find_root(Path(__file__).resolve().parent)
        if root:
            paths += sorted((root / 'design' / 'packs').glob('*/pack.json'))
    if not paths:
        ap.print_usage(sys.stderr)
        print('Укажи pack.json или --all', file=sys.stderr)
        return 2

    results = [check(p, find_root(p.resolve().parent)) for p in paths]
    if a.json:
        print(json.dumps(results, ensure_ascii=False, indent=1))
    else:
        for r in results:
            print(f"{'ГОДЕН' if r['ok'] else 'ОШИБКИ'}  {r['file']}")
            for row in r.get('contrast', []):
                mark = 'ok' if row['ok'] else '!!'
                print(f"  {mark} {row['pair']:28s} {row['ratio']:5.2f} : 1  (нужно {row['need']})")
            for e in r['errors']:
                print(f'  ошибка: {e}')
            for w in r['warnings']:
                print(f'  предупреждение: {w}')
            for n in r['notes']:
                print(f'  заметка: {n}')
    return 0 if all(r['ok'] for r in results) else 1


if __name__ == '__main__':
    sys.exit(main())
