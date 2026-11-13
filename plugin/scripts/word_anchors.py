#!/usr/bin/env python3
"""Привязка графики к словам речи: в сценарии вместо секунд — ссылки на слова.

    python3 scripts/word_anchors.py --words work/<проект>/out/talk-cut.words.json \\
        --film work/<проект>/film.json --out work/<проект>/film.resolved.json

words.json — слова смонтированного ролика из cadence-cut ({"words": [{"w", "start", "end"}]}).
После каждой перерезки слова снимаются заново, а этот скрипт запускается ещё раз: вся графика
едет за речью, ни одно число руками не переставляется.

В сценарии — блок "anchors" и ссылки вида "@id", "@id+0.2", "@id-0.35" на месте любого времени:
    "anchors": {"key": {"word": "монтаж"}, "two": {"word": "код", "n": 2},
                "act": {"word": "добавляет", "offset": -0.1}, "end": {"word": "на нужном слове", "after": "act"}}
    "captions": [{"from": "@act-0.2", "to": "@end+1.2", "items": [{"w": "СЛОВО", "at": "@act"}]}]
word — слово или фраза подряд; n — какое вхождение (с 1); after — искать только после другого якоря;
offset — сдвиг в секундах. Сравнение без регистра, краевой пунктуации и разницы ё/е. Якорь — начало
слова: конец слова у распознавания плывёт.

Выход — тот же сценарий с числами вместо ссылок, без "anchors", плюс "anchorsResolved" с контекстом
каждого якоря (показать человеку). Пути src/bg/darkBg пересчитываются от места выхода. Предупреждает,
когда граница блока from/to попадает в паузу речи ≥ --gap: там лучше резкий вход или выход.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from cadence_paths import CadenceError, main_guard, require_input, same_file, write_json  # noqa: E402

PUNCT = re.compile(r'^[\s.,!?;:…«»"\'()\[\]{}—–‐“”„-]+|[\s.,!?;:…«»"\'()\[\]{}—–‐“”„-]+$')
REF = re.compile(r'^@([A-Za-z0-9_-]+)\s*([+-]\s*\d+(?:\.\d+)?)?$')
PATH_KEYS = ('src', 'bg', 'darkBg')


def norm(word: str) -> str:
    return PUNCT.sub('', str(word)).lower().replace('ё', 'е')


def load_words(data) -> list[dict]:
    """Принимает {"words": [...]} или список; поле слова — "w" или "word"."""
    items = data.get('words', []) if isinstance(data, dict) else data
    out = []
    for w in items or []:
        text = w.get('w', w.get('word', ''))
        if isinstance(w.get('start'), (int, float)) and norm(text):
            out.append({'w': str(text).strip(), 'start': float(w['start']), 'end': float(w.get('end', w['start'])), 'key': norm(text)})
    return out


def resolve_anchors(words: list[dict], anchors: dict) -> tuple[dict, list[str]]:
    resolved: dict = {}
    errors: list[str] = []
    pending = dict(anchors or {})
    for _ in range(32):  # якоря с after ждут свою опору; повторяем, пока есть продвижение
        if not pending:
            break
        for aid, spec in list(pending.items()):
            after = spec.get('after')
            if after and after not in resolved:
                if after not in anchors:
                    errors.append(f'{aid}: after ссылается на неизвестный якорь {after}')
                    del pending[aid]
                continue
            del pending[aid]
            phrase = [k for k in (norm(p) for p in str(spec.get('word', '')).split()) if k]
            if not phrase:
                errors.append(f'{aid}: пустое word')
                continue
            since = resolved[after]['start'] if after else float('-inf')
            hits = [i for i in range(len(words) - len(phrase) + 1)
                    if words[i]['start'] > since and all(words[i + k]['key'] == key for k, key in enumerate(phrase))]
            n = int(spec.get('n', 1))
            if len(hits) < n:
                heard = [w['start'] for w in words if w['key'] == phrase[0]]
                errors.append(f"{aid}: «{spec.get('word')}» №{n} не найдено" + (f' после {after}' if after else '') +
                              f'; вхождений {len(hits)}' +
                              (f", первое слово звучит на {', '.join(f'{t:.2f}' for t in heard)} с" if heard else ', первого слова в расшифровке нет'))
                continue
            i = hits[n - 1]
            ctx = ' '.join(w['w'] for w in words[max(0, i - 3): i + len(phrase) + 3])
            resolved[aid] = {'time': round(words[i]['start'] + float(spec.get('offset', 0)), 3), 'start': words[i]['start'],
                             'word': words[i]['w'], 'occurrence': n, 'of': len(hits), 'context': ctx}
    errors += [f'{aid}: цикл в after' for aid in pending]
    return resolved, errors


def substitute(node, resolved: dict, errors: list[str], where: str = ''):
    if isinstance(node, str):
        m = REF.match(node.strip())
        if not m:
            return node
        aid, shift = m.groups()
        if aid not in resolved:
            errors.append(f'{where or "корень"}: ссылка на неразрешённый якорь @{aid}')
            return node
        return round(resolved[aid]['time'] + (float(shift.replace(' ', '')) if shift else 0.0), 3)
    if isinstance(node, list):
        return [substitute(v, resolved, errors, f'{where}[{i}]') for i, v in enumerate(node)]
    if isinstance(node, dict):
        return {k: (v if k == 'anchors' and not where else substitute(v, resolved, errors, f'{where}.{k}' if where else k))
                for k, v in node.items()}
    return node


def rebase_paths(node, src_dir: Path, dst_dir: Path) -> None:
    """Относительные пути заданы от film.json — переводим их к папке выхода."""
    if isinstance(node, list):
        for v in node:
            rebase_paths(v, src_dir, dst_dir)
    elif isinstance(node, dict):
        for k, v in node.items():
            if k in PATH_KEYS and isinstance(v, str) and not re.match(r'^(https?:|data:|/)', v):
                node[k] = Path(os.path.relpath((src_dir / v).resolve(), dst_dir)).as_posix()
            else:
                rebase_paths(v, src_dir, dst_dir)


def check_spans(node, errors: list[str], hints: list[str], pauses: list[tuple[float, float]], where: str = '') -> None:
    """Блоки с from/to: to > from, элементы внутри блока; граница в паузе речи — подсказка."""
    if isinstance(node, list):
        for i, v in enumerate(node):
            check_spans(v, errors, hints, pauses, f'{where}[{i}]')
        return
    if not isinstance(node, dict):
        return
    a, b = node.get('from'), node.get('to')
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        if b <= a:
            errors.append(f'{where}: to {b} не больше from {a}')
        for edge, t in (('from', a), ('to', b)):
            if any(p0 < t < p1 for p0, p1 in pauses):
                hints.append(f'{where}.{edge} = {t} — внутри паузы речи: плавный {"вход" if edge == "from" else "уход"} '
                             'по тишине читается вяло, здесь лучше резко')
        for i, it in enumerate(node.get('items', []) or []):
            at = it.get('at') if isinstance(it, dict) else None
            if isinstance(at, (int, float)) and not a <= at <= b:
                errors.append(f'{where}.items[{i}]: «{it.get("w", it.get("text", ""))}» выходит на {at}, вне блока {a}–{b}')
    for k, v in node.items():
        if k != 'anchors':
            check_spans(v, errors, hints, pauses, f'{where}.{k}' if where else k)


def resolve_film(film: dict, words: list[dict], gap: float = 0.3) -> tuple[dict, list[str], list[str]]:
    resolved, errors = resolve_anchors(words, film.get('anchors') or {})
    out = substitute(film, resolved, errors)
    out.pop('anchors', None)
    pauses = [(words[i - 1]['end'], words[i]['start']) for i in range(1, len(words))
              if words[i]['start'] - words[i - 1]['end'] >= gap]
    hints: list[str] = []
    check_spans(out, errors, hints, pauses)
    out['anchorsResolved'] = {k: {kk: vv for kk, vv in v.items() if kk != 'start'} for k, v in resolved.items()}
    return out, errors, hints


def main() -> int:
    ap = argparse.ArgumentParser(description='Ссылки на слова речи в сценарии → секунды.')
    ap.add_argument('--words', required=True, help='слова ролика: <имя>-cut.words.json из cadence-cut')
    ap.add_argument('--film', required=True, help='сценарий со ссылками "@якорь"')
    ap.add_argument('--out', required=True, help='куда записать сценарий с числами')
    ap.add_argument('--gap', type=float, default=0.3, help='пауза речи, секунды: граница в ней — подсказка')
    args = ap.parse_args()
    words_path = require_input(args.words, 'слова (words.json)')
    film_path = require_input(args.film, 'сценарий')
    out_path = Path(args.out).expanduser()
    if same_file(out_path, film_path) or same_file(out_path, words_path):
        raise CadenceError('--out не может совпадать с входом: сценарий со ссылками нужен для следующей перерезки')
    try:
        words = load_words(json.loads(words_path.read_text(encoding='utf-8')))
        film = json.loads(film_path.read_text(encoding='utf-8'))
    except ValueError as exc:
        raise CadenceError(f'Не JSON: {exc}')
    if not words:
        raise CadenceError(f'В {words_path.name} нет слов со временем')
    out, errors, hints = resolve_film(film, words, args.gap)
    if errors:
        print('Не собрано:\n' + '\n'.join(f'  {e}' for e in errors), file=sys.stderr)
        return 1
    rebase_paths(out, film_path.parent, out_path.parent.resolve())
    write_json(out_path, out)
    print(f'{out_path}: якорей {len(out["anchorsResolved"])}')
    for aid, r in out['anchorsResolved'].items():
        print(f"  @{aid} = {r['time']:.3f} с  «{r['word']}» ({r['occurrence']} из {r['of']}): …{r['context']}…")
    for h in hints:
        print(f'  подсказка: {h}')
    return 0


if __name__ == '__main__':
    main_guard(main)
