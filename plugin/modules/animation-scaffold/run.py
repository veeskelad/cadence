#!/usr/bin/env python3
"""Запуск каркаса рисованной анимации: результат всегда в $WORK/<проект>/, модуль не меняется.

  python3 modules/animation-scaffold/run.py <проект> --init
      копия сцен для правки: $WORK/<проект>/scaffold/ (studio.html, src/, ссылка на node_modules)
  python3 modules/animation-scaffold/run.py <проект> --sheet=0.5,1,2 --out=out/check/a.jpg
  python3 modules/animation-scaffold/run.py <проект> --clip --out=out/video.mp4

Всё после имени проекта (кроме --init) уходит в render.mjs как есть. Папка запуска — $WORK/<проект>,
поэтому `out/...` в аргументах — это $WORK/<проект>/out/... Если есть $WORK/<проект>/scaffold/studio.html,
рендерится он, иначе встроенный пример. Сети нет; ключей нет; нужны node, ffmpeg и Chrome/Chromium.
"""
from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path

MOD = Path(__file__).resolve().parent
ROOT = MOD.parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from cadence_paths import CadenceError, main_guard, require_tool, slugify, work_root  # noqa: E402


def project_dir(name: str) -> Path:
    return work_root() / slugify(name)


def init_copy(proj: Path) -> Path:
    dest = proj / "scaffold"
    if dest.exists():
        raise CadenceError(f"Копия уже есть: {dest}. Правь сцены там; чтобы начать заново, переименуй папку.")
    dest.mkdir(parents=True)
    shutil.copy2(MOD / "studio.html", dest / "studio.html")
    shutil.copytree(MOD / "src", dest / "src")
    # ссылка работает и до установки зависимостей: она появится в модуле позже
    (dest / "node_modules").symlink_to(MOD / "node_modules", target_is_directory=True)
    return dest


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter,
                                 allow_abbrev=False, usage="run.py <проект> [--init] [аргументы render.mjs]")
    ap.add_argument("project", help="имя проекта: результат пойдёт в $WORK/<проект>/")
    ap.add_argument("--init", action="store_true", help="сделать копию сцен в $WORK/<проект>/scaffold/")
    a, render_args = ap.parse_known_args()
    proj = project_dir(a.project)
    if a.init:
        dest = init_copy(proj)
        print(f"Копия для правки: {dest}\nДобавь свои сцены в {dest}/src/scenes/ и подключи их в {dest}/studio.html")
        return 0
    node = require_tool("node")
    if not (MOD / "node_modules/puppeteer-core").exists():
        raise CadenceError("Нет зависимостей (p5, p5.brush, puppeteer-core). С согласия человека: "
                           "python3 scripts/module_setup.py install animation-scaffold", code=3)
    require_tool("ffmpeg")
    env = dict(os.environ)
    own = proj / "scaffold" / "studio.html"
    if own.is_file() and "SCAFFOLD_STUDIO" not in env:
        env["SCAFFOLD_STUDIO"] = str(own)
    proj.mkdir(parents=True, exist_ok=True)
    rest = [x for x in render_args if x != "--"]
    return subprocess.run([node, str(MOD / "render.mjs"), *rest], cwd=str(proj), env=env).returncode


if __name__ == "__main__":
    main_guard(main)
