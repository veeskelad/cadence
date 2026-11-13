#!/usr/bin/env python3
"""DaVinci Resolve: что есть и что открыто. Только чтение — ничего не создаёт и не сохраняет.

    python3 scripts/resolve_check.py
    python3 scripts/resolve_check.py --json

Ищет модуль скриптинга только в стандартных местах установки (или по RESOLVE_SCRIPT_API),
диск не сканирует. Отвечает на три вопроса: установлен ли Resolve, отвечает ли он скриптам,
какой проект и таймлайны открыты.
"""

from __future__ import annotations

import argparse
import importlib
import json
import os
import sys
from pathlib import Path

MODULES = {
    'darwin': '/Library/Application Support/Blackmagic Design/DaVinci Resolve/Developer/Scripting/Modules',
    'win32': os.path.expandvars(r'%PROGRAMDATA%\Blackmagic Design\DaVinci Resolve\Support\Developer\Scripting\Modules'),
    'linux': '/opt/resolve/Developer/Scripting/Modules',
}
APP = {'darwin': '/Applications/DaVinci Resolve/DaVinci Resolve.app',
       'win32': os.path.expandvars(r'%PROGRAMFILES%\Blackmagic Design\DaVinci Resolve\Resolve.exe'),
       'linux': '/opt/resolve/bin/resolve'}


def check() -> dict:
    plat = 'darwin' if sys.platform == 'darwin' else 'win32' if sys.platform.startswith('win') else 'linux'
    r: dict = {'installed': Path(APP[plat]).exists(), 'scripting_module': False, 'responds': False}
    base = os.environ.get('RESOLVE_SCRIPT_API')
    mod_dir = Path(base, 'Modules') if base else Path(MODULES[plat])
    r['scripting_module'] = (mod_dir / 'DaVinciResolveScript.py').exists()
    if not r['scripting_module']:
        r['next'] = ('Resolve не найден в стандартной папке. Не установлен — монтаж пойдёт без него (EDL открывается в любом редакторе). '
                     'Стоит в другом месте — укажи путь к папке Developer/Scripting в RESOLVE_SCRIPT_API.')
        return r
    sys.path.append(str(mod_dir))
    try:
        dvr = importlib.import_module('DaVinciResolveScript')
        app = dvr.scriptapp('Resolve')
    except Exception as exc:  # модуль есть, но не грузится: другая версия Python или нет библиотеки
        r['next'] = f'Модуль скриптинга не загрузился: {exc}. Работаем ручной передачей (EDL и инструкция по меню).'
        return r
    if not app:
        r['next'] = ('Resolve не отвечает. Открой его; в Preferences → System → General → External scripting using '
                     'выбери Local. Внешний скриптинг есть в Resolve Studio; в бесплатной версии — ручная передача.')
        return r
    r['responds'] = True
    r['version'] = app.GetVersionString()
    r['product'] = app.GetProductName() if hasattr(app, 'GetProductName') else None
    r['page'] = app.GetCurrentPage()
    project = app.GetProjectManager().GetCurrentProject()
    if project is None:
        r['next'] = 'Ответа о проекте нет: возможно, открыто окно менеджера проектов или диалог. Закрой его и запусти снова.'
        return r
    r['project'] = project.GetName()
    r['timelines'] = []
    for i in range(1, (project.GetTimelineCount() or 0) + 1):
        t = project.GetTimelineByIndex(i)
        r['timelines'].append({'name': t.GetName(), 'fps': t.GetSetting('timelineFrameRate'),
                               'video_tracks': t.GetTrackCount('video'), 'audio_tracks': t.GetTrackCount('audio')})
    r['next'] = ('Только чтение выполнено. Правка этого проекта — после копии (Export Project → .drp) и подтверждения человека; '
                 'безопаснее новый проект cadence-<проект>.')
    return r


def main() -> int:
    ap = argparse.ArgumentParser(description='DaVinci Resolve: только чтение состояния.')
    ap.add_argument('--json', action='store_true')
    args = ap.parse_args()
    r = check()
    if args.json:
        print(json.dumps(r, ensure_ascii=False, indent=2))
        return 0
    yn = {True: 'да', False: 'нет'}
    print(f"Resolve установлен: {yn[r['installed']]} · модуль скриптинга: {yn[r['scripting_module']]} · отвечает: {yn[r['responds']]}")
    if r['responds']:
        print(f"{r.get('product') or 'DaVinci Resolve'} {r['version']} · страница: {r['page']}")
        if 'project' in r:
            print(f"проект: {r['project']}")
            for t in r['timelines']:
                print(f"  таймлайн {t['name']}: {t['fps']} к/с, видео {t['video_tracks']}, звук {t['audio_tracks']}")
    print(r['next'])
    return 0


if __name__ == '__main__':
    sys.exit(main())
