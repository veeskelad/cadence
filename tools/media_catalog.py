#!/usr/bin/env python3
"""Каталог медиа Cadence: media/manifest.json и ссылки ?v= в index.html.

Один источник роликов и картинок для сайта, Mini App off-grid и других мест.
Заменил файл в media/ → запусти без флагов: пересчитаются размер, sha256, кадр и
длительность в манифесте, а в index.html обновится ?v=<sha8> у ссылок на этот файл.

  python3 tools/media_catalog.py          # обновить манифест и ссылки
  python3 tools/media_catalog.py --check  # только проверить, код 1 при расхождении

Новый файл: положить в media/ и добавить запись в manifest.json (file, title, used),
остальные поля скрипт заполнит сам.
"""
import hashlib
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MEDIA = ROOT / 'media'
MANIFEST = MEDIA / 'manifest.json'
PAGE = ROOT / 'index.html'
TYPES = {'.mp4': 'video/mp4', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml'}


def probe(path):
    if not shutil.which('ffprobe') or path.suffix == '.svg':
        return {}
    out = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries',
                          'stream=width,height:format=duration', '-of', 'json', str(path)],
                         capture_output=True, text=True, check=True).stdout
    data = json.loads(out)
    st = (data.get('streams') or [{}])[0]
    info = {'width': st.get('width'), 'height': st.get('height')}
    if path.suffix == '.mp4':
        info['duration'] = round(float(data['format']['duration']), 2)
    return {k: v for k, v in info.items() if v is not None}


def main():
    check = '--check' in sys.argv
    man = json.loads(MANIFEST.read_text(encoding='utf8'))
    page = PAGE.read_text(encoding='utf8')
    problems, new_page = [], page
    names = {e['file'] for e in man['files']}
    on_disk = {p.name for p in MEDIA.iterdir() if p.name != 'manifest.json'}
    problems += [f'нет записи в манифесте: media/{n}' for n in sorted(on_disk - names)]
    for e in man['files']:
        p = MEDIA / e['file']
        if not p.exists():
            problems.append(f'нет файла: media/{e["file"]}')
            continue
        b = p.read_bytes()
        fresh = {'type': TYPES.get(p.suffix, 'application/octet-stream'), 'bytes': len(b),
                 'sha256': hashlib.sha256(b).hexdigest(), **probe(p)}
        for k, v in fresh.items():
            if e.get(k) != v:
                problems.append(f'{e["file"]}: {k} {e.get(k)} → {v}')
                e[k] = v
        v8 = e['sha256'][:8]
        new_page = re.sub(r'(media/' + re.escape(e['file']) + r')\?v=[0-9a-f]+', r'\1?v=' + v8, new_page)
    for ref in sorted(set(re.findall(r'media/([\w.-]+)\?v=', new_page)) - names):
        problems.append(f'index.html ссылается на файл вне каталога: media/{ref}')
    if new_page != page:
        problems.append('index.html: устаревшие ?v= у ссылок на медиа')
    if check:
        print('\n'.join(problems) or 'каталог в порядке')
        sys.exit(1 if problems else 0)
    MANIFEST.write_text(json.dumps(man, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    PAGE.write_text(new_page, encoding='utf8')
    print('\n'.join(problems) or 'изменений нет')


if __name__ == '__main__':
    main()
